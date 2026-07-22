from datetime import datetime, date
import calendar
from decimal import Decimal
from typing import List, Dict, Any

from db.session import Session
from db.models import AssetTransaction, TaxProfile, Asset, Category

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
    Identifies day trades in the period and updates the is_day_trade flag.
    A Day Trade occurs when there is a BUY and a SELL of the same asset on the same day.
    """
    from sqlalchemy import func
    
    # Get all distinct dates with transactions in the period
    tx_dates = session.query(func.date(AssetTransaction.transaction_date)).filter(
        AssetTransaction.user_id == user_id,
        AssetTransaction.type.in_(["BUY", "SELL"]),
        func.date(AssetTransaction.transaction_date) >= start_date,
        func.date(AssetTransaction.transaction_date) <= end_date
    ).distinct().all()
    
    for (d,) in tx_dates:
        # Get all transactions for this day
        daily_txs = session.query(AssetTransaction).filter(
            AssetTransaction.user_id == user_id,
            func.date(AssetTransaction.transaction_date) == d,
            AssetTransaction.type.in_(["BUY", "SELL"])
        ).all()
        
        # Group by ticker
        by_ticker = {}
        for tx in daily_txs:
            if tx.ticker not in by_ticker:
                by_ticker[tx.ticker] = {"BUY": [], "SELL": []}
            by_ticker[tx.ticker][tx.type].append(tx)
            
        for ticker, txs in by_ticker.items():
            if txs["BUY"] and txs["SELL"]:
                for sell_tx in txs["SELL"]:
                    sell_tx.is_day_trade = True
                    
    session.flush()

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
            sale_value = tx.total_value
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
                    
        # Apply Isenção de 20k para Ações (Swing Trade)
        is_exempt_stocks_st = (sales_total_stocks <= Decimal("20000.0"))
        
        taxable_profit_stocks_st = Decimal("0.0")
        if profit_stocks_st < 0:
            profile.accumulated_loss_stocks_st += abs(profit_stocks_st)
        else:
            if not is_exempt_stocks_st:
                deduction = min(profit_stocks_st, profile.accumulated_loss_stocks_st)
                taxable_profit_stocks_st = profit_stocks_st - deduction
                profile.accumulated_loss_stocks_st -= deduction
                
        # Day Trade Ações
        taxable_profit_stocks_dt = Decimal("0.0")
        if profit_stocks_dt < 0:
            profile.accumulated_loss_stocks_dt += abs(profit_stocks_dt)
        else:
            deduction = min(profit_stocks_dt, profile.accumulated_loss_stocks_dt)
            taxable_profit_stocks_dt = profit_stocks_dt - deduction
            profile.accumulated_loss_stocks_dt -= deduction
            
        # FIIs
        taxable_profit_fiis = Decimal("0.0")
        if profit_fiis < 0:
            profile.accumulated_loss_fiis += abs(profit_fiis)
        else:
            deduction = min(profit_fiis, profile.accumulated_loss_fiis)
            taxable_profit_fiis = profit_fiis - deduction
            profile.accumulated_loss_fiis -= deduction
            
        # Calculate Tax
        tax_stocks_st = taxable_profit_stocks_st * Decimal("0.15")
        tax_stocks_dt = taxable_profit_stocks_dt * Decimal("0.20")
        tax_fiis = taxable_profit_fiis * Decimal("0.20")
        
        total_tax_month = tax_stocks_st + tax_stocks_dt + tax_fiis
        
        # DARF Rule (< R$ 10)
        total_tax_due = total_tax_month + profile.accumulated_darf_balance
        
        darf_to_pay = Decimal("0.0")
        if total_tax_due > 0:
            if total_tax_due < Decimal("10.0"):
                profile.accumulated_darf_balance = total_tax_due
            else:
                darf_to_pay = total_tax_due
                profile.accumulated_darf_balance = Decimal("0.0")
                
        session.commit()
        
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
                "previous_accumulated": float(total_tax_due - total_tax_month),
                "total_due": float(total_tax_due),
                "darf_to_pay": float(darf_to_pay),
                "next_month_accumulated": float(profile.accumulated_darf_balance)
            },
            "accumulated_losses": {
                "stocks_st": float(profile.accumulated_loss_stocks_st),
                "stocks_dt": float(profile.accumulated_loss_stocks_dt),
                "fiis": float(profile.accumulated_loss_fiis)
            },
            "details": details
        }
