from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Date, Boolean, event, Index
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from datetime import datetime

Base = declarative_base()

# 🛡️ PRAGMAS DE PRODUÇÃO: Otimizações críticas de concorrência e performance para SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """Configura pragmas essenciais em toda nova conexão do pool."""
    cursor = dbapi_connection.cursor()
    # Integridade referencial física
    cursor.execute("PRAGMA foreign_keys=ON")
    # WAL Mode: permite múltiplos leitores simultâneos com um escritor ativo.
    # Elimina a maior fonte de 'database is locked' em ambiente multi-thread.
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
    target_percent = Column(Float, default=0.0)
    assets = relationship("Asset", back_populates="category")

class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    ticker = Column(String, unique=True, nullable=False)
    name = Column(String)
    cnpj = Column(String, nullable=True)
    cvm_code = Column(String, nullable=True)
    currency = Column(String, default="BRL")
    
    # ⚡ ÍNDICE: Acelera o filtro de ativos pertencentes a uma mesma categoria na tabela
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False, index=True) 
    
    category = relationship("Category", back_populates="assets")
    position = relationship("Position", uselist=False, back_populates="asset", cascade="all, delete-orphan")
    market_data = relationship("MarketData", back_populates="asset", cascade="all, delete-orphan")
    dividends = relationship("Dividend", back_populates="asset", cascade="all, delete-orphan")

    # ── Inteligência Artificial (Ollama background checks) ───────────────────
    ai_summary = Column(String, nullable=True)
    ai_sentiment = Column(String, nullable=True)
    ai_status = Column(String, default="idle")
    ai_updated_at = Column(DateTime, nullable=True)

class Position(Base):
    __tablename__ = 'positions'
    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), unique=True, nullable=False)
    
    quantity = Column(Float, default=0.0)
    average_price = Column(Float, default=0.0)
    target_percent = Column(Float, default=0.0)
    manual_lpa = Column(Float, nullable=True)
    manual_vpa = Column(Float, nullable=True)
    manual_dy = Column(Float, nullable=True)

    last_report_url = Column(String, nullable=True)
    last_report_at = Column(String, nullable=True) 
    last_report_type = Column(String, nullable=True)
    
    asset = relationship("Asset", back_populates="position")

class MarketData(Base):
    __tablename__ = 'market_data'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Proteção para buscas isoladas
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=datetime.now, index=True)
    
    price = Column(Float)
    min_6m = Column(Float)
    change_percent = Column(Float, default=0.0)
    rsi_14 = Column(Float, nullable=True)
    sma_20 = Column(Float, nullable=True)
    
    asset = relationship("Asset", back_populates="market_data")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Multiplica a velocidade de geração do gráfico de cotações temporais
    __table_args__ = (
        Index('idx_market_data_asset_date', 'asset_id', 'date'),
    )

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Acelera o cálculo acumulado de proventos recebidos por ativo
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date_com = Column(Date, nullable=False, index=True)
    
    date_payment = Column(Date, nullable=True)
    value_per_share = Column(Float, nullable=False) 
    quantity_at_date = Column(Float, nullable=False) 
    total_value = Column(Float, nullable=False) 
    status = Column(String, default="GARANTIDO") 
    
    asset = relationship("Asset", back_populates="dividends")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Acelera a timeline do calendário de proventos/agenda do usuário
    __table_args__ = (
        Index('idx_dividends_asset_date_com', 'asset_id', 'date_com'),
    )

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICE CRÍTICO: Executa a query do gráfico principal de evolução histórica instantaneamente
    date = Column(Date, default=datetime.now, index=True)
    
    total_equity = Column(Float)      
    total_invested = Column(Float)    
    profit = Column(Float)   

class Receivable(Base):
    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True, index=True)
    descricao = Column(String)
    devedor = Column(String)
    valor_parcela = Column(Float)
    parcela_atual = Column(Integer)
    total_parcelas = Column(Integer)
    vencimento_dia = Column(Integer)
    status = Column(String)

class PriceAlert(Base):
    """
    Alertas de preço configuráveis pelo usuário.

    condition: 'ABOVE' → dispara quando price >= target_price
               'BELOW' → dispara quando price <= target_price (stop-loss)
    is_active:  False após disparo (preserva histórico)
    triggered_at: timestamp do disparo
    """
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    target_price = Column(Float, nullable=False)
    condition = Column(String, nullable=False, default="ABOVE")  # "ABOVE" | "BELOW"
    note = Column(String, default="")           # Anotação livre do usuário
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    triggered_at = Column(DateTime, nullable=True)

# Configuração do Banco
# ─────────────────────────────────────────────────────────────────────────────
# check_same_thread=False: obrigatório para uso cross-thread (gerenciado pelo
# scoped_session em services.py, que garante sessões isoladas por thread).
# pool_pre_ping=True: valida conexões do pool antes de reutilizar, descartando
# conexões zumbis que causariam erros silenciosos após idle do banco.
# ─────────────────────────────────────────────────────────────────────────────
engine = create_engine(
    'sqlite:////app/database/assetflow.db',
    echo=False,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,          # Busy timeout de 30s como fallback adicional ao PRAGMA
    },
    pool_pre_ping=True,         # Descarta conexões mortas antes de reutilizá-las
)

# NOTA: Session canônico (scoped_session thread-safe) vive em services.py.
# Este re-export existe por compatibilidade com routes que ainda importam de models.
# Lazy import evita circular dependency (services → models → services).
def _get_session():
    from services import Session as _Session
    return _Session

class _SessionProxy:
    """Proxy lazy que delega para o scoped_session real de services.py."""
    def __call__(self):
        return _get_session()()
    def __getattr__(self, name):
        return getattr(_get_session(), name)
    def remove(self):
        return _get_session().remove()

Session = _SessionProxy()

def init_db():
    Base.metadata.create_all(engine)
    # Schema upgrade helper to dynamically add columns to existing sqlite database
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('assets')]
        with engine.begin() as conn:
            if 'ai_summary' not in columns:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_summary TEXT"))
            if 'ai_sentiment' not in columns:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_sentiment TEXT"))
            if 'ai_status' not in columns:
                conn.execute(text( "ALTER TABLE assets ADD COLUMN ai_status TEXT DEFAULT 'idle'"))
            if 'ai_updated_at' not in columns:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_updated_at DATETIME"))
    except Exception as e:
        import logging
        logging.warning(f"⚠️ Erro ao atualizar schema para colunas de IA: {e}")
