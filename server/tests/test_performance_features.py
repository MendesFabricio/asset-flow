from datetime import date, datetime, timedelta
from decimal import Decimal
import json
from unittest.mock import MagicMock, patch

import pytest

from domain.portfolio.attribution import calculate_monthly_attribution
from domain.portfolio.xirr import calculate_xirr
from domain.tax.tax_engine import calculate_monthly_darf, simulate_sell_impact
from services_modules.backup import BackupService


@patch("db.session.Session")
def test_calculate_monthly_darf_idempotent(mock_session_cls):
    mock_session = MagicMock()
    mock_session_cls.return_value = mock_session
    mock_session.__enter__.return_value = mock_session

    mock_profile = MagicMock(
        accumulated_loss_stocks_st=Decimal("1000.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("5.0"),
    )

    tx = MagicMock()
    tx.id = 10
    tx.ticker = "VALE3"
    tx.transaction_date = datetime(2026, 8, 20)
    tx.total_value = Decimal("25000.0")
    tx.cost_basis = Decimal("23.0")
    tx.quantity = Decimal("1000")
    tx.type = "SELL"
    tx.is_day_trade = False

    asset = MagicMock(ticker="VALE3")
    category = MagicMock()
    category.name = "Ação"

    mock_query = MagicMock()
    mock_session.query.return_value = mock_query
    mock_query.filter_by.return_value.first.return_value = mock_profile
    mock_query.filter.return_value.all.return_value = []
    mock_query.join.return_value.join.return_value.filter.return_value.all.return_value = [
        (tx, asset, category)
    ]

    first = calculate_monthly_darf(1, 8, 2026)
    second = calculate_monthly_darf(1, 8, 2026)

    assert first == second
    assert first["taxes"]["stocks_st"] == 150.0
    assert first["darf"]["darf_to_pay"] == 155.0
    assert first["accumulated_losses"]["stocks_st"] == 0.0
    # Perfil não pode ser mutado em consultas GET
    assert mock_profile.accumulated_loss_stocks_st == Decimal("1000.0")
    assert mock_profile.accumulated_darf_balance == Decimal("5.0")
    mock_session.commit.assert_not_called()


@patch("services_modules.backup.safe_commit")
@patch("services_modules.backup.Session")
def test_backup_take_daily_snapshot_uses_dashboard_keys(mock_session_cls, mock_safe_commit):
    mock_session = MagicMock()
    mock_session_cls.return_value.__enter__.return_value = mock_session

    user = MagicMock(id=7)
    snap_q = MagicMock()
    snap_q.filter_by.return_value.filter.return_value.first.return_value = None

    user_q = MagicMock()
    user_q.all.return_value = [user]

    mock_session.query.side_effect = [user_q, snap_q]

    svc = BackupService()
    svc._backup_database = MagicMock()
    svc.get_dashboard_data = MagicMock(
        return_value={
            "resumo": {"Total": 50000.0, "TotalInvestido": 40000.0},
            "grafico": [{"name": "Ação", "value": 30000.0}, {"name": "FII", "value": 20000.0}],
        }
    )

    svc.take_daily_snapshot()

    mock_session.add.assert_called_once()
    created_snap = mock_session.add.call_args[0][0]
    assert created_snap.total_equity == Decimal("50000.0")
    assert created_snap.total_invested == Decimal("40000.0")
    assert created_snap.profit == Decimal("10000.0")
    assert json.loads(created_snap.breakdown) == {"Ação": 30000.0, "FII": 20000.0}
    mock_safe_commit.assert_called_once_with(mock_session)


@patch("domain.portfolio.attribution.get_monthly_ipca_series")
@patch("domain.portfolio.attribution.get_monthly_evolution_series")
def test_calculate_monthly_attribution_accounting_identity(mock_evo, mock_ipca):
    mock_evo.return_value = [
        {"year": 2026, "month": 1, "period": "01/2026", "total_market_value": 1200.0},
        {"year": 2026, "month": 2, "period": "02/2026", "total_market_value": 1800.0},
    ]
    mock_ipca.return_value = ({(2026, 1): 0.005, (2026, 2): 0.01}, "test")

    tx_rows = [
        ("BUY", Decimal("1000.0"), date(2026, 1, 10)),
        ("BUY", Decimal("500.0"), date(2026, 2, 5)),
        ("SELL", Decimal("100.0"), date(2026, 2, 15)),
    ]
    div_rows = [
        (Decimal("25.0"), date(2026, 2, 20), date(2026, 2, 10)),
    ]

    mock_session = MagicMock()
    tx_query = MagicMock()
    tx_query.filter.return_value.all.return_value = tx_rows
    div_query = MagicMock()
    div_query.filter.return_value.all.return_value = div_rows
    mock_session.query.side_effect = [tx_query, div_query]

    res = calculate_monthly_attribution(mock_session, user_id=1)

    assert len(res["series"]) == 2
    m1, m2 = res["series"]

    assert m1["aportes_liquidos"] == 1000.0
    assert m1["variacao_mercado"] == 200.0
    assert m1["crescimento_custodia"] == pytest.approx(m1["aportes_liquidos"] + m1["variacao_mercado"])

    assert m2["aportes_liquidos"] == 400.0
    assert m2["crescimento_custodia"] == 600.0
    assert m2["variacao_mercado"] == 200.0
    assert m2["dividendos"] == 25.0
    assert m2["retorno_total"] == 225.0
    # IPCA de 1% sobre patrimônio inicial R$ 1.200 = R$ 12 de erosão
    assert m2["erosao_ipca"] == 12.0
    assert m2["variacao_mercado_real"] == 188.0


def test_calculate_xirr_known_flows():
    rate = calculate_xirr([(date(2025, 1, 1), -1000.0), (date(2026, 1, 1), 1100.0)])
    assert rate is not None
    assert rate == pytest.approx(0.10, abs=1e-4)

    staggered = [
        (date(2025, 1, 1), -1000.0),
        (date(2025, 7, 2), -1000.0),
        (date(2026, 1, 1), 2200.0),
    ]
    staggered_rate = calculate_xirr(staggered)
    assert staggered_rate is not None
    d0 = date(2025, 1, 1)
    npv = sum(amt * ((1.0 + staggered_rate) ** (-((d - d0).days / 365.0))) for d, amt in staggered)
    assert npv == pytest.approx(0.0, abs=1e-3)

    # Fluxos apenas de saída não determinam TIR
    assert calculate_xirr([(date(2025, 1, 1), -500.0), (date(2025, 6, 1), -500.0)]) is None


@patch("domain.tax.tax_engine.get_or_create_tax_profile")
@patch("domain.tax.tax_engine.calculate_monthly_darf")
@patch("db.models.get_active_positions")
def test_simulate_sell_exemption_cliff_and_harvesting(mock_positions, mock_darf, mock_profile_fn):
    mock_darf.return_value = {
        "sales_total_stocks": 12000.0,
        "profits": {"stocks_st": 2000.0, "stocks_dt": 0.0, "fiis": 0.0},
        "darf": {"month_tax": 0.0, "darf_to_pay": 0.0},
    }
    mock_profile_fn.return_value = MagicMock(
        accumulated_loss_stocks_st=Decimal("0.0"),
        accumulated_loss_stocks_dt=Decimal("0.0"),
        accumulated_loss_fiis=Decimal("0.0"),
        accumulated_darf_balance=Decimal("0.0"),
    )

    pos_win = MagicMock()
    pos_win.asset.ticker = "VALE3"
    pos_win.asset.currency = "BRL"
    pos_win.asset.category.name = "Ação"
    pos_win.asset.market_data = [MagicMock(price=Decimal("50.0"))]
    pos_win.average_price = Decimal("40.0")
    pos_win.quantity = Decimal("300")

    pos_loss = MagicMock()
    pos_loss.asset.ticker = "PETR4"
    pos_loss.asset.currency = "BRL"
    pos_loss.asset.category.name = "Ação"
    pos_loss.asset.market_data = [MagicMock(price=Decimal("30.0"))]
    pos_loss.average_price = Decimal("40.0")
    pos_loss.quantity = Decimal("200")

    mock_positions.return_value.all.return_value = [pos_win, pos_loss]

    mock_session = MagicMock()
    res = simulate_sell_impact(
        mock_session,
        user_id=1,
        sales=[{"ticker": "VALE3", "quantity": 200}],
        month=8,
        year=2026,
    )

    impact = res["tax_impact"]
    assert impact["breaks_20k_exemption"] is True
    assert impact["total_month_stock_sales"] == 22000.0
    # 2000 existente + 2000 simulado = 4000 lucro total x 15% = 600.0
    assert impact["estimated_darf_delta"] == 600.0
    assert len(res["tax_loss_harvesting"]) == 1
    assert res["tax_loss_harvesting"][0]["ticker"] == "PETR4"
    assert res["tax_loss_harvesting"][0]["unrealized_loss"] == -2000.0
    assert res["tax_loss_harvesting"][0]["potential_tax_savings"] == 300.0
