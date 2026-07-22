import calendar
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import func
from db.session import Session, engine
from db.models import AssetTransaction, MonthlyPortfolioSnapshot, Asset, MarketData
from domain.portfolio.monthly_snapshot import _get_historical_price

with Session() as session:
    user_id = 6
    year, month = 2023, 5
    last_day = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)
    
    txs = session.query(AssetTransaction, Asset).join(Asset, AssetTransaction.ticker == Asset.ticker).filter(
        AssetTransaction.user_id == user_id,
        func.date(AssetTransaction.transaction_date) <= end_date
    ).order_by(AssetTransaction.transaction_date).all()
    
    portfolio = {}
    for tx, asset in txs:
        if asset.id not in portfolio:
            portfolio[asset.id] = {'quantity': Decimal('0.0'), 'total_cost': Decimal('0.0'), 'ticker': asset.ticker}
        pos = portfolio[asset.id]
        if tx.type == 'BUY':
            pos['quantity'] += Decimal(tx.quantity)
            pos['total_cost'] += Decimal(tx.total_value)
        elif tx.type == 'SELL' and pos['quantity'] > 0:
            avg = pos['total_cost'] / pos['quantity']
            pos['quantity'] -= Decimal(tx.quantity)
            pos['total_cost'] -= (avg * Decimal(tx.quantity))
            
    for asset_id, pos in portfolio.items():
        if pos['quantity'] > 0:
            price_end = _get_historical_price(session, asset_id, end_date)
            price_start = _get_historical_price(session, asset_id, start_date - timedelta(days=1))
            print(f"{pos['ticker']}: QTY={pos['quantity']}, START={price_start}, END={price_end}, COST={pos['total_cost']/pos['quantity']}")
