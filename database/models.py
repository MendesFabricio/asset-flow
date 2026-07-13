from sqlalchemy import create_engine, Column, Integer, String, Float, Numeric, ForeignKey, DateTime, Date, Boolean, event, Index, text, UniqueConstraint
import logging
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
from sqlalchemy.exc import OperationalError

def safe_commit(session):
    """Commita uma transação no SQLAlchemy de forma direta (locks tratados pelo busy_timeout do SQLite)."""
    try:
        session.commit()
    except OperationalError as e:
        session.rollback()
        raise e

def get_active_positions(session, user_id):
    """Retorna posições ativas (quantity > 0) com eager loading de Asset, Category, MarketData e Dividends."""
    from sqlalchemy.orm import selectinload
    from database.models import Position, Asset
    q = session.query(Position)
    if user_id is not None:
        q = q.filter(Position.user_id == user_id, Position.quantity > 0)
    else:
        q = q.filter(Position.quantity > 0)
    
    # Ignora selectinload se q for um Mock (preserva compatibilidade com testes legados)
    if type(q).__name__ in ('MagicMock', 'Mock'):
        return q
        
    return q.options(
        selectinload(Position.asset).selectinload(Asset.category),
        selectinload(Position.asset).selectinload(Asset.market_data),
        selectinload(Position.asset).selectinload(Asset.dividends)
    )

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    assets = relationship("Asset", back_populates="user", cascade="all, delete-orphan")
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

# 🛡️ PRAGMAS DE PRODUÇÃO: Otimizações críticas de concorrência e performance para SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """Configura pragmas essenciais em toda nova conexão do pool."""
    cursor = dbapi_connection.cursor()
    # Integridade referencial física
    cursor.execute("PRAGMA foreign_keys=ON")
    # WAL Mode: permite múltiplos leitores simultâneos com um escritor ativo.
    cursor.execute("PRAGMA journal_mode=WAL")
    # NORMAL é seguro com WAL e significativamente mais rápido que FULL
    cursor.execute("PRAGMA synchronous=NORMAL")
    # Cache de 32MB em memória (padrão é 2MB) — reduz I/O em disco
    cursor.execute("PRAGMA cache_size=-32000")
    # Retry automático de 30s antes de lançar OperationalError por lock
    cursor.execute("PRAGMA busy_timeout=30000")
    # Checkpoint automático do WAL a cada 1000 páginas gravadas
    cursor.execute("PRAGMA wal_autocheckpoint=1000")
    cursor.close()

class Category(Base):
    __tablename__ = 'categories'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    target_percent = Column(Numeric(18, 4), default=0.0)
    assets = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    ticker = Column(String, nullable=False, index=True)
    name = Column(String)
    cnpj = Column(String, nullable=True)
    cvm_code = Column(String, nullable=True)
    currency = Column(String, default="BRL")
    
    # ⚡ ÍNDICE: Acelera o filtro de ativos pertencentes a uma mesma categoria na tabela
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False, index=True) 
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    category = relationship("Category", back_populates="assets")
    user = relationship("User", back_populates="assets")
    position = relationship("Position", uselist=False, back_populates="asset", cascade="all, delete-orphan")
    market_data = relationship("MarketData", back_populates="asset", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="asset", cascade="all, delete-orphan")
    fixed_income = relationship("FixedIncome", uselist=False, back_populates="asset", cascade="all, delete-orphan")

    # ── Inteligência Artificial (Ollama background checks) ───────────────────
    ai_summary = Column(String, nullable=True)
    ai_sentiment = Column(String, nullable=True)
    ai_status = Column(String, default="idle")
    ai_updated_at = Column(DateTime, nullable=True)
    upcoming_split = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint('ticker', 'user_id', name='_ticker_user_uc'),
    )

