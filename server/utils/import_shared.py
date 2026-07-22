from dataclasses import dataclass
from typing import Optional
import re
from datetime import datetime

@dataclass
class TransactionCandidate:
    ticker: str
    date: str  # YYYY-MM-DD
    type: str  # BUY / SELL / etc
    quantity: float
    unit_price: float
    total_value: float
    source: str
    raw_description: str
    
    def to_dict(self):
        return {
            "ticker": self.ticker,
            "date": self.date,
            "type": self.type,
            "quantity": self.quantity,
            "unit_price": self.unit_price,
            "total_value": self.total_value,
            "description": self.raw_description,
            "source": self.source
        }

@dataclass
class DividendCandidate:
    ticker: str
    date_payment: Optional[str]
    date_com: Optional[str]
    type: str
    amount: float
    quantity_at_date: Optional[float]
    source: str
    raw_description: str

    def to_dict(self):
        return {
            "ticker": self.ticker,
            "type": self.type,
            "date": self.date_payment or self.date_com, # fallback for frontend compatibility for now
            "date_payment": self.date_payment,
            "date_com": self.date_com,
            "total_value": self.amount, # fallback for frontend compatibility
            "amount": self.amount,
            "quantity_at_date": self.quantity_at_date,
            "description": self.raw_description,
            "source": self.source
        }

def parse_brl_number(value: str) -> str:
    """Converte string formato BRL (1.234,56) para formato numérico (1234.56)."""
    if not value or value.strip() == "-":
        return "0.0"
    v = value.strip().replace('.', '')
    v = v.replace(',', '.')
    return v

def normalize_date(date_str: str) -> str:
    """Normaliza datas do formato 'DD/MM/YYYY' ou 'DD de MMMM de YYYY' para 'YYYY-MM-DD'."""
    date_str = date_str.strip().lower()
    
    # Formato DD/MM/YYYY
    if re.match(r'^\d{2}/\d{2}/\d{4}$', date_str):
        d, m, y = date_str.split('/')
        return f"{y}-{m}-{d}"
        
    # Formato DD de MMMM de YYYY
    meses = {
        "janeiro": "01", "fevereiro": "02", "março": "03", "abril": "04",
        "maio": "05", "junho": "06", "julho": "07", "agosto": "08",
        "setembro": "09", "outubro": "10", "novembro": "11", "dezembro": "12"
    }
    match = re.search(r"(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})", date_str)
    if match:
        d, m_str, y = match.groups()
        m = meses.get(m_str)
        if m:
            return f"{y}-{m}-{d.zfill(2)}"
            
    # Formato YYYY-MM-DD
    if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
        return date_str
        
    return ""
