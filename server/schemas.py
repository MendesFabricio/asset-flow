from pydantic import BaseModel, Field, validator
from datetime import datetime
from decimal import Decimal
from typing import Optional

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
