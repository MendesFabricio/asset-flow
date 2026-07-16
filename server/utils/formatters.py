from decimal import Decimal
from typing import Tuple

def extract_position_metrics(pos, mdata=None) -> Tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    """
    Extrai e converte de forma segura as métricas financeiras de Position e MarketData
    Retorna: (quantidade, preço_médio, preco_atual, min_6m, change_percent)
    """
    try:
        qtd = Decimal(str(pos.quantity or 0))
        pm = Decimal(str(pos.average_price or 0))
        
        if mdata:
            price = Decimal(str(mdata.price)) if mdata.price else pm
            min_6m = Decimal(str(mdata.min_6m or 0))
            change_percent = Decimal(str(mdata.change_percent or 0))
        else:
            price = pm
            min_6m = Decimal('0.0')
            change_percent = Decimal('0.0')
            
        return qtd, pm, price, min_6m, change_percent
    except Exception:
        return Decimal('0.0'), Decimal('0.0'), Decimal('0.0'), Decimal('0.0'), Decimal('0.0')
