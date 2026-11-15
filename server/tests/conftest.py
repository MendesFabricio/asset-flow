import sys
import os
import pytest

# Adiciona o diretório pai (server/) ao sys.path para que importações relativas funcionem no pytest
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)


@pytest.fixture(scope="session", autouse=True)
def ensure_default_user_for_legacy_tests():
    """Garante User(id=1) em bancos zerados de CI para testes que assumem usuário padrão."""
    from db.models import init_db, User, safe_commit
    from db.session import Session

    init_db()
    with Session() as session:
        if not session.query(User).filter_by(id=1).first():
            session.add(User(id=1, username="ci_default_user", password_hash="ci_hash"))
            safe_commit(session)
