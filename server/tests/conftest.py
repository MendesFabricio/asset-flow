import atexit
import os
import shutil
import sys
import tempfile
import pytest

# Adiciona o diretório pai (server/) ao sys.path para que importações relativas funcionem no pytest
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Isola toda a suíte pytest em um SQLite temporário por sessão, evitando tocar assetflow.db real
if os.environ.get("PYTEST_USE_LIVE_DB") != "1":
    _TEST_DB_DIR = tempfile.mkdtemp(prefix="assetflow_pytest_")
    os.environ["DATABASE_PATH"] = os.path.join(_TEST_DB_DIR, "test_assetflow.db")

    def _cleanup_test_db_dir():
        try:
            from db.session import engine, Session
            Session.remove()
            engine.dispose()
        except Exception:
            pass
        shutil.rmtree(_TEST_DB_DIR, ignore_errors=True)

    atexit.register(_cleanup_test_db_dir)


@pytest.fixture(scope="session", autouse=True)
def ensure_default_user_for_legacy_tests():
    """Garante User(id=1) e categorias padrão no banco isolado de testes."""
    from db.models import init_db, Category, User, safe_commit
    from db.session import Session

    init_db()
    with Session() as session:
        if not session.query(User).filter_by(id=1).first():
            session.add(User(id=1, username="ci_default_user", password_hash="ci_hash"))
        existing_cats = {c.name for c in session.query(Category).all()}
        for name, target in (
            ("Ação", 25.0),
            ("FII", 25.0),
            ("Renda Fixa", 15.0),
            ("Reserva", 15.0),
            ("Internacional", 10.0),
            ("Cripto", 10.0),
            ("Opções", 0.0),
        ):
            if name not in existing_cats:
                session.add(Category(name=name, target_percent=target))
        safe_commit(session)
