from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class FixedIncomeCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=100)
    index_type: str = Field(..., pattern="^(CDI|IPCA|PRE)$")
    interest_rate: float = Field(..., ge=0)
    quantity: float = Field(..., gt=0)
    average_price: float = Field(..., gt=0)
    issue_date: Optional[str] = Field(None, description="ISO date string")
    due_date: Optional[str] = Field(None, description="ISO date string")

class CreditCardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    limit: float = Field(..., gt=0)
    closing_day: int = Field(..., ge=1, le=31)
    due_day: int = Field(..., ge=1, le=31)



class RefundConfigUpdate(BaseModel):
    fechamento_dia: int = Field(..., ge=1, le=31)
    vencimento_dia: int = Field(..., ge=1, le=31)

class AssetTransactionCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    type: str = Field(..., pattern="^(BUY|SELL)$")
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)
    date: Optional[str] = Field(None, description="ISO date string for transaction_date")
    category: Optional[str] = Field(None, description="Suggested category for auto-creation")
    force_duplicate: Optional[bool] = Field(False, description="If true, bypass duplicate check")

class DebtorCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    telefone: Optional[str] = Field(None, max_length=30)
    observacoes: Optional[str] = Field(None, max_length=500)

class ReceivableLoanCreate(BaseModel):
    descricao: str = Field(..., min_length=1, max_length=200)
    valor_total: float = Field(..., gt=0)
    categoria: Optional[str] = Field(None, max_length=50)
    is_parcelado: Optional[bool] = False
    total_parcelas: Optional[int] = Field(1, ge=1, le=120)
    observacoes: Optional[str] = Field(None, max_length=500)

class CorporateEventCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    action_type: str = Field(..., pattern="^(SPLIT|INPLIT|BONUS|SPIN_OFF|TICKER_CHANGE|AMORTIZATION)$")
    payload: Dict[str, Any] = Field(default_factory=dict)
