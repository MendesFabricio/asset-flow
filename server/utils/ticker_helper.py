def to_yf_ticker(ticker: str, category_name: str) -> str:
    """
    Normaliza o ticker de um ativo para o formato esperado pelo Yahoo Finance.
    - Ativos nacionais (Ação, FII, ETF, BDR) recebem sufixo '.SA'.
    - Ativos internacionais puros (ex: AAPL, TSLA) mantêm o formato original.
    - BDRs terminados em 34, 33, 39, 11 etc. mantêm '.SA'.
    - Criptomoedas terminadas em '-USD' mantêm o formato original.
    """
    t = ticker.strip().upper()
    if t.endswith(".SA") or t.endswith("-USD"):
        return t
    is_intl = category_name == "Internacional"
    if not is_intl or any(t.endswith(s) for s in ["39", "34", "33", "11"]):
        return f"{t}.SA"
    return t
