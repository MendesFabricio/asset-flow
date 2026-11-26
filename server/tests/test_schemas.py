import pytest
from schemas import (
    FixedIncomeCreate,
    RefundConfigUpdate,
)

class TestFixedIncomeCreate:
    def test_valid(self):
        data = {
            "ticker": "CDB123",
            "name": "CDB Banco XYZ",
            "index_type": "CDI",
            "interest_rate": 12.5,
            "quantity": 10,
            "average_price": 1000.0,
            "issue_date": "2024-01-01T00:00:00",
            "due_date": "2025-01-01T00:00:00",
        }
        obj = FixedIncomeCreate(**data)
        assert obj.ticker == "CDB123"
        assert obj.index_type == "CDI"
        assert obj.interest_rate == 12.5

    def test_invalid_index_type(self):
        with pytest.raises(Exception):
            FixedIncomeCreate(
                ticker="CDB123",
                name="CDB Banco XYZ",
                index_type="INVALID",
                interest_rate=12.5,
                quantity=10,
                average_price=1000.0,
                issue_date="2024-01-01",
                due_date="2025-01-01",
            )

    def test_negative_quantity(self):
        with pytest.raises(Exception):
            FixedIncomeCreate(
                ticker="CDB123",
                name="CDB Banco XYZ",
                index_type="CDI",
                interest_rate=12.5,
                quantity=-1,
                average_price=1000.0,
                issue_date="2024-01-01",
                due_date="2025-01-01",
            )

class TestRefundConfigUpdate:
    def test_valid(self):
        data = {"fechamento_dia": 15, "vencimento_dia": 20}
        obj = RefundConfigUpdate(**data)
        assert obj.fechamento_dia == 15
        assert obj.vencimento_dia == 20

    def test_invalid_days(self):
        with pytest.raises(Exception):
            RefundConfigUpdate(fechamento_dia=0, vencimento_dia=20)
        with pytest.raises(Exception):
            RefundConfigUpdate(fechamento_dia=15, vencimento_dia=32)
