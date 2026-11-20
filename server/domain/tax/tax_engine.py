from datetime import datetime, date
import calendar
from decimal import Decimal
from typing import List, Dict, Any, Optional

from db.session import Session
from db.models import AssetTransaction, TaxProfile, Asset, Category
from utils.ticker_helper import extract_option_meta

def get_or_create_tax_profile(session, user_id: int) -> TaxProfile:
    profile = session.query(TaxProfile).filter_by(user_id=user_id).first()
    if not profile:
        profile = TaxProfile(
            user_id=user_id,
            accumulated_loss_stocks_st=Decimal("0.0"),
            accumulated_loss_stocks_dt=Decimal("0.0"),
            accumulated_loss_fiis=Decimal("0.0"),
            accumulated_darf_balance=Decimal("0.0")
        )
        session.add(profile)
        session.flush()
    return profile

def _detect_day_trades(session, user_id: int, start_date: date, end_date: date):
    """
    Identifies day trades in the period in a single query and flags matching SELL transactions.
    A Day Trade occurs when there is a BUY and a SELL of the same asset on the same day.
    """
    from sqlalchemy import func

    daily_txs = session.query(AssetTransaction).filter(
        AssetTransaction.user_id == user_id,
        AssetTransaction.type.in_(["BUY", "SELL"]),
        func.date(AssetTransaction.transaction_date) >= start_date,
        func.date(AssetTransaction.transaction_date) <= end_date,
    ).all()

    by_day_ticker = {}
    for tx in daily_txs:
        tx_dt = tx.transaction_date
        day_key = tx_dt.date() if hasattr(tx_dt, 'date') else str(tx_dt)[:10]
        bucket = by_day_ticker.setdefault((tx.ticker, day_key), {"BUY": [], "SELL": []})
        bucket[tx.type].append(tx)

    for bucket in by_day_ticker.values():
        if bucket["BUY"] and bucket["SELL"]:
            for sell_tx in bucket["SELL"]:
                sell_tx.is_day_trade = True

