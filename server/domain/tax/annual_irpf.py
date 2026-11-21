from datetime import date, datetime
from decimal import Decimal
from typing import Dict, Any

from sqlalchemy import func

from db.session import Session
from db.models import AssetTransaction, Asset, Category, Dividend, Position
from utils.ticker_helper import extract_option_meta


_TX_ORDER = {
    "BUY": 0,
    "TICKER_CHANGE_IN": 0,
    "SPIN_OFF_RECEIPT": 0,
    "BONUS": 0,
    "SPLIT": 1,
    "INPLIT": 1,
    "SPIN_OFF": 1,
    "AMORTIZATION": 1,
    "SELL": 2,
    "TICKER_CHANGE_OUT": 2,
}

_UNIT_BY_CATEGORY = {
    "FII": "cotas",
    "Renda Fixa": "títulos",
    "Reserva": "aplicações",
    "Cripto": "unidades",
    "Opções": "contratos",
}


def _get_bens_e_direitos(session, user_id: int, year: int) -> list:
    """Reconstruct portfolio at 31/12 of the given year"""
    end_of_year = date(year, 12, 31)

    txs = session.query(AssetTransaction, Asset, Category).join(
        Asset, AssetTransaction.ticker == Asset.ticker
    ).join(
        Category, Asset.category_id == Category.id
    ).filter(
        AssetTransaction.user_id == user_id,
        func.date(AssetTransaction.transaction_date) <= end_of_year
    ).order_by(AssetTransaction.transaction_date, AssetTransaction.id).all()

    txs.sort(key=lambda row: (
        row[0].transaction_date.date() if isinstance(row[0].transaction_date, datetime) else row[0].transaction_date,
        _TX_ORDER.get(row[0].type, 1),
        row[0].id or 0,
    ))

    portfolio = {}
    for tx, asset, category in txs:
        if tx.ticker not in portfolio:
            portfolio[tx.ticker] = {
                "ticker": tx.ticker,
                "name": asset.name or tx.ticker,
                "cnpj": asset.cnpj or "CNPJ não informado",
                "category": category.name,
                "quantity": Decimal("0.0"),
                "total_cost": Decimal("0.0"),
            }

        pos = portfolio[tx.ticker]

        if tx.type in ("BUY", "TICKER_CHANGE_IN", "SPIN_OFF_RECEIPT", "BONUS"):
            pos["quantity"] += tx.quantity
            pos["total_cost"] += tx.total_value
        elif tx.type in ("SPLIT", "INPLIT"):
            # SPLIT/INPLIT records store the resulting total quantity; cost basis is unchanged
            pos["quantity"] = tx.quantity
        elif tx.type == "AMORTIZATION":
            pos["total_cost"] = max(Decimal("0.0"), pos["total_cost"] - tx.total_value)
        elif tx.type in ("SELL", "TICKER_CHANGE_OUT"):
            if pos["quantity"] > 0:
                avg_price = pos["total_cost"] / pos["quantity"]
                pos["quantity"] -= tx.quantity
                pos["total_cost"] -= (avg_price * tx.quantity)
                if pos["quantity"] <= Decimal("0.0001"):
                    pos["quantity"] = Decimal("0.0")
                    pos["total_cost"] = Decimal("0.0")

    # For current/future year, include manual positions without AssetTransactions (e.g. Reserva / Caixinhas)
    if year >= date.today().year:
        tx_tickers = set(portfolio.keys())
        manual_positions = (
            session.query(Position, Asset, Category)
            .join(Asset, Position.asset_id == Asset.id)
            .join(Category, Asset.category_id == Category.id)
            .filter(Position.user_id == user_id, Position.quantity > 0)
            .all()
        )
        for p, asset, category in manual_positions:
            if asset.ticker not in tx_tickers:
                qty = Decimal(str(p.quantity))
                pm = Decimal(str(p.average_price or 0))
                portfolio[asset.ticker] = {
                    "ticker": asset.ticker,
                    "name": asset.name or asset.ticker,
                    "cnpj": asset.cnpj or "CNPJ não informado",
                    "category": category.name,
                    "quantity": qty,
                    "total_cost": qty * pm,
                }

    result = []
    for ticker, pos in portfolio.items():
        if pos["quantity"] > Decimal("0.0001"):
            qty = float(pos["quantity"])
            total_cost = max(0.0, float(pos["total_cost"]))
            avg_price = total_cost / qty if qty > 0 else 0.0

            asset_type_str = _UNIT_BY_CATEGORY.get(pos["category"], "ações")

            desc = f"{int(qty) if qty.is_integer() else qty} {asset_type_str} de {ticker} ({pos['name']}), CNPJ: {pos['cnpj']}, adquiridas ao custo total de R$ {total_cost:,.2f} (Preço Médio de R$ {avg_price:,.2f})."
            desc = desc.replace(",", "X").replace(".", ",").replace("X", ".")

            result.append({
                "ticker": ticker,
                "name": pos["name"],
                "cnpj": pos["cnpj"],
                "category": pos["category"],
                "quantity": qty,
                "total_cost": total_cost,
                "average_price": avg_price,
                "description": desc
            })

    return sorted(result, key=lambda x: (x["category"], x["ticker"]))


