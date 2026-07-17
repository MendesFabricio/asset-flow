import os
import sys
import unittest

# Adiciona o diretório server ao sys.path para importação limpa
server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from utils.statement_parser import parse_statement

class TestStatementParser(unittest.TestCase):
    def test_parse_nubank_pdf(self):
        pdf_path = os.path.join(os.path.dirname(__file__), "sample_nubank.pdf")
        if not os.path.exists(pdf_path):
            self.skipTest(f"Arquivo de teste {pdf_path} não encontrado.")
            
        result = parse_statement(pdf_path, "sample_nubank.pdf")
        
        # 1. Período
        self.assertEqual(result["period"], "01 DE SETEMBRO DE 2025 a 30 DE SETEMBRO DE 2025")
        
        # 2. Resumo
        summary = result["summary"]
        self.assertAlmostEqual(summary["saldo_inicial"], 26.09, places=2)
        self.assertAlmostEqual(summary["total_entradas"], 2683.00, places=2)
        self.assertAlmostEqual(summary["total_saidas"], -2676.73, places=2)
        self.assertAlmostEqual(summary["saldo_final"], 32.36, places=2)
        
        # 3. Breakdown
        breakdown = result["breakdown"]
        self.assertAlmostEqual(breakdown["total_debito"], 74.74, places=2)
        self.assertAlmostEqual(breakdown["total_credito_pago"], 2152.75, places=2)
        self.assertAlmostEqual(breakdown["total_pix_enviado"], 270.35, places=2)
        self.assertAlmostEqual(breakdown["total_pix_recebido"], 2633.00, places=2)
        
        # 4. Transações
        txs = result["transactions"]
        self.assertEqual(len(txs), 22)
        
        # Verifica categorização específica
        drogaria = next((t for t in txs if "DROGARIA" in t["description"]), None)
        self.assertIsNotNone(drogaria)
        self.assertEqual(drogaria["category"], "Saúde/Farmácia")
        
        coffee = next((t for t in txs if "COFFEE TIME" in t["description"]), None)
        self.assertIsNotNone(coffee)
        self.assertEqual(coffee["category"], "Alimentação")
        
        # 5. Verifica Mês Detectado pelo Nome e Período
        self.assertEqual(result.get("detected_month"), "09/2025")
        self.assertEqual(result.get("detected_month_label"), "Setembro/2025")

    def test_detect_reference_month_from_filename(self):
        from utils.statement_parser import detect_reference_month
        month, label = detect_reference_month("NU_469900485_01SET2025_30SET2025.pdf", "", [])
        self.assertEqual(month, "09/2025")
        self.assertEqual(label, "Setembro/2025")
        
        month_out, label_out = detect_reference_month("relatorio_OUT2026_final.pdf", "", [])
        self.assertEqual(month_out, "10/2026")
        self.assertEqual(label_out, "Outubro/2026")

    def test_sanitize_person_names(self):
        from utils.statement_parser import sanitize_and_categorize
        desc, cat = sanitize_and_categorize("Transferência enviada pelo Pix - JOAO DA SILVA", "pix_out")
        self.assertEqual(desc, "Transação (Pix) - Joao Da Silva")
        self.assertEqual(cat, "Transferências/Pessoas")

if __name__ == "__main__":
    unittest.main()