def calculate_monthly_darf(user_id: int, month: int, year: int) -> Dict[str, Any]:
    start_date = date(year, month, 1)
    end_date = date(year, month, calendar.monthrange(year, month)[1])
    
    # Needs to import from session to avoid db.database error
    from db.session import Session
    with Session() as session:
        profile = get_or_create_tax_profile(session, user_id)
        
        # 1. Detect Day Trades first
        _detect_day_trades(session, user_id, start_date, end_date)
        
        # 2. Get all SELL transactions in the month
        from sqlalchemy import func
        sells = session.query(AssetTransaction, Asset, Category).join(
            Asset, AssetTransaction.ticker == Asset.ticker
        ).join(
            Category, Asset.category_id == Category.id
        ).filter(
            AssetTransaction.user_id == user_id,
            AssetTransaction.type == "SELL",
            func.date(AssetTransaction.transaction_date) >= start_date,
            func.date(AssetTransaction.transaction_date) <= end_date
        ).all()
        
        # Tracking buckets
        sales_total_stocks = Decimal("0.0")
        
        profit_stocks_st = Decimal("0.0")
        profit_stocks_dt = Decimal("0.0")
        profit_fiis = Decimal("0.0")
        
        details = []
        
        for tx, asset, category in sells:
            sale_value = tx.total_value or Decimal("0.0")
            if sale_value <= Decimal("0.0") and not getattr(tx, "is_option", False) and not extract_option_meta(tx.ticker):
                continue
            cost_value = (tx.cost_basis or Decimal("0.0")) * tx.quantity
            profit = sale_value - cost_value
            
            is_fii = (category.name == "FII")
            is_dt = tx.is_day_trade
            
            tx_detail = {
                "id": tx.id,
                "ticker": tx.ticker,
                "date": tx.transaction_date.isoformat(),
                "quantity": float(tx.quantity),
                "sale_value": float(sale_value),
                "cost_value": float(cost_value),
                "profit": float(profit),
                "is_fii": is_fii,
                "is_day_trade": is_dt
            }
            details.append(tx_detail)
            
            if is_fii:
                profit_fiis += profit
            else:
                sales_total_stocks += sale_value
                if is_dt:
                    profit_stocks_dt += profit
                else:
                    profit_stocks_st += profit
                    
        # Apply Isenção de 20k para Ações (Swing Trade) — cálculo idempotente em memória
        loss_stocks_st = Decimal(str(profile.accumulated_loss_stocks_st or 0))
        loss_stocks_dt = Decimal(str(profile.accumulated_loss_stocks_dt or 0))
        loss_fiis = Decimal(str(profile.accumulated_loss_fiis or 0))
        prev_darf_balance = Decimal(str(profile.accumulated_darf_balance or 0))

        is_exempt_stocks_st = (sales_total_stocks <= Decimal("20000.0"))
        
        taxable_profit_stocks_st = Decimal("0.0")
        if profit_stocks_st < 0:
            loss_stocks_st += abs(profit_stocks_st)
        else:
            if not is_exempt_stocks_st:
                deduction = min(profit_stocks_st, loss_stocks_st)
                taxable_profit_stocks_st = profit_stocks_st - deduction
                loss_stocks_st -= deduction
                
        # Day Trade Ações
        taxable_profit_stocks_dt = Decimal("0.0")
        if profit_stocks_dt < 0:
            loss_stocks_dt += abs(profit_stocks_dt)
        else:
            deduction = min(profit_stocks_dt, loss_stocks_dt)
            taxable_profit_stocks_dt = profit_stocks_dt - deduction
            loss_stocks_dt -= deduction
            
        # FIIs
        taxable_profit_fiis = Decimal("0.0")
        if profit_fiis < 0:
            loss_fiis += abs(profit_fiis)
        else:
            deduction = min(profit_fiis, loss_fiis)
            taxable_profit_fiis = profit_fiis - deduction
            loss_fiis -= deduction
            
        # Calculate Tax
        tax_stocks_st = taxable_profit_stocks_st * Decimal("0.15")
        tax_stocks_dt = taxable_profit_stocks_dt * Decimal("0.20")
        tax_fiis = taxable_profit_fiis * Decimal("0.20")
        
        total_tax_month = tax_stocks_st + tax_stocks_dt + tax_fiis
        
        # DARF Rule (< R$ 10)
        total_tax_due = total_tax_month + prev_darf_balance
        
        darf_to_pay = Decimal("0.0")
        next_month_darf = prev_darf_balance
        if total_tax_due > 0:
            if total_tax_due < Decimal("10.0"):
                next_month_darf = total_tax_due
            else:
                darf_to_pay = total_tax_due
                next_month_darf = Decimal("0.0")
        
        return {
            "period": f"{year}-{month:02d}",
            "sales_total_stocks": float(sales_total_stocks),
            "is_exempt_stocks_st": is_exempt_stocks_st,
            "profits": {
                "stocks_st": float(profit_stocks_st),
                "stocks_dt": float(profit_stocks_dt),
                "fiis": float(profit_fiis)
            },
            "taxable_profits": {
                "stocks_st": float(taxable_profit_stocks_st),
                "stocks_dt": float(taxable_profit_stocks_dt),
                "fiis": float(taxable_profit_fiis)
            },
            "taxes": {
                "stocks_st": float(tax_stocks_st),
                "stocks_dt": float(tax_stocks_dt),
                "fiis": float(tax_fiis)
            },
            "darf": {
                "month_tax": float(total_tax_month),
                "previous_accumulated": float(prev_darf_balance),
                "total_due": float(total_tax_due),
                "darf_to_pay": float(darf_to_pay),
                "next_month_accumulated": float(next_month_darf)
            },
            "accumulated_losses": {
                "stocks_st": float(loss_stocks_st),
                "stocks_dt": float(loss_stocks_dt),
                "fiis": float(loss_fiis)
            },
            "details": details
        }


