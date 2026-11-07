import unittest
from werkzeug.security import generate_password_hash, check_password_hash
from routes.auth import validate_password_complexity, is_rate_limited

class TestAuthSecurity(unittest.TestCase):
    def test_password_hashing(self):
        password = "Password123!"
        hashed = generate_password_hash(password)
        self.assertTrue(check_password_hash(hashed, password))
        self.assertFalse(check_password_hash(hashed, "WrongPassword123!"))

    def test_password_complexity_validator(self):
        # Senha válida: 8+ chars, 1 maiúscula, 1 número, 1 símbolo
        self.assertTrue(validate_password_complexity("AssetFlow2026!"))
        
        # Senhas fracas (inválidas)
        self.assertFalse(validate_password_complexity("short1!"))          # < 8 chars
        self.assertFalse(validate_password_complexity("lowercase123!"))    # sem maiúscula
        self.assertFalse(validate_password_complexity("NO_NUMBERS_HERE!")) # sem número
        self.assertFalse(validate_password_complexity("NoSymbol12345"))     # sem símbolo

    def test_rate_limiter_tracking(self):
        from backend import app
        from db.session import Session
        from db.models import SystemCache, safe_commit
        with app.app_context():
            app.config["TESTING"] = False
            ip = "127.0.0.99"
            with Session() as session:
                session.query(SystemCache).filter_by(key=f"rate_limit:{ip}").delete()
                safe_commit(session)
            # Primeiras 5 tentativas permitidas
            for _ in range(5):
                self.assertFalse(is_rate_limited(ip, limit=5, window_seconds=60))
            # 6ª tentativa bloqueada
            self.assertTrue(is_rate_limited(ip, limit=5, window_seconds=60))

if __name__ == '__main__':
    unittest.main()