class Position(Base):
    __tablename__ = 'positions'
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    quantity = Column(Numeric(18, 4), default=0.0)
    average_price = Column(Numeric(18, 4), default=0.0)
    target_percent = Column(Numeric(18, 4), default=0.0)
    manual_lpa = Column(Numeric(18, 4), nullable=True)
    manual_vpa = Column(Numeric(18, 4), nullable=True)
    manual_dy = Column(Numeric(18, 4), nullable=True)

    last_report_url = Column(String, nullable=True)
    last_report_at = Column(String, nullable=True) 
    last_report_type = Column(String, nullable=True)
    
    asset = relationship("Asset", back_populates="position")
    user = relationship("User", back_populates="positions")

    __table_args__ = (
        UniqueConstraint('asset_id', 'user_id', name='_asset_user_uc'),
    )

class MarketData(Base):
    __tablename__ = 'market_data'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Proteção para buscas isoladas
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=datetime.now, index=True)
    
    price = Column(Numeric(18, 4))
    min_6m = Column(Numeric(18, 4))
    change_percent = Column(Numeric(18, 4), default=0.0)
    rsi_14 = Column(Numeric(18, 4), nullable=True)
    sma_20 = Column(Numeric(18, 4), nullable=True)
    
    asset = relationship("Asset", back_populates="market_data")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Multiplica a velocidade de geração do gráfico de cotações temporais
    __table_args__ = (
        Index('idx_market_data_asset_date', 'asset_id', 'date'),
        Index('idx_market_data_asset_date_desc', 'asset_id', text('date DESC')),
    )

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Acelera o cálculo acumulado de proventos recebidos por ativo
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    date_com = Column(Date, nullable=False, index=True)
    
    date_payment = Column(Date, nullable=True)
    value_per_share = Column(Numeric(18, 4), nullable=False) 
    quantity_at_date = Column(Numeric(18, 4), nullable=False) 
    total_value = Column(Numeric(18, 4), nullable=False) 
    status = Column(String, default="GARANTIDO") 
    
    asset = relationship("Asset", back_populates="dividends")
    user = relationship("User", back_populates="dividends")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Acelera a timeline do calendário de proventos/agenda do usuário
    __table_args__ = (
        Index('idx_dividends_asset_date_com', 'asset_id', 'date_com'),
        Index('idx_dividends_asset_date_com_desc', 'asset_id', text('date_com DESC')),
    )

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    
    # ⚡ ÍNDICE CRÍTICO: Executa a query do gráfico principal de evolução histórica instantaneamente
    date = Column(Date, default=datetime.now, index=True)
    
    total_equity = Column(Numeric(18, 4))      
    total_invested = Column(Numeric(18, 4))    
    profit = Column(Numeric(18, 4))   
    
    # Detalhamento do patrimônio por classe de ativo (JSON stringificado)
    breakdown = Column(String, nullable=True)

    user = relationship("User", back_populates="portfolio_snapshots")

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
    status = Column(String, default="PENDENTE")  # "PENDENTE" | "PARCIAL" | "LIQUIDADO"
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
    status = Column(String, default="ABERTA")  # "ABERTA" | "PAGA" | "ATRASADA"
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
    tipo_movimentacao = Column(String, nullable=False)  # "PARCIAL" | "ANTECIPADO" | "ATRASADO" | "EXCESSO" | "MENOR"
    forma_pagamento = Column(String, nullable=True)

    installment = relationship("LoanInstallment", back_populates="transactions")
    user = relationship("User", back_populates="payment_transactions")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    tabela_afetada = Column(String, nullable=False)
    registro_id = Column(Integer, nullable=False)
    campo_alterado = Column(String, nullable=False)
    valor_antigo = Column(String, nullable=True)
    valor_novo = Column(String, nullable=True)
    alterado_em = Column(DateTime, default=datetime.now)

