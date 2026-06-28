from sqlalchemy import create_engine, Column, Integer, String, Float, Numeric, ForeignKey, DateTime, Date, Boolean, event, Index
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, scoped_session
from sqlalchemy.engine import Engine
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type
from sqlalchemy.exc import OperationalError

@retry(
    stop=stop_after_attempt(3),
    wait=wait_fixed(1),
    retry=retry_if_exception_type(OperationalError),
    reraise=True
)
def safe_commit(session):
    """Commita uma transação no SQLAlchemy com retry automático contra locks do SQLite."""
    session.commit()

Base = declarative_base()

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
        Index('idx_market_data_asset_date_desc', 'asset_id', 'date'),
    )

class Dividend(Base):
    __tablename__ = 'dividends'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICES INDIVIDUAIS: Acelera o cálculo acumulado de proventos recebidos por ativo
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date_com = Column(Date, nullable=False, index=True)
    
    date_payment = Column(Date, nullable=True)
    value_per_share = Column(Numeric(18, 4), nullable=False) 
    quantity_at_date = Column(Numeric(18, 4), nullable=False) 
    total_value = Column(Numeric(18, 4), nullable=False) 
    status = Column(String, default="GARANTIDO") 
    
    asset = relationship("Asset", back_populates="dividends")

    # 🚀 ÍNDICE COMPOSTO MESTRE: Acelera a timeline do calendário de proventos/agenda do usuário
    __table_args__ = (
        Index('idx_dividends_asset_date_com', 'asset_id', 'date_com'),
        Index('idx_dividends_asset_date_com_desc', 'asset_id', 'date_com'),
    )

class PortfolioSnapshot(Base):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    
    # ⚡ ÍNDICE CRÍTICO: Executa a query do gráfico principal de evolução histórica instantaneamente
    date = Column(Date, default=datetime.now, index=True)
    
    total_equity = Column(Numeric(18, 4))      
    total_invested = Column(Numeric(18, 4))    
    profit = Column(Numeric(18, 4))   

class Receivable(Base):
    __tablename__ = "receivables"

    id = Column(Integer, primary_key=True, index=True)
    descricao = Column(String)
    devedor = Column(String)
    valor_parcela = Column(Numeric(18, 4))
    parcela_atual = Column(Integer)
    total_parcelas = Column(Integer)
    vencimento_dia = Column(Integer)
    status = Column(String)

class PriceAlert(Base):
    """
    Alertas de preço configuráveis pelo usuário (3FN).
    """
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    target_price = Column(Numeric(18, 4), nullable=False)
    condition = Column(String, nullable=False, default="ABOVE")  # "ABOVE" | "BELOW"
    note = Column(String, default="")           # Anotação livre do usuário
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    triggered_at = Column(DateTime, nullable=True)

    asset = relationship("Asset")

class InvestorDecision(Base):
    """
    Diário de Decisões do Investidor para governança pessoal de teses.
    """
    __tablename__ = "investor_decisions"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime, default=datetime.now, index=True)
    decision_type = Column(String, nullable=False, default="ESTUDO")  # "COMPRA" | "VENDA" | "MANTER" | "ESTUDO"
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)  # Markdown
    target_price = Column(Numeric(18, 4), nullable=True)

    asset = relationship("Asset")

class SyncState(Base):
    """
    Tabela persistente de progresso e estado para jobs de background (stateless backend).
    """
    __tablename__ = "sync_states"

    key = Column(String, primary_key=True, index=True)  # ex: "cvm_sync", "yahoo_sync"
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

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)  # JSON string
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

class TriggeredAlert(Base):
    """
    Tabela de alertas disparados recentemente aguardando notificação (polling).
    """
    __tablename__ = "triggered_alerts"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    target_price = Column(Numeric(18, 4), nullable=False)
    current_price = Column(Numeric(18, 4), nullable=False)
    note = Column(String, default="")
    triggered_at = Column(DateTime, default=datetime.now)
    is_notified = Column(Boolean, default=False)

from database.session import engine, Session
from sqlalchemy.orm import sessionmaker
_local_session_factory = sessionmaker(bind=engine)

def update_sync_state_db(key: str, **kwargs):
    from datetime import datetime
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
    except Exception as e:
        session.rollback()
        import logging
        logging.error(f"❌ Erro ao atualizar SyncState {key} no banco: {e}")
    finally:
        session.close()

