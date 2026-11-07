from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from db.models.base import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    positions = relationship("Position", back_populates="user", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="user", cascade="all, delete-orphan")
    portfolio_snapshots = relationship("PortfolioSnapshot", back_populates="user", cascade="all, delete-orphan")
    debtors = relationship("Debtor", back_populates="user", cascade="all, delete-orphan")
    receivable_loans = relationship("ReceivableLoan", back_populates="user", cascade="all, delete-orphan")
    loan_installments = relationship("LoanInstallment", back_populates="user", cascade="all, delete-orphan")
    payment_transactions = relationship("PaymentTransaction", back_populates="user", cascade="all, delete-orphan")
    price_alerts = relationship("PriceAlert", back_populates="user", cascade="all, delete-orphan")
    ai_chat_histories = relationship("AIChatHistory", back_populates="user", cascade="all, delete-orphan")
    credit_cards = relationship("CreditCard", back_populates="user", cascade="all, delete-orphan")
    card_expenses = relationship("CardExpense", back_populates="user", cascade="all, delete-orphan")
    card_installments = relationship("CardInstallment", back_populates="user", cascade="all, delete-orphan")
    fixed_incomes = relationship("FixedIncome", back_populates="user", cascade="all, delete-orphan")
    refund_configs = relationship("RefundConfig", back_populates="user", cascade="all, delete-orphan")
    tax_profile = relationship("TaxProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")

class TaxProfile(Base):
    __tablename__ = 'tax_profiles'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, unique=True, index=True)
    
    accumulated_loss_stocks_st = Column(Numeric(18, 4), default=0.0) # Prejuízo Swing Trade Ações
    accumulated_loss_stocks_dt = Column(Numeric(18, 4), default=0.0) # Prejuízo Day Trade Ações
    accumulated_loss_fiis = Column(Numeric(18, 4), default=0.0) # Prejuízo FIIs
    accumulated_darf_balance = Column(Numeric(18, 4), default=0.0) # Saldo DARF < 10,00 para acumular para o mês seguinte
    
    user = relationship("User", back_populates="tax_profile")