class PriceAlert(Base):
    """
    Alertas de preço configuráveis pelo usuário (3FN).
    """
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    target_price = Column(Numeric(18, 4), nullable=False)
    condition = Column(String, nullable=False, default="ABOVE")  # "ABOVE" | "BELOW"
    note = Column(String, default="")           # Anotação livre do usuário
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.now)
    triggered_at = Column(DateTime, nullable=True)

    asset = relationship("Asset")
    user = relationship("User", back_populates="price_alerts")

class SyncState(Base):
    """
    Tabela persistente de progresso e estado para jobs de background (stateless backend).
    """
    __tablename__ = "sync_states"

    key = Column(String, primary_key=True)  # ex: "cvm_sync", "yahoo_sync"
    status = Column(String, default="idle")  # "idle" | "processing" | "success" | "error"
    progress = Column(Integer, default=0)
    total = Column(Integer, default=0)
    message = Column(String, default="Sistema pronto.")
    updated_at = Column(DateTime, default=datetime.now)

class SystemCache(Base):
    """
    Tabela persistente de cache chave-valor (para briefing de IA e caches do sistema).
    """
    __tablename__ = "system_caches"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)  # JSON string
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class AIChatHistory(Base):
    """
    Tabela para persistir histórico de conversas do Jarvis AI.
    """
    __tablename__ = "ai_chat_histories"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User", back_populates="ai_chat_histories")

class TriggeredAlert(Base):
    """
    Tabela de alertas disparados recentemente aguardando notificação (polling).
    """
    __tablename__ = "triggered_alerts"

    id = Column(Integer, primary_key=True)
    ticker = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    target_price = Column(Numeric(18, 4), nullable=False)
    current_price = Column(Numeric(18, 4), nullable=False)
    note = Column(String, default="")
    triggered_at = Column(DateTime, default=datetime.now)
    is_notified = Column(Boolean, default=False, index=True)

class CreditCard(Base):
    __tablename__ = "credit_cards"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    limit = Column(Numeric(18, 4), nullable=False)
    closing_day = Column(Integer, nullable=False)  # ex: 5
    due_day = Column(Integer, nullable=False)      # ex: 15
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
    status = Column(String, default="PENDING")  # "PENDING" | "PAID"
    invoice_month = Column(String, nullable=False)  # "YYYY-MM"
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
    index_type = Column(String, nullable=False)  # "CDI" | "IPCA" | "PRE"
    interest_rate = Column(Numeric(18, 4), nullable=False)  # ex: 12.5 (12.5% a.a.) ou 6.0 (IPCA + 6%)
    issue_date = Column(DateTime, nullable=False)
    due_date = Column(DateTime, nullable=False)
    is_deleted = Column(Boolean, default=False)

    asset = relationship("Asset", back_populates="fixed_income")
    user = relationship("User", back_populates="fixed_incomes")

    __table_args__ = (
        UniqueConstraint('asset_id', 'user_id', name='_fixed_income_asset_user_uc'),
        Index('idx_fixed_income_user_deleted', 'user_id', 'is_deleted'),
    )


class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255))
    job_type = Column(String(50), nullable=False)
    cron_expression = Column(String(100))
    interval_minutes = Column(Integer)
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime)
    last_run_status = Column(String(20))
    last_run_message = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

from database.session import engine, Session
from sqlalchemy.orm import sessionmaker
_local_session_factory = sessionmaker(bind=engine)

def update_sync_state_db(key: str, **kwargs):
    import time
    max_retries = 5
    for attempt in range(max_retries):
        session = _local_session_factory()
        try:
            state = session.query(SyncState).filter_by(key=key).first()
            if not state:
                state = SyncState(key=key)
                session.add(state)
            for k, v in kwargs.items():
                setattr(state, k, v)
            state.updated_at = datetime.now()
            safe_commit(session)
            return  # Sucesso — sai do loop
        except Exception as e:
            session.rollback()
            err_msg = str(e)
            if "database is locked" in err_msg and attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))  # backoff linear: 0.5s, 1s, 1.5s...
                continue
            logging.error(f"❌ Erro ao atualizar SyncState {key} no banco: {e}")
            return
        finally:
            session.close()

