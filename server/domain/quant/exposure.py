from flask import g
from database.models import Position, get_active_positions
from domain.quant.helpers import classify_asset_sector

def calculate_sector_exposure(session):
    """
    Calcula a exposição por setor da carteira de ativos do usuário logado.
    Retorna uma estrutura de dicionário aninhado: { Setor: { Ticker: ValorTotal } }
    """
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return {}

    positions = get_active_positions(session, user_id).all()

    exposure = {}
    for pos in positions:
        asset = pos.asset
        if not asset:
            continue

        qty = float(pos.quantity or 0)
        if qty <= 0:
            continue

        price = 0.0
        if asset.market_data:
            price = float(asset.market_data[0].price or 0)
        if price <= 0:
            price = float(pos.average_price or 0)

        total_value = qty * price
        ticker = asset.ticker.upper()
        category_name = asset.category.name if asset.category else 'Outros'

        sector = classify_asset_sector(ticker, category_name)

        if sector not in exposure:
            exposure[sector] = {}
        exposure[sector][ticker] = exposure[sector].get(ticker, 0.0) + total_value

    return exposure
