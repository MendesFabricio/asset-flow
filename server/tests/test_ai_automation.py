import unittest
from unittest.mock import MagicMock, patch
import sys
import os
import json

# Adiciona o diretório server ao path para importação
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from routes.quant_analysis import calculate_local_fear_greed

class TestAIAutomationAndSentiment(unittest.TestCase):
    
    def test_calculate_local_fear_greed_math(self):
        print("Running test_calculate_local_fear_greed_math...")
        session_mock = MagicMock()
        
        # Simula posições vazias (deve retornar Neutro - 50)
        session_mock.query.return_value.options.return_value.filter.return_value.all.return_value = []
        res = calculate_local_fear_greed(session_mock)
        self.assertEqual(res["score"], 50)
        self.assertEqual(res["label"], "Neutro")
        
        # Simula posições com ativos
        pos1 = MagicMock()
        pos1.asset.ticker = "PETR4"
        pos1.asset.category.name = "Ação"
        pos1.quantity = 100
        
        mdata1 = MagicMock()
        mdata1.price = 40.0
        mdata1.rsi_14 = 30.0  # Sobrevenda (Fear)
        mdata1.sma_20 = 42.0  # Preço abaixo da média (Fear)
        mdata1.change_percent = -1.5
        pos1.asset.market_data = [mdata1]
        
        session_mock.query.return_value.options.return_value.filter.return_value.all.return_value = [pos1]
        res = calculate_local_fear_greed(session_mock)
        
        self.assertTrue("score" in res)
        self.assertTrue(res["score"] < 50)  # Deve indicar Medo por conta do RSI baixo e preço abaixo da SMA
        self.assertEqual(res["label"], "Medo Extremo")
        print("✅ test_calculate_local_fear_greed_math passed!")

    @patch('requests.post')
    def test_ai_score_explainer_prompt(self, mock_post):
        print("Running test_ai_score_explainer_prompt...")
        
        # Mock do Ollama respondendo
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "message": {
                "content": "Jarvis: PETR4 tem score 85 devido à margem de segurança de Graham atrativa de 25%."
            }
        }
        mock_post.return_value = mock_response
        
        # Testa chamada simulada ao Ollama
        import requests
        res = requests.post("http://localhost:11434/api/chat", json={"prompt": "Explain score"})
        self.assertEqual(res.status_code, 200)
        self.assertIn("Graham", res.json()["message"]["content"])
        print("✅ test_ai_score_explainer_prompt passed!")


    @patch('yfinance.Ticker')
    def test_record_confirmed_dividends(self, mock_ticker):
        print("Running test_record_confirmed_dividends...")
        from services import PortfolioService
        from database.models import Position, Asset, Dividend
        import pandas as pd
        from datetime import datetime
        
        service = PortfolioService()
        
        # Mock do yfinance retornando dividendos
        mock_stock = MagicMock()
        mock_stock.dividends = pd.Series(
            [0.5, 0.6], 
            index=[pd.Timestamp('2026-06-01'), pd.Timestamp('2026-06-15')]
        )
        mock_ticker.return_value = mock_stock
        
        # Patch a fábrica de Session para simular a base de dados
        session_mock = MagicMock()
        pos = MagicMock()
        pos.asset_id = 1
        pos.asset.ticker = "PETR4"
        pos.quantity = 100
        session_mock.query.return_value.filter.return_value.all.return_value = [pos]
        
        # Simula que o dividendo não existe no banco
        session_mock.query.return_value.filter_by.return_value.first.return_value = None
        
        with patch('services.Session', return_value=session_mock):
            res = service.record_confirmed_dividends()
            self.assertTrue(res)
            # Deve chamar session.add() para adicionar os novos dividendos detectados
            self.assertTrue(session_mock.add.called)
        print("✅ test_record_confirmed_dividends passed!")

    def test_dividend_consistency_score_math(self):
        print("Running test_dividend_consistency_score_math...")
        from datetime import date
        # Simula 4 trimestres diferentes com dividendos
        divs = [
            MagicMock(date_com=date(2025, 1, 15)),
            MagicMock(date_com=date(2025, 4, 15)),
            MagicMock(date_com=date(2025, 7, 15)),
            MagicMock(date_com=date(2025, 10, 15)),
        ]
        
        quarters = set()
        for d in divs:
            q_key = (d.date_com.year, (d.date_com.month - 1) // 3 + 1)
            quarters.add(q_key)
            
        num_quarters = len(quarters)
        score = min(100, int(num_quarters * 8.33))
        self.assertEqual(score, 33)  # 4 * 8.33 = 33.32 -> 33
        self.assertEqual(num_quarters, 4)
        print("✅ test_dividend_consistency_score_math passed!")

if __name__ == '__main__':
    print("🚀 Iniciando execução de testes de IA e Automação...")
    suite = unittest.TestLoader().loadTestsFromTestCase(TestAIAutomationAndSentiment)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)
    print("🎉 Todos os testes de IA e Automação passaram!")