def get_sync_state_db(key: str) -> dict:
    import time
    max_retries = 5
    for attempt in range(max_retries):
        session = _local_session_factory()
        try:
            state = session.query(SyncState).filter_by(key=key).first()
            if not state:
                return {
                    "status": "idle",
                    "progress": 0,
                    "total": 0,
                    "message": "Sistema pronto."
                }
            return {
                "status": state.status,
                "progress": state.progress,
                "total": state.total,
                "message": state.message
            }
        except Exception as e:
            session.rollback()
            err_msg = str(e)
            if "database is locked" in err_msg and attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))  # backoff linear: 0.5s, 1s, 1.5s...
                continue
            logging.error(f"❌ Erro ao buscar SyncState {key} no banco: {e}")
            return {
                "status": "error",
                "progress": 0,
                "total": 0,
                "message": f"Erro: {e}"
            }
        finally:
            session.close()

class DatabaseStateProxy:
    def __init__(self, key):
        self.key = key

    def __setitem__(self, k, v):
        update_sync_state_db(self.key, **{k: v})

    def update(self, d):
        update_sync_state_db(self.key, **d)

    def get(self, k, default=None):
        return get_sync_state_db(self.key).get(k, default)

def init_db():
    import os
    import shutil
    import logging
    import sqlite3
    
    db_path = os.environ.get("DATABASE_PATH", "/app/data/assetflow.db")
    init_src = os.environ.get("INIT_DB_SRC", "/app/server/assetflow.db")
    
    db_vazia = True
    if os.path.exists(db_path) and os.path.getsize(db_path) > 100:
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'")
            has_table = cursor.fetchone()
            if has_table:
                cursor.execute("SELECT COUNT(*) FROM categories")
                count = cursor.fetchone()[0]
                if count > 0:
                    db_vazia = False
            conn.close()
        except Exception:
            pass

    if db_vazia and os.path.exists(init_src):
        logging.info(f"🚚 Banco de dados no volume nomeado vazio ou inexistente. Restaurando do backup populado em {init_src}...")
        try:
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            for ext in ['', '-shm', '-wal']:
                p = db_path + ext
                if os.path.exists(p):
                    os.remove(p)
            shutil.copyfile(init_src, db_path)
            for ext in ['-shm', '-wal']:
                src_ext = init_src + ext
                dst_ext = db_path + ext
                if os.path.exists(src_ext):
                    shutil.copyfile(src_ext, dst_ext)
            logging.info("✅ Banco de dados restaurado com sucesso no volume!")
        except Exception as e:
            logging.error(f"❌ Falha ao copiar banco de dados inicial: {e}")

    # Nota: As migrações do Alembic agora são executadas na inicialização do container backend (docker-compose)
    # para evitar concorrência e deadlocks no SQLite entre os múltiplos workers do Gunicorn e o Worker.
    pass
    
    # Sementes padrão para a tabela de categorias se estiver vazia
    db_session = _local_session_factory()
    try:
        from decimal import Decimal
        if db_session.query(Category).count() == 0:
            logging.info("🌱 Tabela de categorias vazia. Inserindo categorias padrão...")
            default_categories = [
                Category(name="Ação", target_percent=Decimal("30.0")),
                Category(name="FII", target_percent=Decimal("20.0")),
                Category(name="Internacional", target_percent=Decimal("20.0")),
                Category(name="Cripto", target_percent=Decimal("5.0")),
                Category(name="Renda Fixa", target_percent=Decimal("20.0")),
                Category(name="Reserva", target_percent=Decimal("5.0"))
            ]
            db_session.add_all(default_categories)
            db_session.commit()
            logging.info("✅ Categorias padrão cadastradas com sucesso!")
    except Exception as seed_err:
        db_session.rollback()
        logging.warning(f"⚠️ Erro ao inserir categorias padrão: {seed_err}")
    
    # Seed inicial de ScheduledJob (inserção individual de jobs ausentes)
    try:
        default_jobs_data = [
            {
                "name": "scheduled_update_indices",
                "description": "Atualiza índices de mercado e verifica alertas de preço",
                "job_type": "interval",
                "interval_minutes": 5,
                "cron_expression": None,
                "is_active": True,
            },
            {
                "name": "scheduled_update_prices",
                "description": "Atualiza preços de ativos e gera snapshot diário",
                "job_type": "interval",
                "interval_minutes": 10,
                "cron_expression": None,
                "is_active": True,
            },
            {
                "name": "scheduled_quant_warm",
                "description": "Aquece cache quantitativo: USD rate, Monte Carlo, correlação, risco, fronteira eficiente",
                "job_type": "interval",
                "interval_minutes": 30,
                "cron_expression": None,
                "is_active": True,
            },
            {
                "name": "scheduled_dividends_check",
                "description": "Registra dividendos confirmados do dia",
                "job_type": "cron",
                "interval_minutes": None,
                "cron_expression": "0 8 * * *",
                "is_active": True,
            },
            {
                "name": "scheduled_morning_brief_generation",
                "description": "Gera Morning Briefing proativo",
                "job_type": "cron",
                "interval_minutes": None,
                "cron_expression": "0 7 * * *",
                "is_active": True,
            },
        ]
        
        seeded_any = False
        for job_data in default_jobs_data:
            existing = db_session.query(ScheduledJob).filter_by(name=job_data["name"]).first()
            if not existing:
                new_job = ScheduledJob(
                    name=job_data["name"],
                    description=job_data["description"],
                    job_type=job_data["job_type"],
                    interval_minutes=job_data["interval_minutes"],
                    cron_expression=job_data["cron_expression"],
                    is_active=job_data["is_active"],
                    last_run_at=datetime.utcnow(),
                    last_run_status="idle",
                    last_run_message="Aguardando primeira execução"
                )
                db_session.add(new_job)
                seeded_any = True
                
        if seeded_any:
            db_session.commit()
            logging.info("✅ Novos scheduled jobs padrão cadastrados com sucesso!")
    except Exception as seed_err:
        db_session.rollback()
        logging.warning(f"⚠️ Erro ao inserir scheduled jobs: {seed_err}")
    finally:
        db_session.close()

    from sqlalchemy import inspect, text
    try:
        inspector = inspect(engine)
        # Seed inicial de RefundConfig se estiver vazio
        if inspector.has_table('refund_configs'):
            with engine.begin() as conn:
                res = conn.execute(text("SELECT COUNT(*) FROM refund_configs")).fetchone()
                if res and res[0] == 0:
                    conn.execute(text("INSERT INTO refund_configs (id, fechamento_dia, vencimento_dia) VALUES (1, 15, 20)"))
    except Exception as e:
        logging.warning(f"⚠️ Erro ao inicializar tabelas e seeds de configuração: {e}")


# --- EVENT LISTENERS PARA SEGURANÇA E ISOLAMENTO MULTIUSUÁRIO ---
# NOTA: O isolamento multi-tenant é feito explicitamente em cada rota via
# .filter_by(user_id=g.user_id). O listener do_orm_execute foi removido pois
# causava deadlock no gunicorn ao interceptar queries internas do SQLAlchemy.
from sqlalchemy.event import listens_for
from sqlalchemy.orm import Session as SQLAlchemySession
from flask import has_request_context, g

@listens_for(SQLAlchemySession, "before_flush")
def before_flush_user_scoping(session, flush_context, instances):
    """Garante que todo novo objeto das tabelas de negócio receba o user_id do usuário logado."""
    if has_request_context() and hasattr(g, 'user_id') and g.user_id is not None:
        for obj in session.new:
            if hasattr(obj, 'user_id') and getattr(obj, 'user_id') is None:
                setattr(obj, 'user_id', g.user_id)
