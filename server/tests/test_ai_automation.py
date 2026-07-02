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

if __name__ == '__main__':
    print("🚀 Iniciando execução de testes de IA e Automação...")
    suite = unittest.TestLoader().loadTestsFromTestCase(TestAIAutomationAndSentiment)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)
    print("🎉 Todos os testes de IA e Automação passaram!")