def simulate_sell_impact(
    session,
    user_id: int,
    sales: List[Dict[str, Any]],
    month: Optional[int] = None,
    year: Optional[int] = None,
    usd_rate: float = 5.5,
) -> Dict[str, Any]:
    """
    Simula o impacto tributário (DARF, quebra de isenção R$ 20k, compensação de prejuízo),
    rebalanceamento de pesos e oportunidades de Tax-Loss Harvesting sem gravar no banco.
    """
    from db.models import get_active_positions

    today = date.today()
    month = month or today.month
    year = year or today.year

    baseline = calculate_monthly_darf(user_id, month, year)
    profile = get_or_create_tax_profile(session, user_id)

    base_loss_stocks_st = float(profile.accumulated_loss_stocks_st or 0.0)
    base_loss_stocks_dt = float(profile.accumulated_loss_stocks_dt or 0.0)
    base_loss_fiis = float(profile.accumulated_loss_fiis or 0.0)
    prev_darf_balance = float(profile.accumulated_darf_balance or 0.0)

    positions = get_active_positions(session, user_id).all()
    pos_by_ticker = {}
    portfolio_rows = []
    total_before = 0.0

    for pos in positions:
        asset = pos.asset
        if not asset or not pos.quantity or float(pos.quantity) <= 0:
            continue
        ticker = asset.ticker.upper()
        cat_name = asset.category.name if asset.category else "Outros"
        fx = float(usd_rate) if asset.currency == "USD" else 1.0
        mdata = asset.market_data[0] if asset.market_data else None
        price_native = float(mdata.price) if (mdata and mdata.price) else float(pos.average_price or 0.0)
        avg_native = float(pos.average_price or 0.0)
        qty = float(pos.quantity)
        val_brl = qty * price_native * fx
        total_before += val_brl
        row = {
            "ticker": ticker,
            "category": cat_name,
            "quantity": qty,
            "price_brl": price_native * fx,
            "avg_price_brl": avg_native * fx,
            "value_brl": val_brl,
        }
        pos_by_ticker[ticker] = row
        portfolio_rows.append(row)

    # Normaliza solicitações de venda (permite múltiplos tickers)
    sold_qty_by_ticker: Dict[str, float] = {}
    simulated_items = []
    sim_stock_sales = 0.0
    sim_profit_stocks_st = 0.0
    sim_profit_fiis = 0.0
    sim_crypto_sales = 0.0
    sim_profit_crypto = 0.0
    sim_intl_profit = 0.0
    proceeds_total = 0.0

    for req_sale in sales or []:
        ticker = str(req_sale.get("ticker", "")).strip().upper()
        if not ticker or ticker not in pos_by_ticker:
            continue
        row = pos_by_ticker[ticker]
        req_qty = float(req_sale.get("quantity") or 0.0)
        qty_sell = max(0.0, min(req_qty, row["quantity"] - sold_qty_by_ticker.get(ticker, 0.0)))
        if qty_sell <= 0:
            continue

        unit_price_brl = float(req_sale["unit_price"]) if req_sale.get("unit_price") else row["price_brl"]
        gross_proceeds = qty_sell * unit_price_brl
        cost_value = qty_sell * row["avg_price_brl"]
        gain_loss = gross_proceeds - cost_value

        sold_qty_by_ticker[ticker] = sold_qty_by_ticker.get(ticker, 0.0) + qty_sell
        proceeds_total += gross_proceeds

        cat = row["category"]
        if cat == "FII":
            sim_profit_fiis += gain_loss
        elif cat == "Ação":
            sim_stock_sales += gross_proceeds
            sim_profit_stocks_st += gain_loss
        elif cat == "Cripto":
            sim_crypto_sales += gross_proceeds
            sim_profit_crypto += gain_loss
        elif cat == "Internacional":
            sim_intl_profit += gain_loss

        simulated_items.append({
            "ticker": ticker,
            "category": cat,
            "quantity_sold": round(qty_sell, 4),
            "remaining_quantity": round(row["quantity"] - sold_qty_by_ticker[ticker], 4),
            "unit_price": round(unit_price_brl, 2),
            "avg_price": round(row["avg_price_brl"], 2),
            "gross_proceeds": round(gross_proceeds, 2),
            "gain_loss": round(gain_loss, 2),
        })

    # Recomputa tributação mensal consolidada (vendas já executadas + simuladas)
    existing_stock_sales = float(baseline["sales_total_stocks"])
    existing_profit_st = float(baseline["profits"]["stocks_st"])
    existing_profit_dt = float(baseline["profits"]["stocks_dt"])
    existing_profit_fiis = float(baseline["profits"]["fiis"])

    total_month_stock_sales = existing_stock_sales + sim_stock_sales
    is_exempt_stocks_after = total_month_stock_sales <= 20000.0
    total_profit_st = existing_profit_st + sim_profit_stocks_st
    taxable_st = 0.0
    if total_profit_st > 0 and not is_exempt_stocks_after:
        taxable_st = max(0.0, total_profit_st - base_loss_stocks_st)
    tax_st_after = taxable_st * 0.15

    taxable_dt = max(0.0, existing_profit_dt - base_loss_stocks_dt) if existing_profit_dt > 0 else 0.0
    tax_dt_after = taxable_dt * 0.20

    total_profit_fiis = existing_profit_fiis + sim_profit_fiis
    taxable_fiis = max(0.0, total_profit_fiis - base_loss_fiis) if total_profit_fiis > 0 else 0.0
    tax_fiis_after = taxable_fiis * 0.20

    tax_crypto_after = 0.0
    if sim_crypto_sales > 35000.0 and sim_profit_crypto > 0:
        tax_crypto_after = sim_profit_crypto * 0.15

    month_tax_before = float(baseline["darf"]["month_tax"])
    month_tax_after = tax_st_after + tax_dt_after + tax_fiis_after + tax_crypto_after
    darf_before = float(baseline["darf"]["darf_to_pay"])
    total_due_after = month_tax_after + prev_darf_balance
    darf_after = total_due_after if total_due_after >= 10.0 else 0.0
    estimated_darf_delta = max(0.0, month_tax_after - month_tax_before)

    # Pesos antes vs. depois na carteira
    total_after = max(0.0, total_before - proceeds_total)
    rebalance_impact = []
    for row in sorted(portfolio_rows, key=lambda r: r["value_brl"], reverse=True):
        ticker = row["ticker"]
        sold_val = sold_qty_by_ticker.get(ticker, 0.0) * row["price_brl"]
        after_val = max(0.0, row["value_brl"] - sold_val)
        w_before = (row["value_brl"] / total_before * 100.0) if total_before > 0 else 0.0
        w_after = (after_val / total_after * 100.0) if total_after > 0 else 0.0
        if sold_val > 0 or w_before >= 3.0:
            rebalance_impact.append({
                "ticker": ticker,
                "category": row["category"],
                "weight_before_pct": round(w_before, 2),
                "weight_after_pct": round(w_after, 2),
                "delta_pp": round(w_after - w_before, 2),
            })

    # Sugestões de Tax-Loss Harvesting (F5)
    harvesting_candidates = []
    for row in portfolio_rows:
        ticker = row["ticker"]
        cat = row["category"]
        if cat not in ("Ação", "FII"):
            continue
        remaining_qty = row["quantity"] - sold_qty_by_ticker.get(ticker, 0.0)
        if remaining_qty <= 0 or row["avg_price_brl"] <= 0:
            continue
        unrealized_pnl = (row["price_brl"] - row["avg_price_brl"]) * remaining_qty
        if unrealized_pnl >= -50.0:
            continue
        loss_abs = abs(unrealized_pnl)
        loss_pct = ((row["price_brl"] / row["avg_price_brl"]) - 1.0) * 100.0
        if cat == "FII":
            tax_rate = 0.20
            offsettable = taxable_fiis if taxable_fiis > 0 else loss_abs
        else:
            tax_rate = 0.15
            offsettable = taxable_st if taxable_st > 0 else loss_abs
        potential_savings = min(loss_abs, offsettable) * tax_rate
        harvesting_candidates.append({
            "ticker": ticker,
            "category": cat,
            "quantity": round(remaining_qty, 4),
            "avg_price": round(row["avg_price_brl"], 2),
            "current_price": round(row["price_brl"], 2),
            "unrealized_loss": round(unrealized_pnl, 2),
            "unrealized_loss_pct": round(loss_pct, 2),
            "tax_bucket": "FIIs (20%)" if cat == "FII" else "Ações (15%)",
            "potential_tax_savings": round(potential_savings, 2),
        })

    harvesting_candidates.sort(key=lambda c: c["unrealized_loss"])

    return {
        "status": "Sucesso",
        "period": f"{year}-{month:02d}",
        "proceeds_total": round(proceeds_total, 2),
        "simulated_items": simulated_items,
        "tax_impact": {
            "existing_stock_sales": round(existing_stock_sales, 2),
            "simulated_stock_sales": round(sim_stock_sales, 2),
            "total_month_stock_sales": round(total_month_stock_sales, 2),
            "stock_exemption_limit": 20000.0,
            "remaining_exemption": round(max(0.0, 20000.0 - total_month_stock_sales), 2),
            "breaks_20k_exemption": bool(existing_stock_sales <= 20000.0 and total_month_stock_sales > 20000.0),
            "is_exempt_stocks_after": is_exempt_stocks_after,
            "month_tax_before": round(month_tax_before, 2),
            "month_tax_after": round(month_tax_after, 2),
            "darf_before": round(darf_before, 2),
            "darf_after": round(darf_after, 2),
            "estimated_darf_delta": round(estimated_darf_delta, 2),
            "net_proceeds_after_tax": round(proceeds_total - estimated_darf_delta, 2),
            "breakdown": {
                "stocks_st_tax": round(tax_st_after, 2),
                "stocks_dt_tax": round(tax_dt_after, 2),
                "fiis_tax": round(tax_fiis_after, 2),
                "crypto_tax": round(tax_crypto_after, 2),
                "intl_estimated_gain": round(sim_intl_profit, 2),
            },
            "accumulated_losses_available": {
                "stocks_st": round(base_loss_stocks_st, 2),
                "stocks_dt": round(base_loss_stocks_dt, 2),
                "fiis": round(base_loss_fiis, 2),
            },
        },
        "rebalance_impact": rebalance_impact[:10],
        "tax_loss_harvesting": harvesting_candidates[:6],
    }
