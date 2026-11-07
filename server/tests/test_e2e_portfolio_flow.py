import unittest
import json
from unittest.mock import patch, MagicMock
from backend import app
from db.models import Session, User, Asset, Category, Position, safe_commit

class TestE2EPortfolioFlow(unittest.TestCase):
    """
    End-to-End Integration Test for AssetFlow Pro:
    Tests the complete user journey from authentication, asset management,
    market data check, to AI Jarvis interaction.
    """
    def setUp(self):
        self.app = app
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def test_full_portfolio_and_ai_integration_flow(self):
        # 1. Login/Authentication simulation
        with self.client as c:
            with c.session_transaction() as sess:
                sess['user_id'] = 1
                sess['email'] = 'test@assetflow.com'

            # 2. Add Asset & Position via Database
            with Session() as session:
                cat = session.query(Category).filter_by(name="Ação").first()
                if not cat:
                    cat = Category(name="Ação")
                    session.add(cat)
                    safe_commit(session)

                asset = session.query(Asset).filter_by(ticker="PETR4").first()
                if not asset:
                    asset = Asset(ticker="PETR4", name="Petrobras PN", category_id=cat.id, currency="BRL")
                    session.add(asset)
                    safe_commit(session)

                pos = session.query(Position).filter_by(user_id=1, asset_id=asset.id).first()
                if not pos:
                    pos = Position(user_id=1, asset_id=asset.id, quantity=100, average_price=30.0, target_percent=100.0)
                    session.add(pos)
                    safe_commit(session)

            # 3. Test Health & Market Indices Endpoints GET
            res_health = c.get('/api/health')
            self.assertIn(res_health.status_code, [200, 503])

            res_indices = c.get('/api/market/indices')
            self.assertEqual(res_indices.status_code, 200)

            # 4. Test AI Tool Execution Integration
            with patch('routes.ai.get_genai_client') as mock_genai:
                mock_client = MagicMock()
                mock_genai.return_value = mock_client
                mock_client.models.generate_content.return_value = MagicMock(
                    parts=[],
                    text="Análise concluída com sucesso para a carteira."
                )
                mock_client.models.generate_content_stream.return_value = [
                    MagicMock(text="Análise concluída com sucesso para a carteira.")
                ]

                res_ai = c.post('/api/ai/chat', json={
                    "message": "Qual é a situação da minha carteira?",
                    "history": []
                })
                self.assertEqual(res_ai.status_code, 200)
                response_text = res_ai.get_data(as_text=True)
                self.assertIn("Jarvis", response_text)

if __name__ == '__main__':
    unittest.main()
