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

    def test_get_ollama_status_selects_preferred_model(self):
        from infrastructure.local_ai import get_ollama_status

        fake_resp = MagicMock()
        fake_resp.status_code = 200
        fake_resp.json.return_value = {"models": [{"name": "llama3.2:3b"}, {"name": "qwen2.5:3b"}]}

        with patch("infrastructure.local_ai.requests.get", return_value=fake_resp):
            status = get_ollama_status(timeout=1.0)

        self.assertTrue(status["available"])
        self.assertEqual(status["model"], "qwen2.5:3b")

    def test_jarvis_chat_falls_back_to_ollama_when_no_gemini_key(self):
        import os
        import routes.ai as ai_routes

        app = Flask(__name__)
        app.register_blueprint(ai_routes.ai_bp)

        @app.before_request
        def _set_user():
            g.user_id = 1

        fake_session = MagicMock()
        fake_session.__enter__.return_value = fake_session
        fake_session.__exit__.return_value = False
        fake_session.query().filter_by().order_by().all.return_value = []

        captured_messages = []

        def fake_stream(messages, model, base_url=None, timeout=180):
            captured_messages.extend(messages)
            yield "Análise local concluída."

        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False), \
             patch.object(ai_routes, "Session", return_value=fake_session), \
             patch.object(ai_routes, "safe_commit"), \
             patch.object(ai_routes, "get_ollama_status", return_value={"available": True, "model": "qwen2.5:3b", "base_url": "http://host.docker.internal:11434", "preferred_model": "qwen2.5:3b"}), \
             patch.object(ai_routes, "execute_query_portfolio_metrics", return_value={"status": "Sucesso", "portfolio_summary": ["ITUB3: R$1000"]}), \
             patch.object(ai_routes, "execute_get_asset_fundamental_data", return_value={"status": "Sucesso", "ticker": "ITUB3"}), \
             patch.object(ai_routes, "stream_ollama_chat", side_effect=fake_stream):
            client = app.test_client()
            resp = client.post("/api/ai/chat", json={"message": "Analise ITUB3 na minha carteira", "session_id": "s1"})
            body = resp.get_data(as_text=True)

        self.assertEqual(resp.status_code, 200)
        self.assertIn("Jarvis Local (qwen2.5:3b)", body)
        self.assertIn("Análise local concluída.", body)
        self.assertTrue(any("ITUB3" in m["content"] for m in captured_messages))

    def test_portfolio_metrics_precomputes_exact_totals(self):
        import routes.ai as ai_routes
        from types import SimpleNamespace

        cat_fii = SimpleNamespace(name="FII", target_percent=50.0)
        cat_acao = SimpleNamespace(name="Ação", target_percent=50.0)
        m_mxrf = SimpleNamespace(price=10.0, min_6m=9.0, change_percent=0.5, rsi_14=50.0, sma_20=9.8)
        m_petr = SimpleNamespace(price=40.0, min_6m=35.0, change_percent=1.0, rsi_14=55.0, sma_20=39.0)
        a_mxrf = SimpleNamespace(ticker="MXRF11", currency="BRL", category=cat_fii, market_data=[m_mxrf])
        a_petr = SimpleNamespace(ticker="PETR4", currency="BRL", category=cat_acao, market_data=[m_petr])

        p1 = SimpleNamespace(asset=a_mxrf, quantity=100.0, average_price=9.0, target_percent=100.0)
        p2 = SimpleNamespace(asset=a_petr, quantity=50.0, average_price=30.0, target_percent=100.0)

        fake_session = MagicMock()
        fake_session.query().options().all.return_value = [p1, p2]
        fake_session.query().filter_by().options().all.return_value = [p1, p2]
        fake_session.query().filter().all.return_value = []

        with patch.object(ai_routes, "calculate_risk_metrics", return_value={"status": "Indisponível"}):
            res = ai_routes.execute_query_portfolio_metrics(fake_session)

        resumo = res["resumo_financeiro"]
        # MXRF11: 100*10 = 1000 (inv 900), PETR4: 50*40 = 2000 (inv 1500) -> total 3000, inv 2400, lucro 600
        self.assertEqual(resumo["patrimonio_total_brl"], 3000.0)
        self.assertEqual(resumo["total_investido_brl"], 2400.0)
        self.assertEqual(resumo["lucro_total_brl"], 600.0)
        self.assertEqual(resumo["qtd_ativos"], 2)
        self.assertEqual(len(res["ativos_abaixo_da_meta"]), 1)
        self.assertEqual(res["ativos_abaixo_da_meta"][0]["ticker"], "MXRF11")

    def test_asset_fundamental_data_includes_user_position(self):
        import routes.ai as ai_routes
        from types import SimpleNamespace

        cat_fii = SimpleNamespace(name="FII", target_percent=20.0)
        m_mxrf = SimpleNamespace(price=10.0, min_6m=9.0, change_percent=0.5, rsi_14=50.0, sma_20=9.8)
        pos = SimpleNamespace(
            user_id=1,
            quantity=100.0,
            average_price=9.0,
            target_percent=50.0,
            last_report_type=None,
            manual_dy=12.0,
            manual_lpa=None,
            manual_vpa=10.0,
            ai_sentiment="Positivo",
            ai_summary="Dividendos estáveis.",
        )
        asset = SimpleNamespace(
            ticker="MXRF11",
            name="Maxi Renda",
            cnpj="97.521.225/0001-25",
            cvm_code=None,
            category=cat_fii,
            currency="BRL",
            market_data=[m_mxrf],
            positions=[pos],
        )

        fake_session = MagicMock()
        fake_session.query().filter_by().first.return_value = asset

        res = ai_routes.execute_get_asset_fundamental_data(fake_session, "mxrf11")
        self.assertEqual(res["status"], "Sucesso")
        self.assertIsNotNone(res["posicao_na_carteira"])
        self.assertEqual(res["posicao_na_carteira"]["valor_total_brl"], 1000.0)
        self.assertEqual(res["posicao_na_carteira"]["meta_global_pct"], 10.0)
        self.assertEqual(res["posicao_na_carteira"]["ai_sentiment"], "Positivo")

    def test_all_prompt_templates_format_cleanly(self):
        self.assertTrue(bool(load_prompt("jarvis_system_v1.txt")))
        s1 = load_prompt("explain_score_v1.txt").format(
            ticker="PETR4", name="Petrobras", category="Ação",
            score=82, recomendacao="APORTAR", motivo="P/L baixo", price=38.5
        )
        self.assertIn("PETR4", s1)
        s2 = load_prompt("daily_sector_summary_v1.txt").format(
            sector="Ações", titles_text="- Ibovespa sobe 1%"
        )
        self.assertIn("Ações", s2)
        s3 = load_prompt("sentiment_analysis_v1.txt").format(
            ticker="MXRF11", qty=100, avg_price=9.5, target_pct=10.0,
            cvm_context_section="", news_list="- Dividendo anunciado"
        )
        self.assertIn("MXRF11", s3)

if __name__ == '__main__':
    unittest.main()
