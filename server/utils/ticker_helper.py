import re

HISTORICAL_TICKER_MAP = {
    # Rebranding / Nome
    "VVAR3": "BHIA3",
    "VIIA3": "BHIA3",
    "VIA3": "BHIA3",
    "BRML3": "ALOS3",
    "ALSO3": "ALOS3",
    "ALOS3": "ALOS3",
    "SOMA3": "AZZA3",
    "ARZZ3": "AZZA3",
    "HGTX3": "AZZA3",
    "SULA11": "RDOR3",
    "SULA3": "RDOR3",
    "SULA4": "RDOR3",
    "CESP6": "AURE3",
    "BKBR3": "ZAMP3",
    "JPSA3": "SIMH3",
    "LCAM3": "RENT3",
    "IGTA3": "IGTI11",
    "GETT11": "SANB11",
    "AZUL4": "AZUL4",
}

COMPANY_TO_TICKER = {
    "FIAGRO RIZA": "RZAG11",
    "FIAGRO VGIA": "VGIA11",
    "FII MAXI REN": "MXRF11",
    "IT NOW B5P2": "B5P211",
    "BRADESCO": "BBDC4",
    "FII GGRCOVEP": "GGRC11",
    "FII TRX REAL": "TRXF11",
    "AUREN": "AURE3",
    "AZZAS 2154": "AZZA3",
    "AZZAS": "AZZA3",
    "KLABIN": "KLBN11",
    "RDVC CITY": "RADL3",
    "FII IRIM": "IRIM11",
    "FIC IE CAP": "CPTS11",
    "FIC INFR BTG": "BDIF11",
    "COPEL": "CPLE6",
    "GERDAU MET": "GOAU4",
    "GERDAU": "GGBR4",
    "ITAUUNIBANCO": "ITUB4",
    "PETROBRAS": "PETR4",
    "ROMI": "ROMI3",
    "FII HEDGEBS": "HGBS11",
    "FII HGLG": "HGLG11",
    "FII VALOR HE": "VGHF11",
    "COGNA": "COGN3",
    "AMBEV": "ABEV3",
    "B3": "B3SA3",
    "BANCO DO BRASIL": "BBAS3",
    "BRASIL": "BBAS3",
    "ELETROBRAS": "ELET3",
    "ITAUSA": "ITSA4",
    "LOCALIZA": "RENT3",
    "LREN": "LREN3",
    "LOJAS RENNER": "LREN3",
    "MAGAZINE LUIZA": "MGLU3",
    "NATURA": "NTCO3",
    "RAIA DROGASIL": "RADL3",
    "SUZANO": "SUZB3",
    "VALE": "VALE3",
    "WEG": "WEGE3",
    "FII XP MALLS": "XPML11",
    "ALPARGATAS": "ALPA4",
    "AZUL": "AZUL4",
    "BBSEGURIDADE": "BBSE3",
    "CYRELA REALT": "CYRE3",
    "CYRELA": "CYRE3",
    "FLEURY": "FLRY3",
    "MULTIPLAN": "MULT3",
    "BR MALLS PAR": "BRML3",
    "BR MALLS": "BRML3",
    "JBS": "JBSS3",
    "CIA HERING": "HGTX3",
    "HERING": "HGTX3",
    "BRASKEM": "BRKM5",
    "VIAVAREJO": "VIIA3",
    "VIA": "VIIA3",
    "HAPVIDA": "HAPV3",
    "RUMO": "RAIL3",
    "COSAN": "CSAN3",
    "B BTG PACTUAL": "BPAC11",
    "BTG PACTUAL": "BPAC11",
    "VIBRA": "VBBR3",
    "EQUATORIAL": "EQTL3",
    "SABESP": "SBSP3",
    "REDE D OR": "RDOR3",
    "TIM": "TIMS3",
    "CPFL ENERGIA": "CPFE3",
    "ENERGISA": "ENGI11",
    "TOTVS": "TOTS3",
    "ENGIE BRASIL": "EGIE3",
    "TRAN PAULIST": "TRPL4",
    "TRAN": "TRPL4",
    "YDUQS PART": "YDUQ3",
    "YDUQS": "YDUQ3",
    "TENDA": "TEND3",
    "FII CSHG LOG": "HGLG11",
    "CSHG LOG": "HGLG11",
    "FII CSHG URB": "HGRU11",
    "CSHG URB": "HGRU11",
    "FII HGRU": "HGRU11",
    "HGRU PAX": "HGRU11",
    "HGRU": "HGRU11",
    "CSHG": "HGLG11",
    "FII IRIDIUM": "IRDM11",
    "IRIDIUM": "IRDM11",
    "FII NEWPORT": "NEWL11",
    "NEWPORT": "NEWL11",
    "FII BC FUND": "BRCR11",
    "BC FUND": "BRCR11",
    "BC": "BRCR11",
    "FII RBRALPHA": "RBRF11",
    "RBRALPHA": "RBRF11",
    "FII BTLG": "BTLG11",
    "BTLG": "BTLG11",
    "FII HECTARE": "HCTR11",
    "HECTARE": "HCTR11",
    "ENERGIAS BR": "ENBR3",
    "ENERGIAS": "ENBR3",
    "GRUPO SOMA": "AZZA3",
    "GRUPO": "AZZA3",
    "OI": "OIBR3",
    "SANEPAR": "SAPR4",
    "ENJOEI": "ENJU3",
    "TC": "TRAD3",
    "VIVER": "VIVR3",
    "IOCHP-MAXION": "MYPK3",
    "IOCHP": "MYPK3",
    "ENAUTA": "ENAT3",
    "IGUATEMI": "IGTI11",
    "LOCAWEB": "LWSA3",
    "TAESA": "TAEE11",
    "MOSAICO": "MOSI3",
    "LOJAS MARISA": "AMAR3",
    "LOJAS AMERIC": "AMER3",
    "LOJAS": "AMER3",
    "AMERICANAS": "AMER3",
    "B2W DIGITAL": "AMER3",
    "B2W": "AMER3",
    "MARFRIG": "MRFG3",
    "JHSF": "JHSF3",
    "CENTAURO": "CNTO3",
    "MELIUZ": "CASH3",
    "PLANOEPLANO": "PLPL3",
    "PLANO": "PLPL3",
    "AERIS": "AERE3",
    "APPLE": "AAPL34",
    "ISHARE SP500": "IVVB11",
    "ISHARE": "IVVB11",
    "TREND CHINA": "XINA11",
    "TREND EUROPA": "EURP11",
    "TREND": "XINA11",
    "HASHDEX NCI": "HASH11",
    "HASHDEX": "HASH11",
    "CORE US REIT": "BIVB39",
    "CORE": "BIVB39",
    "GOLD TRUST": "BIFRA39",
    "GOLD": "BIFRA39",
    "ICE BIOTECH": "BIBB39",
    "ICE": "BIBB39",
    "INC ESG AWAR": "BEGE39",
    "INC": "BEGE39",
    "TRTMSCI EAFE": "BEFA39",
    "TRTMSCI": "BEFA39",
    "COREMSCI EUR": "BEUR39",
    "COREMSCI": "BEUR39",
    "ETF BV COIN": "BTHC11",
    "ETF BV ETHY": "ETHE11",
    "INVESTOVWRA": "BIVB39",
}