def get_sync_state_db(key: str) -> dict:
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
        import logging
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
    
    db_path = '/app/data/assetflow.db'
    init_src = '/app/server/assetflow.db'
    
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
        logging.info("🚚 Banco de dados no volume nomeado vazio ou inexistente. Restaurando do backup populado em /app/server...")
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

    Base.metadata.create_all(engine)
    from sqlalchemy import inspect, text
    try:
        inspector = inspect(engine)
        
        # Migração das colunas de IA na tabela assets
        columns_assets = [col['name'] for col in inspector.get_columns('assets')]
        with engine.begin() as conn:
            if 'ai_summary' not in columns_assets:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_summary TEXT"))
            if 'ai_sentiment' not in columns_assets:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_sentiment TEXT"))
            if 'ai_status' not in columns_assets:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_status TEXT DEFAULT 'idle'"))
            if 'ai_updated_at' not in columns_assets:
                conn.execute(text("ALTER TABLE assets ADD COLUMN ai_updated_at DATETIME"))
                
        # Migração estrutural da tabela price_alerts de ticker para asset_id (3FN)
        has_old = inspector.has_table('old_price_alerts')
        has_new = inspector.has_table('price_alerts')
        
        if has_old:
            logging.info("⚙️ Continuando migração 3FN interrompida anteriormente...")
            with engine.begin() as conn:
                conn.execute(text("DROP INDEX IF EXISTS ix_price_alerts_id"))
                conn.execute(text("DROP INDEX IF EXISTS ix_price_alerts_ticker"))
            
            Base.metadata.create_all(engine)
            
            with engine.begin() as conn:
                old_alerts = conn.execute(text("SELECT id, ticker, target_price, condition, note, is_active, created_at, triggered_at FROM old_price_alerts")).fetchall()
                for r in old_alerts:
                    oid, ticker, target, cond, note, active, created, triggered = r
                    row_asset = conn.execute(text("SELECT id FROM assets WHERE ticker = :ticker"), {"ticker": ticker.strip().upper()}).fetchone()
                    if row_asset:
                        asset_id = row_asset[0]
                        exists = conn.execute(text("SELECT 1 FROM price_alerts WHERE id = :id"), {"id": oid}).fetchone()
                        if not exists:
                            conn.execute(text("""
                                INSERT INTO price_alerts (id, asset_id, target_price, condition, note, is_active, created_at, triggered_at)
                                VALUES (:id, :asset_id, :target_price, :condition, :note, :is_active, :created_at, :triggered_at)
                            """), {
                                "id": oid,
                                "asset_id": asset_id,
                                "target_price": target,
                                "condition": cond,
                                "note": note,
                                "is_active": active,
                                "created_at": created,
                                "triggered_at": triggered
                            })
                conn.execute(text("DROP TABLE old_price_alerts"))
            logging.info("✅ Tabela de alertas de preço recuperada e migrada com sucesso!")
            
        elif has_new:
            columns_alerts = [col['name'] for col in inspector.get_columns('price_alerts')]
            if 'asset_id' not in columns_alerts:
                logging.info("⚙️ Detectada tabela de alertas de preço antiga. Iniciando migração 3FN...")
                
                with engine.begin() as conn:
                    conn.execute(text("DROP INDEX IF EXISTS ix_price_alerts_id"))
                    conn.execute(text("DROP INDEX IF EXISTS ix_price_alerts_ticker"))
                    conn.execute(text("ALTER TABLE price_alerts RENAME TO old_price_alerts"))
                
                Base.metadata.create_all(engine)
                
                with engine.begin() as conn:
                    old_alerts = conn.execute(text("SELECT id, ticker, target_price, condition, note, is_active, created_at, triggered_at FROM old_price_alerts")).fetchall()
                    for r in old_alerts:
                        oid, ticker, target, cond, note, active, created, triggered = r
                        row_asset = conn.execute(text("SELECT id FROM assets WHERE ticker = :ticker"), {"ticker": ticker.strip().upper()}).fetchone()
                        if row_asset:
                            asset_id = row_asset[0]
                            conn.execute(text("""
                                INSERT INTO price_alerts (id, asset_id, target_price, condition, note, is_active, created_at, triggered_at)
                                VALUES (:id, :asset_id, :target_price, :condition, :note, :is_active, :created_at, :triggered_at)
                            """), {
                                "id": oid,
                                "asset_id": asset_id,
                                "target_price": target,
                                "condition": cond,
                                "note": note,
                                "is_active": active,
                                "created_at": created,
                                "triggered_at": triggered
                            })
                    conn.execute(text("DROP TABLE old_price_alerts"))
                logging.info("✅ Tabela de alertas de preço migrada com sucesso para 3FN!")
    except Exception as e:
        logging.warning(f"⚠️ Erro ao atualizar schema do banco: {e}")
