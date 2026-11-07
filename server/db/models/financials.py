from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Date, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from db.models.base import Base

class RefundConfig(Base):
    __tablename__ = "refund_configs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    fechamento_dia = Column(Integer, default=15)
    vencimento_dia = Column(Integer, default=20)

    user = relationship("User", back_populates="refund_configs")

class Debtor(Base):
    __tablename__ = "debtors"
    id = Column(Integer, primary_key=True)
    nome = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    foto_url = Column(String, nullable=True)
    telefone = Column(String, nullable=True)
    observacoes = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False)
    
    loans = relationship("ReceivableLoan", back_populates="debtor")
    user = relationship("User", back_populates="debtors")

    __table_args__ = (
        UniqueConstraint('nome', 'user_id', name='_debtor_nome_user_uc'),
        Index('idx_debtors_user_deleted', 'user_id', 'is_deleted'),
    )

    @property
    def valor_total_emprestado(self):
        from decimal import Decimal
        active_loans = [l for l in self.loans if not l.is_deleted]
        return sum(Decimal(str(l.valor_total)) for l in active_loans)

    @property
    def valor_total_recebido(self):
        from decimal import Decimal
        total = Decimal('0.0')
        active_loans = [l for l in self.loans if not l.is_deleted]
        for l in active_loans:
            for inst in l.installments:
                if inst.is_deleted:
                    continue
                for t in inst.transactions:
                    total += Decimal(str(t.valor_pago))
        return total

    @property
    def saldo_pendente(self):
        return self.valor_total_emprestado - self.valor_total_recebido

    @property
    def data_ultimo_pagamento(self):
        dates = []
        active_loans = [l for l in self.loans if not l.is_deleted]
        for l in active_loans:
            for inst in l.installments:
                if inst.is_deleted:
                    continue
                for t in inst.transactions:
                    if t.data_movimentacao:
                        dates.append(t.data_movimentacao)
        return max(dates) if dates else None

    @property
    def data_primeiro_emprestimo(self):
        dates = [l.data_emprestimo for l in self.loans if not l.is_deleted and l.data_emprestimo]
        return min(dates) if dates else None

    @property
    def data_ultimo_contato(self):
        dates = []
        active_loans = [l for l in self.loans if not l.is_deleted]
        for l in active_loans:
            if l.data_emprestimo:
                dates.append(l.data_emprestimo)
            for inst in l.installments:
                if inst.is_deleted:
                    continue
                for t in inst.transactions:
                    if t.data_movimentacao:
                        dates.append(t.data_movimentacao)
        return max(dates) if dates else None

class ReceivableLoan(Base):
    __tablename__ = "receivable_loans"
    id = Column(Integer, primary_key=True)
    debtor_id = Column(Integer, ForeignKey('debtors.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    descricao = Column(String, nullable=False)
    categoria = Column(String, nullable=True)
    data_emprestimo = Column(DateTime, default=datetime.now)
    valor_total = Column(Numeric(18, 4), nullable=False)
    is_parcelado = Column(Boolean, default=False)
    total_parcelas = Column(Integer, default=1)
    status = Column(String, default="PENDENTE")
    observacoes = Column(String, nullable=True)
    fatura_mes = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False)

    debtor = relationship("Debtor", back_populates="loans")
    user = relationship("User", back_populates="receivable_loans")
    installments = relationship("LoanInstallment", back_populates="loan", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_receivable_loans_user_deleted', 'user_id', 'is_deleted'),
    )

class LoanInstallment(Base):
    __tablename__ = "loan_installments"
    id = Column(Integer, primary_key=True)
    loan_id = Column(Integer, ForeignKey('receivable_loans.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    numero_parcela = Column(Integer, nullable=False)
    valor_parcela = Column(Numeric(18, 4), nullable=False)
    data_vencimento = Column(DateTime, nullable=False)
    status = Column(String, default="ABERTA")
    data_efetiva_pagamento = Column(DateTime, nullable=True)
    observacoes = Column(String, nullable=True)
    fatura_mes = Column(String, nullable=True)
    is_deleted = Column(Boolean, default=False)

    loan = relationship("ReceivableLoan", back_populates="installments")
    user = relationship("User", back_populates="loan_installments")
    transactions = relationship("PaymentTransaction", back_populates="installment", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_loan_installments_user_deleted', 'user_id', 'is_deleted'),
    )

class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"
    id = Column(Integer, primary_key=True)
    installment_id = Column(Integer, ForeignKey('loan_installments.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    valor_pago = Column(Numeric(18, 4), nullable=False)
    data_movimentacao = Column(DateTime, default=datetime.now)
    tipo_movimentacao = Column(String, nullable=False)
    forma_pagamento = Column(String, nullable=True)

    installment = relationship("LoanInstallment", back_populates="transactions")
    user = relationship("User", back_populates="payment_transactions")

class CreditCard(Base):
    __tablename__ = "credit_cards"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    limit = Column(Numeric(18, 4), nullable=False)
    closing_day = Column(Integer, nullable=False)
    due_day = Column(Integer, nullable=False)
    is_deleted = Column(Boolean, default=False)

    expenses = relationship("CardExpense", back_populates="card", cascade="all, delete-orphan")
    user = relationship("User", back_populates="credit_cards")

    __table_args__ = (
        Index('idx_credit_cards_user_deleted', 'user_id', 'is_deleted'),
    )

class CardExpense(Base):
    __tablename__ = "card_expenses"
    id = Column(Integer, primary_key=True)
    card_id = Column(Integer, ForeignKey('credit_cards.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String, nullable=False)
    total_value = Column(Numeric(18, 4), nullable=False)
    installments_count = Column(Integer, default=1)
    date = Column(DateTime, default=datetime.now)
    is_deleted = Column(Boolean, default=False)

    card = relationship("CreditCard", back_populates="expenses")
    installments = relationship("CardInstallment", back_populates="expense", cascade="all, delete-orphan")
    user = relationship("User", back_populates="card_expenses")

    __table_args__ = (
        Index('idx_card_expenses_user_deleted', 'user_id', 'is_deleted'),
    )

class CardInstallment(Base):
    __tablename__ = "card_installments"
    id = Column(Integer, primary_key=True)
    expense_id = Column(Integer, ForeignKey('card_expenses.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    installment_number = Column(Integer, nullable=False)
    value = Column(Numeric(18, 4), nullable=False)
    due_date = Column(DateTime, nullable=False)
    status = Column(String, default="PENDING")
    invoice_month = Column(String, nullable=False)
    is_deleted = Column(Boolean, default=False)

    expense = relationship("CardExpense", back_populates="installments")
    user = relationship("User", back_populates="card_installments")

    __table_args__ = (
        Index('idx_card_installments_user_deleted', 'user_id', 'is_deleted'),
    )

class FixedIncome(Base):
    __tablename__ = "fixed_income"
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    index_type = Column(String, nullable=False)
    interest_rate = Column(Numeric(18, 4), nullable=False)
    issue_date = Column(DateTime, nullable=False)
    due_date = Column(DateTime, nullable=False)
    is_deleted = Column(Boolean, default=False)

    asset = relationship("Asset", back_populates="fixed_incomes")
    user = relationship("User", back_populates="fixed_incomes")

    __table_args__ = (
        UniqueConstraint('asset_id', 'user_id', name='_fixed_income_asset_user_uc'),
        Index('idx_fixed_income_user_deleted', 'user_id', 'is_deleted'),
    )
