import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session

# Configuração do Banco de Dados SQLite em WAL Mode
engine = create_engine(
    'sqlite:////app/data/assetflow.db',
    echo=False,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    },
    pool_pre_ping=True,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA wal_autocheckpoint=1000")
    cursor.close()

# SessionFactory controlada thread-safe (scoped_session)
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)
