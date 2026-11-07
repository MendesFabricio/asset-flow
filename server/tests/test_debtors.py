import unittest
from decimal import Decimal
from datetime import datetime, timedelta
from db.models.financials import Debtor, ReceivableLoan, LoanInstallment, PaymentTransaction

class TestDebtorFinancials(unittest.TestCase):
    def test_debtor_balance_calculations(self):
        debtor = Debtor(nome="João Silva", user_id=1)
        
        loan1 = ReceivableLoan(
            debtor=debtor,
            user_id=1,
            descricao="Empréstimo Notebook",
            valor_total=Decimal("3000.00"),
            is_deleted=False
        )
        
        loan2 = ReceivableLoan(
            debtor=debtor,
            user_id=1,
            descricao="Empréstimo Viagem",
            valor_total=Decimal("1500.00"),
            is_deleted=False
        )
        
        debtor.loans = [loan1, loan2]
        
        # Testa valor total emprestado (3000 + 1500 = 4500)
        self.assertEqual(debtor.valor_total_emprestado, Decimal("4500.00"))
        
        # Cria parcelas e pagamentos
        inst1 = LoanInstallment(loan=loan1, user_id=1, numero_parcela=1, valor_parcela=Decimal("1500.00"), data_vencimento=datetime.now(), is_deleted=False)
        tx1 = PaymentTransaction(installment=inst1, user_id=1, valor_pago=Decimal("1500.00"), tipo_movimentacao="PAGAMENTO")
        inst1.transactions = [tx1]
        loan1.installments = [inst1]
        
        # Testa valor total recebido (1500) e saldo pendente (4500 - 1500 = 3000)
        self.assertEqual(debtor.valor_total_recebido, Decimal("1500.00"))
        self.assertEqual(debtor.saldo_pendente, Decimal("3000.00"))

if __name__ == '__main__':
    unittest.main()
