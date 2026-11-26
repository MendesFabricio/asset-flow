from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

from domain.portfolio.ledger_replay import compute_qty_at_date, replay_position_transactions


def test_chronological_replay_backdated_buy_and_split():
    ce_split = SimpleNamespace(id=10, factor=Decimal("2"), percent=None, unit_cost=None, cost_percent=None)
    tx1 = SimpleNamespace(
        id=1,
        transaction_date=datetime(2025, 1, 10),
        type="BUY",
        quantity=Decimal("100"),
        unit_price=Decimal("20"),
        total_value=Decimal("2000"),
        cost_basis=None,
        corporate_event_id=None,
    )
    tx_retro = SimpleNamespace(
        id=4,
        transaction_date=datetime(2025, 2, 1),
        type="BUY",
        quantity=Decimal("100"),
        unit_price=Decimal("10"),
        total_value=Decimal("1000"),
        cost_basis=None,
        corporate_event_id=None,
    )
    tx_split = SimpleNamespace(
        id=2,
        transaction_date=datetime(2025, 3, 1),
        type="SPLIT",
        quantity=Decimal("200"),
        unit_price=Decimal("10"),
        total_value=Decimal("0"),
        cost_basis=None,
        corporate_event_id=10,
    )
    tx_sell = SimpleNamespace(
        id=3,
        transaction_date=datetime(2025, 4, 1),
        type="SELL",
        quantity=Decimal("150"),
        unit_price=Decimal("12"),
        total_value=Decimal("1800"),
        cost_basis=None,
        corporate_event_id=None,
    )

    qty, pm = replay_position_transactions([tx_sell, tx_split, tx1, tx_retro], corp_events_by_id={10: ce_split})

    # Pre-split: 200 shares @ total 3000 (PM 15) -> split 2x: 400 shares @ PM 7.50 -> sell 150 -> 250 shares @ PM 7.50
    assert qty == Decimal("250")
    assert pm == Decimal("7.5")
    assert tx_sell.cost_basis == Decimal("7.5")

    assert compute_qty_at_date([tx1, tx_retro, tx_split, tx_sell], date(2025, 1, 15)) == 100.0
    assert compute_qty_at_date([tx1, tx_retro, tx_split, tx_sell], date(2025, 2, 15)) == 200.0
    assert compute_qty_at_date([tx1, tx_retro, tx_split, tx_sell], date(2025, 3, 15)) == 400.0
    assert compute_qty_at_date([tx1, tx_retro, tx_split, tx_sell], date(2025, 4, 15)) == 250.0


def test_legacy_fractional_auction_no_double_subtraction():
    tx_buy = SimpleNamespace(
        id=1,
        transaction_date=datetime(2025, 1, 5),
        type="BUY",
        quantity=Decimal("15"),
        unit_price=Decimal("10"),
        total_value=Decimal("150"),
        cost_basis=None,
        corporate_event_id=None,
    )
    # Legacy Inplit already stored floored integer quantity = 1 with corporate_event_id=77
    tx_inplit = SimpleNamespace(
        id=2,
        transaction_date=datetime(2025, 2, 5),
        type="INPLIT",
        quantity=Decimal("1"),
        unit_price=Decimal("100"),
        total_value=Decimal("0"),
        cost_basis=None,
        corporate_event_id=77,
    )
    tx_auction_sell = SimpleNamespace(
        id=3,
        transaction_date=datetime(2025, 2, 5),
        type="SELL",
        quantity=Decimal("0.5"),
        unit_price=Decimal("90"),
        total_value=Decimal("45"),
        cost_basis=None,
        corporate_event_id=77,
    )

    qty, pm = replay_position_transactions([tx_buy, tx_inplit, tx_auction_sell], corp_events_by_id=None)

    assert qty == Decimal("1")
    assert pm == Decimal("100")
    assert tx_auction_sell.cost_basis == Decimal("100")
    assert compute_qty_at_date([tx_buy, tx_inplit, tx_auction_sell], date(2025, 2, 10)) == 1.0


def test_bonus_amortization_spinoff_cost_conservation():
    ce_bonus = SimpleNamespace(id=20, factor=None, percent=Decimal("10"), unit_cost=Decimal("5"), cost_percent=None)
    ce_amort = SimpleNamespace(id=21, factor=None, percent=None, unit_cost=Decimal("2"), cost_percent=None)
    ce_spin = SimpleNamespace(id=22, factor=None, percent=None, unit_cost=None, cost_percent=Decimal("25"))

    tx1 = SimpleNamespace(id=1, transaction_date=datetime(2025, 1, 1), type="BUY", quantity=Decimal("100"), unit_price=Decimal("20"), total_value=Decimal("2000"), corporate_event_id=None)
    tx2 = SimpleNamespace(id=2, transaction_date=datetime(2025, 2, 1), type="BONUS", quantity=Decimal("0"), unit_price=Decimal("0"), total_value=Decimal("0"), corporate_event_id=20)
    tx3 = SimpleNamespace(id=3, transaction_date=datetime(2025, 3, 1), type="AMORTIZATION", quantity=Decimal("0"), unit_price=Decimal("0"), total_value=Decimal("0"), corporate_event_id=21)
    tx4 = SimpleNamespace(id=4, transaction_date=datetime(2025, 4, 1), type="SPIN_OFF", quantity=Decimal("0"), unit_price=Decimal("0"), total_value=Decimal("0"), corporate_event_id=22)

    qty, pm = replay_position_transactions([tx1, tx2, tx3, tx4], corp_events_by_id={20: ce_bonus, 21: ce_amort, 22: ce_spin})

    # Bonus: 100*20 + 10*5 = 2050 / 110 = 18.63636...
    # Amort -2/sh => 16.63636...
    # Spin-off 25% => remaining 75% of 16.63636... = 12.47727...
    expected_after_bonus = Decimal("2050") / Decimal("110")
    expected_final = (expected_after_bonus - Decimal("2")) * Decimal("0.75")
    assert qty == Decimal("110")
    assert abs(pm - expected_final) < Decimal("0.0001")

    child_pm = (expected_after_bonus - Decimal("2")) * Decimal("0.25")
    assert abs((qty * pm) + (qty * child_pm) - (qty * (expected_after_bonus - Decimal("2")))) < Decimal("0.01")


def test_inplit_fractional_without_auction_conserves_total_cost():
    ce_inplit = SimpleNamespace(id=30, factor=Decimal("10"), percent=None, unit_cost=None, cost_percent=None)
    tx1 = SimpleNamespace(id=1, transaction_date=datetime(2025, 1, 1), type="BUY", quantity=Decimal("15"), unit_price=Decimal("10"), total_value=Decimal("150"), corporate_event_id=None)
    tx2 = SimpleNamespace(id=2, transaction_date=datetime(2025, 2, 1), type="INPLIT", quantity=Decimal("1"), unit_price=Decimal("100"), total_value=Decimal("0"), corporate_event_id=30)

    qty, pm = replay_position_transactions([tx1, tx2], corp_events_by_id={30: ce_inplit})
    assert qty == Decimal("1")
    assert pm == Decimal("150")