def calculate_annual_irpf(user_id: int, year: int) -> Dict[str, Any]:
    with Session() as session:
        # 1. Bens e Direitos
        bens_e_direitos = _get_bens_e_direitos(session, user_id, year)
        
        # 2. Rendimentos (Dividendos e JCP)
        start_of_year = date(year, 1, 1)
        end_of_year = date(year, 12, 31)
        
        divs = session.query(Dividend).filter(
            Dividend.user_id == user_id,
            func.date(Dividend.date_payment) >= start_of_year,
            func.date(Dividend.date_payment) <= end_of_year
        ).all()
        
        # O banco de dados atual não possui separação entre JCP e Dividendo na tabela Dividend.
        # Portanto, assumiremos tudo como Dividendo provisoriamente.
        total_dividends = sum(float(d.total_value) for d in divs)
        total_jcp = 0.0
        
        # 3. Renda Variável (Mês a Mês) and Lucros Isentos
        from domain.tax.tax_engine import get_or_create_tax_profile, _detect_day_trades
        profile = get_or_create_tax_profile(session, user_id)
        
        # Load starting losses 
        loss_st = Decimal(profile.accumulated_loss_stocks_st)
        loss_dt = Decimal(profile.accumulated_loss_stocks_dt)
        loss_fii = Decimal(profile.accumulated_loss_fiis)
        
        monthly_results = []
        total_isentos_vendas = 0.0
        
        _detect_day_trades(session, user_id, start_of_year, end_of_year)
        
        sells = session.query(AssetTransaction, Asset, Category).join(
            Asset, AssetTransaction.ticker == Asset.ticker
        ).join(
            Category, Asset.category_id == Category.id
        ).filter(
            AssetTransaction.user_id == user_id,
            AssetTransaction.type == "SELL",
            func.date(AssetTransaction.transaction_date) >= start_of_year,
            func.date(AssetTransaction.transaction_date) <= end_of_year
        ).all()
        
        sells_by_month = {m: [] for m in range(1, 13)}
        for tx, asset, category in sells:
            sells_by_month[tx.transaction_date.month].append((tx, asset, category))
            
        for month in range(1, 13):
            month_sells = sells_by_month[month]
            
            sales_total_stocks = Decimal("0.0")
            profit_st = Decimal("0.0")
            profit_dt = Decimal("0.0")
            profit_fii = Decimal("0.0")
            
            irrf_st = Decimal("0.0")
            irrf_dt = Decimal("0.0")
            irrf_fii = Decimal("0.0")
            
            for tx, asset, category in month_sells:
                sale_value = tx.total_value or Decimal("0.0")
                if sale_value <= Decimal("0.0") and not getattr(tx, "is_option", False) and not extract_option_meta(tx.ticker):
                    continue
                cost_value = (tx.cost_basis or Decimal("0.0")) * tx.quantity
                profit = sale_value - cost_value
                
                is_fii = (category.name == "FII")
                is_dt = tx.is_day_trade
                
                if is_fii:
                    profit_fii += profit
                    irrf_fii += sale_value * Decimal("0.00005")
                else:
                    sales_total_stocks += sale_value
                    if is_dt:
                        profit_dt += profit
                        if profit > 0:
                            irrf_dt += profit * Decimal("0.01")
                    else:
                        profit_st += profit
                        
            is_exempt_stocks_st = (sales_total_stocks <= Decimal("20000.0"))
            
            if not is_exempt_stocks_st:
                irrf_st = sales_total_stocks * Decimal("0.00005")
            
            taxable_st = Decimal("0.0")
            if profit_st < 0:
                loss_st += abs(profit_st)
            else:
                if not is_exempt_stocks_st:
                    deduction = min(profit_st, loss_st)
                    taxable_st = profit_st - deduction
                    loss_st -= deduction
                else:
                    total_isentos_vendas += float(profit_st)
                    
            taxable_dt = Decimal("0.0")
            if profit_dt < 0:
                loss_dt += abs(profit_dt)
            else:
                deduction = min(profit_dt, loss_dt)
                taxable_dt = profit_dt - deduction
                loss_dt -= deduction
                
            taxable_fii = Decimal("0.0")
            if profit_fii < 0:
                loss_fii += abs(profit_fii)
            else:
                deduction = min(profit_fii, loss_fii)
                taxable_fii = profit_fii - deduction
                loss_fii -= deduction
                
            tax_st = taxable_st * Decimal("0.15")
            tax_dt = taxable_dt * Decimal("0.20")
            tax_fii = taxable_fii * Decimal("0.20")
            
            monthly_results.append({
                "month": month,
                "profit_st": float(profit_st),
                "profit_dt": float(profit_dt),
                "profit_fii": float(profit_fii),
                "tax_due": float(tax_st + tax_dt + tax_fii),
                "irrf_st": float(irrf_st),
                "irrf_dt": float(irrf_dt),
                "irrf_fii": float(irrf_fii),
                "is_exempt_st": is_exempt_stocks_st
            })

        return {
            "year": year,
            "bens_e_direitos": bens_e_direitos,
            "rendimentos_isentos": {
                "dividendos": total_dividends,
                "lucro_vendas_20k": total_isentos_vendas,
                "total": total_dividends + total_isentos_vendas
            },
            "rendimentos_exclusivos": {
                "jcp": total_jcp,
                "total": total_jcp
            },
            "renda_variavel": monthly_results
        }
