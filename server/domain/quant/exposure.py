from flask import g
from database.models import Position, Asset, Category

def calculate_sector_exposure(session):
    """
    Calcula a exposição por setor da carteira de ativos do usuário logado.
    Retorna uma estrutura de dicionário aninhado: { Setor: { Ticker: ValorTotal } }
    """
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return {}

    # Carrega posições com relacionamentos necessários pré-carregados (join/joinedload)
    # para evitar consultas adicionais de N+1 no loop
    from sqlalchemy.orm import joinedload
    positions = (
        session.query(Position)
        .filter_by(user_id=user_id)
        .options(
            joinedload(Position.asset).joinedload(Asset.category),
            joinedload(Position.asset).selectinload(Asset.market_data)
        )
        .all()
    )

    SECTOR_MAP = {
        'VALE3': 'Materiais Básicos',
        'PETR4': 'Petróleo e Gás',
        'PETR3': 'Petróleo e Gás',
        'ITUB4': 'Financeiro',
        'ITUB3': 'Financeiro',
        'BBDC4': 'Financeiro',
        'BBDC3': 'Financeiro',
        'BBAS3': 'Financeiro',
        'SANB11': 'Financeiro',
        'WEGE3': 'Bens Industriais',
        'EGIE3': 'Utilidade Pública',
        'TAEE11': 'Utilidade Pública',
        'ALUP11': 'Utilidade Pública',
        'TRPL4': 'Utilidade Pública',
        'MGLU3': 'Consumo Cíclico',
        'VIIA3': 'Consumo Cíclico',
        'BHIA3': 'Consumo Cíclico',
        'LREN3': 'Consumo Cíclico',
        'ABEV3': 'Consumo Não Cíclico',
    }

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

        if category_name == 'Ação':
            sector = SECTOR_MAP.get(ticker, 'Outros - Ações')
        elif category_name == 'FII':
            sector = 'Fundos Imobiliários'
        elif category_name == 'Cripto':
            sector = 'Criptoativos'
        elif category_name in ('Renda Fixa', 'Reserva'):
            sector = 'Renda Fixa'
        elif category_name == 'Internacional':
            sector = 'Ativos Globais'
        else:
            sector = category_name

        if sector not in exposure:
            exposure[sector] = {}
        exposure[sector][ticker] = exposure[sector].get(ticker, 0.0) + total_value

    return exposure
