import os
import shutil
import logging
import sqlite3
import time
from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Date, Boolean, Index, text
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime
from db.models.base import Base, safe_commit
from db.session import engine

class MarketData(Base):
    __tablename__ = 'market_data'
    id = Column(Integer, primary_key=True)
    
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, default=datetime.now, index=True)
    
    price = Column(Numeric(18, 4))
    min_6m = Column(Numeric(18, 4))
    change_percent = Column(Numeric(18, 4), default=0.0)
    rsi_14 = Column(Numeric(18, 4), nullable=True)
    sma_20 = Column(Numeric(18, 4), nullable=True)
    
    asset = relationship("Asset", back_populates="market_data")

    __table_args__ = (
        Index('idx_market_data_asset_date', 'asset_id', 'date'),
        Index('idx_market_data_asset_date_desc', 'asset_id', text('date DESC')),
    )

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
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True)
    asset_id = Column(Integer, ForeignKey('assets.id', ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    target_price = Column(Numeric(18, 4), nullable=False)
    condition = Column(String, nullable=False, default="ABOVE")
    note = Column(String, default="")
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.now)
    triggered_at = Column(DateTime, nullable=True)

    asset = relationship("Asset")
    user = relationship("User", back_populates="price_alerts")

class SyncState(Base):
    __tablename__ = "sync_states"

    key = Column(String, primary_key=True)
    status = Column(String, default="idle")
    progress = Column(Integer, default=0)
    total = Column(Integer, default=0)
    message = Column(String, default="Sistema pronto.")
    updated_at = Column(DateTime, default=datetime.now)

class SystemCache(Base):
    __tablename__ = "system_caches"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

def prune_expired_system_cache(max_age_days: int = 7) -> int:
    """Limpa registros de cache do sistema com mais de `max_age_days` dias."""
    from db.session import Session
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(days=max_age_days)
    try:
        with Session() as session:
            deleted_count = session.query(SystemCache).filter(SystemCache.updated_at < cutoff).delete()
            safe_commit(session)
            if deleted_count > 0:
                logging.info(f"🧹 [SystemCache] {deleted_count} registros antigos expirados foram limpos.")
            return deleted_count
    except Exception as e:
        logging.error(f"❌ Erro ao limpar SystemCache expirado: {e}")
        return 0

class AIChatHistory(Base):
    __tablename__ = "ai_chat_histories"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String, index=True, nullable=False)
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    user = relationship("User", back_populates="ai_chat_histories")

class TriggeredAlert(Base):
    __tablename__ = "triggered_alerts"

    id = Column(Integer, primary_key=True)
    ticker = Column(String, nullable=False)
    condition = Column(String, nullable=False)
    target_price = Column(Numeric(18, 4), nullable=False)
    current_price = Column(Numeric(18, 4), nullable=False)
    note = Column(String, default="")
    triggered_at = Column(DateTime, default=datetime.now)
    is_notified = Column(Boolean, default=False, index=True)

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
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

_local_session_factory = sessionmaker(bind=engine)

def update_sync_state_db(key: str, **kwargs):
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
            return
        except Exception as e:
            session.rollback()
            err_msg = str(e)
            if "database is locked" in err_msg and attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))
                continue
            logging.error(f"❌ Erro ao atualizar SyncState {key} no banco: {e}")
            return
        finally:
            session.close()

def get_sync_state_db(key: str) -> dict:
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
                time.sleep(0.5 * (attempt + 1))
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
        
    def get_all(self):
        return get_sync_state_db(self.key)

def init_db():
    from db.models.portfolio import Category
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

    try:
        from alembic.config import Config
        from alembic import command

        alembic_ini = os.path.abspath(
            os.path.join(os.path.dirname(__file__), '..', '..', 'alembic.ini')
        )
        if os.path.exists(alembic_ini):
            alembic_cfg = Config(alembic_ini)
            command.upgrade(alembic_cfg, "head")
            logging.info("✅ Migrações Alembic aplicadas com sucesso.")
        else:
            logging.warning(f"⚠️ alembic.ini não encontrado em {alembic_ini}. Migrações não aplicadas.")
    except Exception as mig_err:
        logging.error(f"❌ Erro ao aplicar migrações Alembic: {mig_err}", exc_info=True)

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
                    last_run_at=datetime.now(),
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