def clean_company_name(name: str) -> str:
    """Remove sufixos de ações (ON, PN, NM, N1, etc.) para isolar o nome da empresa."""
    words_to_remove = {"ON", "PN", "PNA", "PNB", "UNT", "NM", "N1", "N2", "N3", "EJ", "ED", "REC", "CI", "ER", "S/A", "S.A.", "SA", "MB", "EX", "EC", "DRE", "D", "#"}
    parts = name.upper().split()
    clean_parts = [p for p in parts if p not in words_to_remove]
    return " ".join(clean_parts).strip()

def resolve_ticker(name: str) -> str:
    """Tenta descobrir o ticker com base no nome usando o De/Para e regras heurísticas."""
    name_upper = name.upper().strip()
    
    # 0. Tenta identificar se o nome contém um ticker de opção B3 (ex: PETRA350, COGNO380)
    opt_match = re.search(r'\b([A-Z]{4}[A-X]\d{1,4})\b', name_upper)
    if opt_match:
        return opt_match.group(1)
        
    found_ticker = ""
    # 1. Tenta correspondência exata do nome original
    for key, ticker in COMPANY_TO_TICKER.items():
        if key == name_upper or key in name_upper:
            found_ticker = ticker
            break
            
    if not found_ticker:
        # 2. Limpa o nome removendo ON, PN, NM, etc. e procura
        clean_name = clean_company_name(name_upper)
        for key, ticker in COMPANY_TO_TICKER.items():
            if key == clean_name or key in clean_name:
                found_ticker = ticker
                break
                
    if not found_ticker:
        # 3. Fallback heurístico caso não ache no dicionário
        parts = clean_company_name(name_upper).split()
        if parts:
            if parts[0] in ['FII', 'FIAGRO', 'FIC'] and len(parts) > 1:
                found_ticker = parts[1]
            else:
                found_ticker = parts[0]
                
    return get_canonical_ticker(found_ticker)

def get_canonical_ticker(ticker: str) -> str:
    """
    Retorna o ticker canônico/atualizado caso seja um ticker histórico ou legado.
    """
    if not ticker:
        return ticker
    t = ticker.strip().upper()
    return HISTORICAL_TICKER_MAP.get(t, t)

def to_yf_ticker(ticker: str, category_name: str) -> str:
    """
    Normaliza o ticker de um ativo para o formato esperado pelo Yahoo Finance.
    - Ativos nacionais (Ação, FII, ETF, BDR) recebem sufixo '.SA'.
    - Ativos internacionais puros (ex: AAPL, TSLA) mantêm o formato original.
    - BDRs terminados em 34, 33, 39, 11 etc. mantêm '.SA'.
    - Criptomoedas terminadas em '-USD' mantêm o formato original.
    """
    t = get_canonical_ticker(ticker)
    if t.endswith(".SA") or t.endswith("-USD"):
        return t
    is_intl = category_name == "Internacional"
    if not is_intl or any(t.endswith(s) for s in ["39", "34", "33", "11"]):
        return f"{t}.SA"
    return t

def extract_option_meta(ticker: str) -> dict:
    """
    Extrai informações de uma opção da B3 a partir do ticker (ex: COGNO380).
    Retorna None se não for uma opção válida.
    """
    if not ticker:
        return None
        
    t = ticker.strip().upper()
    
    # Padrao: 4 letras + 1 letra + 1 a 3 digitos
    match = re.match(r"^([A-Z]{4})([A-X])(\d{1,3})$", t)
    if not match:
        return None
        
    underlying, month_letter, strike_str = match.groups()
    strike = float(strike_str)
    
    month_ord = ord(month_letter)
    if month_ord <= ord('L'):
        option_type = "CALL"
        month = month_ord - ord('A') + 1
    else:
        option_type = "PUT"
        month = month_ord - ord('M') + 1
        
    return {
        "underlying": underlying,
        "month": month,
        "type": option_type,
        "strike": strike
    }
