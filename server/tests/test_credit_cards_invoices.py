import os
import sys
import unittest
from unittest.mock import patch
from datetime import datetime

server_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if server_dir not in sys.path:
    sys.path.insert(0, server_dir)

from backend import app
from db.models import Session, CreditCard, CardExpense, CardInstallment, safe_commit

class TestCreditCardsInvoices(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        self.patcher = patch('routes.auth.verify_session_token', return_value={"user_id": 1, "username": "teste"})
        self.mock_auth = self.patcher.start()
        self.client = app.test_client()
        self.client.set_cookie('assetflow_session', 'mocked_session_token')

    def tearDown(self):
        self.patcher.stop()

    def test_card_invoices_and_expenses_by_month(self):
        import uuid
        unique_name = f"Cartão Teste Faturas {uuid.uuid4().hex[:8]}"
        # 1. Cria um cartão de teste no banco
        response_card = self.client.post('/api/credit-cards', json={
            "name": unique_name,
            "limit": 5000.0,
            "closing_day": 5,
            "due_day": 12
        })
        self.assertEqual(response_card.status_code, 201)
        
        # Pega o ID do cartão criado
        with Session() as db:
            card = db.query(CreditCard).filter_by(name=unique_name, user_id=1, is_deleted=False).order_by(CreditCard.id.desc()).first()
            self.assertIsNotNone(card)
            card_id = card.id

        # 2. Verifica as faturas para o cartão recém-criado (sem despesas)
        # A fatura do mês atual DEVE existir com R$ 0,00 e status PENDING
        response_invoices = self.client.get(f'/api/credit-cards/{card_id}/invoices')
        self.assertEqual(response_invoices.status_code, 200)
        invoices_data = response_invoices.get_json()
        self.assertIsInstance(invoices_data, list)
        self.assertGreaterEqual(len(invoices_data), 1)
        
        # Encontra a fatura de hoje
        from utils.date_helper import get_invoice_month_helper
        current_month = get_invoice_month_helper(datetime.now(), 5)
        current_inv = next((inv for inv in invoices_data if inv["invoice_month"] == current_month), None)
        self.assertIsNotNone(current_inv)
        self.assertEqual(current_inv["total"], 0.0)
        self.assertEqual(current_inv["status"], "PENDING")

        # 3. Registra uma despesa parcelada em 3x no cartão com data explícita (ex: 2025-09-01)
        response_expense = self.client.post(f'/api/credit-cards/{card_id}/expenses', json={
            "description": "Compra Parcelada Teste",
            "total_value": 300.0,
            "installments_count": 3,
            "date": "2025-09-01"
        })
        self.assertEqual(response_expense.status_code, 201)

        # 4. Consulta faturas atualizadas
        response_invoices_updated = self.client.get(f'/api/credit-cards/{card_id}/invoices')
        self.assertEqual(response_invoices_updated.status_code, 200)
        invoices_updated = response_invoices_updated.get_json()
        
        # Como foi compra de 2025-09 em 3x, teremos faturas para 2025-09, 2025-10 e 2025-11 (e o mês atual se for diferente)
        inv_sep = next((inv for inv in invoices_updated if inv["invoice_month"] == "2025-09"), None)
        inv_oct = next((inv for inv in invoices_updated if inv["invoice_month"] == "2025-10"), None)
        inv_nov = next((inv for inv in invoices_updated if inv["invoice_month"] == "2025-11"), None)
        
        self.assertIsNotNone(inv_sep)
        self.assertEqual(inv_sep["total"], 100.0)
        self.assertIsNotNone(inv_oct)
        self.assertEqual(inv_oct["total"], 100.0)
        self.assertIsNotNone(inv_nov)
        self.assertEqual(inv_nov["total"], 100.0)

        # 5. Consulta despesas filtrando especificamente pelo mês 2025-10
        response_items_oct = self.client.get(f'/api/credit-cards/{card_id}/expenses?invoice_month=2025-10')
        self.assertEqual(response_items_oct.status_code, 200)
        data_oct = response_items_oct.get_json()
        self.assertIn("items", data_oct)
        items = data_oct["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["description"], "Compra Parcelada Teste")
        self.assertEqual(items[0]["installment_number"], 2)
        self.assertEqual(items[0]["installments_count"], 3)
        self.assertEqual(items[0]["value"], 100.0)
        self.assertEqual(items[0]["total_value"], 300.0)

    def test_consolidated_invoices_all_cards(self):
        # Valida que card_id=0 ou -1 retorna faturas consolidadas de todos os cartões
        res = self.client.get('/api/credit-cards/0/invoices')
        self.assertEqual(res.status_code, 200)
        invoices = res.get_json()
        self.assertIsInstance(invoices, list)

        res_neg = self.client.get('/api/credit-cards/-1/invoices')
        self.assertEqual(res_neg.status_code, 200)
        invoices_neg = res_neg.get_json()
        self.assertIsInstance(invoices_neg, list)

        res_exp = self.client.get('/api/credit-cards/0/expenses?invoice_month=2025-09')
        self.assertEqual(res_exp.status_code, 200)
        data = res_exp.get_json()
        self.assertIn("items", data)

        res_exp_neg = self.client.get('/api/credit-cards/-1/expenses?invoice_month=2025-09')
        self.assertEqual(res_exp_neg.status_code, 200)
        data_neg = res_exp_neg.get_json()
        self.assertIn("items", data_neg)

if __name__ == "__main__":
    unittest.main()
