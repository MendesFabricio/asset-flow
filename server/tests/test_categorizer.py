import unittest
from utils.categorizer_engine import categorizer_engine

class TestCategorizerEngine(unittest.TestCase):
    def test_exact_keywords(self):
        cat, conf, method = categorizer_engine.classify("PG *IFOOD RESTAURANTE SP")
        self.assertEqual(cat, "Alimentação")
        self.assertGreater(conf, 0.8)

        cat, conf, method = categorizer_engine.classify("UBER *TRIP HELP BR")
        self.assertEqual(cat, "Transporte")

        cat, conf, method = categorizer_engine.classify("DROGA RAIA 4312")
        self.assertEqual(cat, "Saúde/Farmácia")

        cat, conf, method = categorizer_engine.classify("NETFLIX.COM OSASCO")
        self.assertEqual(cat, "Lazer/Assinaturas")

    def test_ml_probabilities(self):
        # Descrição com ruído de maquininha não explícito no dataset
        cat, conf, method = categorizer_engine.classify("PAG*RestauranteSaborDoChef")
        self.assertEqual(cat, "Alimentação")

        cat, conf, method = categorizer_engine.classify("POSTO DE COMBUSTIVEL SANTA CRUZ")
        self.assertEqual(cat, "Transporte")

    def test_online_feedback_training(self):
        # Treina nova palavra chave
        categorizer_engine.train_example("Padaria do Joao Bairro", "Alimentação")
        cat, conf, _ = categorizer_engine.classify("Padaria do Joao Bairro")
        self.assertEqual(cat, "Alimentação")

if __name__ == '__main__':
    unittest.main()
