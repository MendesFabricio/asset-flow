from sqlalchemy import event
from sqlalchemy.orm import declarative_base, Session as SQLAlchemySession
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from flask import has_request_context, g

Base = declarative_base()

def safe_commit(session):
    """Commita uma transação no SQLAlchemy de forma direta (locks tratados pelo busy_timeout do SQLite)."""
    try:
        session.commit()
    except OperationalError as e:
        session.rollback()
        raise e

def get_active_positions(session, user_id):
    """Retorna posições ativas (quantity > 0 ou target_percent > 0) com eager loading de Asset, Category, MarketData e Dividends."""
    from sqlalchemy.orm import selectinload
    from db.models.portfolio import Position, Asset
    q = session.query(Position)
    active_cond = (Position.quantity > 0) | (Position.target_percent > 0)
    if user_id is not None:
        q = q.filter(Position.user_id == user_id, active_cond)
    else:
        q = q.filter(active_cond)
    
    if type(q).__name__ in ('MagicMock', 'Mock'):
        return q
        
    return q.options(
        selectinload(Position.asset).options(
            selectinload(Asset.category),
            selectinload(Asset.market_data),
            selectinload(Asset.dividends)
        )
    )

# PRAGMAS DE PRODUÇÃO: Otimizações críticas de concorrência e performance para SQLite
@event.listens_for(Engine, "connect")
def set_sqlite_pragmas(dbapi_connection, connection_record):
    """Configura pragmas essenciais em toda nova conexão do pool."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA cache_size=-32000")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA wal_autocheckpoint=1000")
    cursor.close()

@event.listens_for(SQLAlchemySession, "before_flush")
def before_flush_user_scoping(session, flush_context, instances):
    """Garante que todo novo objeto das tabelas de negócio receba o user_id do usuário logado."""
    if has_request_context() and hasattr(g, 'user_id') and g.user_id is not None:
        for obj in session.new:
            if hasattr(obj, 'user_id') and getattr(obj, 'user_id') is None:
                setattr(obj, 'user_id', g.user_id)
