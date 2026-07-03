from sqlalchemy import create_engine
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

# SessionFactory controlada thread-safe (scoped_session)
session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)
