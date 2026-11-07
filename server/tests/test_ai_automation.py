import unittest
from unittest.mock import MagicMock, patch
from flask import Flask, g

from routes.ai import execute_query_portfolio_metrics, execute_get_asset_fundamental_data
from utils.prompt_loader import load_prompt
from db.models import AIChatHistory
from routes.simulation import _build_enhanced_morning_brief_prompt

class TestAIAutomationTools(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)

    def test_execute_query_portfolio_metrics_empty(self):
        mock_session = MagicMock()
        mock_session.query().filter_by().options().all.return_value = []
        mock_session.query().filter().all.return_value = []

        with self.app.test_request_context():
            g.user_id = 1
            result = execute_query_portfolio_metrics(mock_session)

            self.assertEqual(result["status"], "Sucesso")
            self.assertEqual(result["portfolio_summary"], "Nenhum ativo com posição ativa no momento.")
            self.assertEqual(result["receivables_summary"], "Nenhum recebível ativo no momento.")

    def test_execute_query_portfolio_metrics_with_data(self):
        mock_pos = MagicMock()
        mock_pos.quantity = 10
        mock_pos.average_price = 30.0
        mock_pos.target_percent = 20.0
        mock_pos.asset.ticker = "PETR4"
        mock_pos.asset.currency = "BRL"
        mock_pos.asset.category.name = "Ação"
        mock_pos.asset.market_data = [MagicMock(price=35.0)]

        mock_session = MagicMock()
        mock_session.query().filter_by().options().all.return_value = [mock_pos]
        mock_session.query().filter().all.return_value = []

        with self.app.test_request_context():
            g.user_id = 1
            result = execute_query_portfolio_metrics(mock_session)

            self.assertEqual(result["status"], "Sucesso")
            summary_str = " ".join(result["portfolio_summary"]) if isinstance(result["portfolio_summary"], list) else result["portfolio_summary"]
            self.assertIn("PETR4", summary_str)

    def test_execute_get_asset_fundamental_data_not_found(self):
        mock_session = MagicMock()
        mock_session.query().filter_by().first.return_value = None

        result = execute_get_asset_fundamental_data(mock_session, "INVALID_TICKER")
        self.assertEqual(result["status"], "Erro")
        self.assertIn("não foi encontrado", result["error"])

    def test_execute_get_asset_fundamental_data_found(self):
        mock_asset = MagicMock()
        mock_asset.ticker = "VALE3"
        mock_asset.name = "Vale S.A."
        mock_asset.cvm_code = None
        mock_asset.category.name = "Ação"
        mock_mdata = MagicMock()
        mock_mdata.price = 60.0
        mock_mdata.min_6m = 50.0
        mock_mdata.change_percent = 1.5
        mock_mdata.rsi_14 = 45.0
        mock_mdata.sma_20 = 58.0
        mock_asset.market_data = [mock_mdata]

        mock_session = MagicMock()
        mock_session.query().filter_by().first.return_value = mock_asset

        result = execute_get_asset_fundamental_data(mock_session, "VALE3")
        self.assertEqual(result["status"], "Sucesso")
        self.assertEqual(result["ticker"], "VALE3")

    def test_jarvis_prompt_loader(self):
        prompt = load_prompt("jarvis_system_v1.txt")
        self.assertTrue(len(prompt) > 0)
        self.assertIn("Jarvis", prompt)

    def test_explain_score_prompt_loader(self):
        prompt = load_prompt("explain_score_v1.txt")
        self.assertTrue(len(prompt) > 0)
        self.assertIn("{ticker}", prompt)

    def test_ai_chat_history_model(self):
        chat = AIChatHistory(session_id="test_sess", user_id=1, role="user", content="Olá Jarvis")
        self.assertEqual(chat.session_id, "test_sess")
        self.assertEqual(chat.role, "user")
        self.assertEqual(chat.content, "Olá Jarvis")

    def test_morning_brief_prompt_building(self):
        ctx = {
            "selic": 0.1075,
            "dolar_rate": 5.75,
            "holdings": [{"ticker": "PETR4", "category": "Ação"}]
        }
        prompt = _build_enhanced_morning_brief_prompt(ctx)
        self.assertIn("10.75%", prompt)
        self.assertIn("5.75", prompt)
        self.assertIn("PETR4", prompt)

if __name__ == '__main__':
    unittest.main()
