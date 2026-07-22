import calendar
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import func

import json
from db.session import Session
from db.models import AssetTransaction, MonthlyPortfolioSnapshot, Asset, MarketData

def _get_historical_price(session, asset_id: int, target_date: date, price_cache: dict = None) -> Decimal:
    """Gets the closest price for an asset on or before target_date"""
    if price_cache and asset_id in price_cache:
        curr = target_date
        for _ in range(30):
            if curr in price_cache[asset_id]:
                return Decimal(str(price_cache[asset_id][curr]))
            curr -= timedelta(days=1)
            
    md = session.query(MarketData).filter(
        MarketData.asset_id == asset_id,
        func.date(MarketData.date) <= target_date
    ).order_by(MarketData.date.desc()).first()
    
    if md and md.price:
        return Decimal(md.price)
    return Decimal("0.0")

def generate_or_update_monthly_snapshot(session, user_id: int, year: int, month: int, price_cache: dict = None) -> MonthlyPortfolioSnapshot:
    last_day = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)
    
    # 1. Calculate Realized PnL (from SELL transactions in the month)
    sells = session.query(AssetTransaction).filter(
        AssetTransaction.user_id == user_id,
        AssetTransaction.type == "SELL",
        func.date(AssetTransaction.transaction_date) >= start_date,
        func.date(AssetTransaction.transaction_date) <= end_date
    ).all()
    
    realized_pnl = Decimal("0.0")
    for tx in sells:
        sale_value = Decimal(tx.total_value)
        cost = Decimal(tx.cost_basis or 0) * Decimal(tx.quantity)
        realized_pnl += (sale_value - cost)
        
    # 2. Reconstruct Portfolio at end_date
    txs = session.query(AssetTransaction, Asset).join(
        Asset, AssetTransaction.ticker == Asset.ticker
    ).filter(
        AssetTransaction.user_id == user_id,
        func.date(AssetTransaction.transaction_date) <= end_date
    ).order_by(AssetTransaction.transaction_date).all()
    
    portfolio = {}
    asset_map = {}
    for tx, asset in txs:
        asset_map[asset.id] = asset.ticker
        if asset.id not in portfolio:
            portfolio[asset.id] = {
                "quantity": Decimal("0.0"),
                "total_cost": Decimal("0.0"),
            }
        pos = portfolio[asset.id]
        
        if tx.type == "BUY":
            pos["quantity"] += Decimal(tx.quantity)
            pos["total_cost"] += Decimal(tx.total_value)
        elif tx.type == "SELL":
            if pos["quantity"] > 0:
                avg_price = pos["total_cost"] / pos["quantity"]
                pos["quantity"] -= Decimal(tx.quantity)
                pos["total_cost"] -= (avg_price * Decimal(tx.quantity))
                if pos["quantity"] <= Decimal("0.0001"):
                    pos["quantity"] = Decimal("0.0")
                    pos["total_cost"] = Decimal("0.0")

    # 3. Calculate Total Invested and Total Market Value
    total_invested_cost = Decimal("0.0")
    total_market_value = Decimal("0.0")
    asset_performances = []
    
    for asset_id, pos in portfolio.items():
        if pos["quantity"] > 0:
            total_invested_cost += pos["total_cost"]
            price = _get_historical_price(session, asset_id, end_date, price_cache)
            if price == Decimal("0.0"):
                price = pos["total_cost"] / pos["quantity"]
            total_market_value += (pos["quantity"] * price)
            
            # Approximate month variation for this asset
            price_start = _get_historical_price(session, asset_id, start_date - timedelta(days=1), price_cache)
            if price_start == Decimal("0.0"):
                price_start = pos["total_cost"] / pos["quantity"]
            
            variation = float((price - price_start) * pos["quantity"])
            if variation != 0:
                asset_performances.append({
                    "ticker": asset_map[asset_id],
                    "variation": variation
                })
            
    unrealized_pnl = total_market_value - total_invested_cost

    # Sort performances
    asset_performances.sort(key=lambda x: x["variation"])
    top_losers = [p for p in asset_performances[:3] if p["variation"] < 0]
    top_gainers = [p for p in asset_performances[-3:] if p["variation"] > 0]
    top_gainers.reverse()
    
    asset_performance_json = json.dumps({
        "gainers": top_gainers,
        "losers": top_losers
    })

    # 4. Upsert Snapshot
    snapshot = session.query(MonthlyPortfolioSnapshot).filter_by(
        user_id=user_id, year=year, month=month
    ).first()
    
    if not snapshot:
        snapshot = MonthlyPortfolioSnapshot(
            user_id=user_id,
            year=year,
            month=month
        )
        session.add(snapshot)
        
    snapshot.total_invested_cost = total_invested_cost
    snapshot.total_market_value = total_market_value
    snapshot.realized_pnl = realized_pnl
    snapshot.unrealized_pnl = unrealized_pnl
    snapshot.asset_performance = asset_performance_json
    
    session.flush()
    return snapshot

def get_monthly_evolution_series(session, user_id: int):
    """
    Returns the monthly evolution series.
    Lazy loads missing months from the first transaction up to current month.
    """
    from datetime import date
    
    first_tx = session.query(func.min(AssetTransaction.transaction_date)).filter(
        AssetTransaction.user_id == user_id
    ).scalar()
    
    if not first_tx:
        return []
        
    start_date = first_tx.date()
    start_year = start_date.year
    start_month = start_date.month
    
    today = date.today()
    end_year = today.year
    end_month = today.month
    
    # Generate list of required (year, month) pairs
    required_months = []
    y, m = start_year, start_month
    while y < end_year or (y == end_year and m <= end_month):
        required_months.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
            
    # Fetch existing snapshots
    existing_snapshots = session.query(MonthlyPortfolioSnapshot).filter(
        MonthlyPortfolioSnapshot.user_id == user_id
    ).all()
    
    existing_map = {(s.year, s.month): s for s in existing_snapshots}
    
    results = []
    previous_unrealized = 0.0
    previous_realized = 0.0
    for y, m in required_months:
        if (y, m) not in existing_map:
            # Lazy load missing month
            snap = generate_or_update_monthly_snapshot(session, user_id, y, m)
            session.commit() # Commit the new snapshot
            existing_map[(y, m)] = snap
            
        snap = existing_map[(y, m)]
        current_unrealized = float(snap.unrealized_pnl or 0.0)
        current_realized = float(snap.realized_pnl or 0.0)
        
        # A variação do mês é a diferença do não realizado somado à diferença do realizado
        month_variation = (current_unrealized - previous_unrealized) + (current_realized - previous_realized)
        
        previous_unrealized = current_unrealized
        previous_realized = current_realized

        results.append({
            "year": snap.year,
            "month": snap.month,
            "period": f"{snap.month:02d}/{snap.year}",
            "total_invested_cost": float(snap.total_invested_cost),
            "total_market_value": float(snap.total_market_value),
            "realized_pnl": float(snap.realized_pnl),
            "unrealized_pnl": current_unrealized,
            "month_variation": month_variation,
            "asset_performance": json.loads(snap.asset_performance) if snap.asset_performance else None
        })
        
    return results

from sqlalchemy import event

@event.listens_for(AssetTransaction, 'after_insert')
@event.listens_for(AssetTransaction, 'after_update')
@event.listens_for(AssetTransaction, 'after_delete')
def invalidate_snapshots_on_transaction_change(mapper, connection, target):
    tx_date = target.transaction_date
    if not tx_date:
        return
        
    year = tx_date.year
    month = tx_date.month
    
    # Delete snapshots for this month and onwards
    connection.execute(
        MonthlyPortfolioSnapshot.__table__.delete().where(
            (MonthlyPortfolioSnapshot.user_id == target.user_id) &
            (
                (MonthlyPortfolioSnapshot.year > year) |
                ((MonthlyPortfolioSnapshot.year == year) & (MonthlyPortfolioSnapshot.month >= month))
            )
        )
    )
