import pytest
from unittest.mock import patch

from backend import app
from domain.quant.passive_income import simulate_passive_income
from domain.valuation.calculator import (
    calculate_bazin_price,
    calculate_dcf_price,
    calculate_gordon_price,
    calculate_graham_price,
    compute_magic_formula_ranks,
    compute_sector_averages,
    evaluate_fundamental_checklist,
)


def test_valuation_formulas_and_edge_cases():
    assert calculate_bazin_price(3.0, 6.0) == 50.0
    assert calculate_bazin_price(0.0, 6.0) is None
    assert calculate_bazin_price(3.0, 0.0) is None

    assert calculate_graham_price(2.0, 20.0) == 30.0
    assert calculate_graham_price(-1.0, 20.0) is None

    assert calculate_gordon_price(3.0, required_return_pct=12.0, growth_pct=5.0) == 45.0
    assert calculate_gordon_price(3.0, required_return_pct=0.0, growth_pct=5.0) is None

    dcf = calculate_dcf_price(4.0, growth_pct=8.0, terminal_growth_pct=3.0, discount_rate_pct=12.0, years=5)
    assert dcf is not None and dcf > 40.0
    assert calculate_dcf_price(-2.0) is None


def test_checklist_stock_and_fii():
    stock_items, stock_score = evaluate_fundamental_checklist(
        "Ação",
        {
            "price": 30.0,
            "pl": 8.0,
            "roe": 22.0,
            "net_margin": 18.0,
            "debt_to_ebitda": 1.2,
            "dy_12m": 8.5,
            "bazin_price": 42.0,
            "graham_price": 45.0,
        },
    )
    assert stock_score == 100
    assert all(i["status"] == "pass" for i in stock_items)

    fii_items, fii_score = evaluate_fundamental_checklist(
        "FII",
        {
            "price": 100.0,
            "pvp": 0.92,
            "dy_12m": 10.5,
            "bazin_price": 115.0,
            "leverage_pct": None,
        },
    )
    assert fii_score == 96
    assert any(i["key"] == "leverage" and i["status"] == "unknown" for i in fii_items)


def test_magic_formula_and_sector_averages():
    items = [
        {"ticker": "BEST3", "asset_type": "Ação", "sector": "Energia", "ev_ebitda": 4.0, "roic": 28.0, "dy_12m": 9.0, "pl": 6.0, "pvp": 1.1, "roe": 25.0, "net_margin": 20.0, "quality_score": 90},
        {"ticker": "MID3", "asset_type": "Ação", "sector": "Energia", "ev_ebitda": 8.0, "roic": 15.0, "dy_12m": 6.0, "pl": 11.0, "pvp": 1.5, "roe": 16.0, "net_margin": 12.0, "quality_score": 70},
        {"ticker": "WEAK3", "asset_type": "Ação", "sector": "Energia", "ev_ebitda": 20.0, "roic": 4.0, "dy_12m": 1.0, "pl": 30.0, "pvp": 3.0, "roe": 5.0, "net_margin": 3.0, "quality_score": 25},
    ]
    ranks = compute_magic_formula_ranks(items)
    assert ranks["BEST3"] == 100.0
    assert ranks["WEAK3"] == 0.0
    assert ranks["BEST3"] > ranks["MID3"] > ranks["WEAK3"]

    avgs = compute_sector_averages(items)
    assert avgs["Ação::Energia"]["pl"] == 11.0
    assert avgs["Ação::Energia"]["dy_12m"] == 6.0


def test_simulate_passive_income():
    sim_reinvest = simulate_passive_income(
        initial_portfolio=50000.0,
        monthly_contribution=2000.0,
        target_monthly_income=3000.0,
        annual_dy_pct=9.0,
        annual_growth_pct=4.0,
        reinvest_dividends=True,
        max_years=25,
    )
    sim_no_reinvest = simulate_passive_income(
        initial_portfolio=50000.0,
        monthly_contribution=2000.0,
        target_monthly_income=3000.0,
        annual_dy_pct=9.0,
        annual_growth_pct=4.0,
        reinvest_dividends=False,
        max_years=25,
    )
    assert sim_reinvest["months_to_goal"] is not None
    assert sim_reinvest["final_monthly_income"] > sim_no_reinvest["final_monthly_income"]
    assert len(sim_reinvest["annual_series"]) == 26


@pytest.fixture
def val_client():
    app.config["TESTING"] = True
    with patch("routes.auth.verify_session_token", return_value={"user_id": 1, "username": "teste"}):
        with app.test_client() as client:
            client.set_cookie("assetflow_session", "mocked_session_token")
            yield client


def test_valuation_routes(val_client):
    res_radar = val_client.get("/api/valuation/radar?strategy=quality")
    assert res_radar.status_code == 200
    assert res_radar.get_json()["status"] == "Sucesso"

    res_sim = val_client.post(
        "/api/valuation/passive-income",
        json={"initial_portfolio": 20000, "monthly_contribution": 1500, "target_monthly_income": 2500},
    )
    assert res_sim.status_code == 200
    assert res_sim.get_json()["data"]["final_patrimony"] > 20000

    fake_val = {
        "ticker": "TEST3",
        "name": "Test Corp",
        "asset_type": "Ação",
        "sector": "Energia",
        "price": 20.0,
        "dividend_per_share": 1.8,
        "dy_12m": 9.0,
        "bazin_price": 30.0,
        "graham_price": 35.0,
        "gordon_price": 27.0,
        "dcf_price": 32.0,
        "quality_score": 88,
        "checklist": [],
    }
    with patch("routes.valuation.get_or_fetch_asset_valuation", return_value=fake_val):
        res_asset = val_client.get("/api/valuation/asset/TEST3?bazin_dy=6")
        assert res_asset.status_code == 200
        assert res_asset.get_json()["data"]["bazin_price"] == 30.0

        res_cmp = val_client.get("/api/valuation/compare?tickers=TEST3")
        assert res_cmp.status_code == 200
        assert len(res_cmp.get_json()["items"]) == 1

        res_wl_add = val_client.post("/api/valuation/watchlist", json={"ticker": "TEST3", "desired_bazin_dy": 6.5})
        assert res_wl_add.status_code == 201
        res_wl_get = val_client.get("/api/valuation/watchlist")
        assert res_wl_get.status_code == 200
        assert any(i["ticker"] == "TEST3" for i in res_wl_get.get_json()["items"])
        res_wl_del = val_client.delete("/api/valuation/watchlist/TEST3")
        assert res_wl_del.status_code == 200


def test_apply_strategy_integrates_ai_bazin_quality_and_reduzir():
    import json
    from decimal import Decimal
    from unittest.mock import MagicMock
    from services_modules.dashboard_metrics import apply_strategy

    pos = MagicMock()
    pos.quantity = Decimal("100")
    pos.manual_dy = Decimal("0.08")
    pos.last_report_type = None
    pos.asset.category.name = "Ação"
    pos.asset.ai_sentiment = "Positivo"
    pos.asset.market_data = [MagicMock(rsi_14=45.0)]
    pos.asset.technical_data = None

    screener = MagicMock(bazin_price=40.0, quality_score=85)
    rec, status, score, motivo, _ = apply_strategy(
        pos,
        {"mg_graham": Decimal("25.0"), "mg_bazin": Decimal("25.0"), "p_vp": Decimal("1.0")},
        falta=Decimal("500.0"),
        preco=Decimal("30.0"),
        min_6m=Decimal("28.0"),
        screener_item=screener,
    )
    assert status == "COMPRA_FORTE"
    assert score >= 70
    assert "Sentimento IA Positivo" in motivo
    assert "Teto Bazin" in motivo
    assert "Alta Qualidade" in motivo

    # Cenário negativo acima da meta -> REDUZIR
    pos.asset.ai_sentiment = "Negativo"
    pos.asset.category.name = "FII"
    pos.last_report_type = json.dumps({"credit_risk": {"leverage_pct": 45.0}})
    pos.asset.market_data = [MagicMock(rsi_14=75.0)]
    screener_bad = MagicMock(bazin_price=80.0, quality_score=35)
    rec2, status2, score2, motivo2, _ = apply_strategy(
        pos,
        {"p_vp": Decimal("1.15"), "mg_bazin": Decimal("-25.0")},
        falta=Decimal("-100.0"),
        preco=Decimal("100.0"),
        min_6m=Decimal("70.0"),
        screener_item=screener_bad,
    )
    assert status2 == "REDUZIR"
    assert rec2 == "🟠 REDUZIR"
    assert "Alerta IA Negativo" in motivo2
    assert "Alavancagem FII Elevada" in motivo2

    # Extreme discount exception: even above target (falta <= 0), score >= 60 unlocks OPORTUNIDADE
    pos.asset.ai_sentiment = "Positivo"
    pos.asset.category.name = "Ação"
    pos.last_report_type = None
    pos.asset.market_data = [MagicMock(rsi_14=25.0)]
    screener_oportunidade = MagicMock(bazin_price=100.0, quality_score=90)
    rec3, status3, score3, motivo3, _ = apply_strategy(
        pos,
        {"mg_graham": Decimal("35.0"), "mg_bazin": Decimal("40.0"), "p_vp": Decimal("0.80")},
        falta=Decimal("-100.0"),
        preco=Decimal("65.0"),
        min_6m=Decimal("80.0"),
        screener_item=screener_oportunidade,
    )
    assert score3 >= 60
    assert status3 == "COMPRAR"
    assert rec3 == "🟢 OPORTUNIDADE"
    assert "Acima da Meta" in motivo3


def test_apply_strategy_blocks_missing_valuation_and_expensive_veto_and_zero_quality():
    from decimal import Decimal
    from unittest.mock import MagicMock
    from services_modules.dashboard_metrics import apply_strategy, calculate_fundamental_metrics

    # A1: Ação sem LPA/VPA/DY/quality com bônus técnicos não deve emitir COMPRA -> INCONCLUSIVO
    pos_missing = MagicMock()
    pos_missing.quantity = Decimal("100")
    pos_missing.manual_dy = Decimal("0.0")
    pos_missing.manual_lpa = Decimal("0.0")
    pos_missing.manual_vpa = Decimal("0.0")
    pos_missing.last_report_type = None
    pos_missing.asset.category.name = "Ação"
    pos_missing.asset.ai_sentiment = None
    pos_missing.asset.market_data = [MagicMock(rsi_14=28.0)]
    pos_missing.asset.technical_data = None

    m_empty = calculate_fundamental_metrics(pos_missing, Decimal("20.0"))
    rec_inc, status_inc, _, motivo_inc, _ = apply_strategy(
        pos_missing,
        m_empty,
        falta=Decimal("1000.0"),
        preco=Decimal("20.0"),
        min_6m=Decimal("19.5"),
        screener_item=None,
    )
    assert status_inc == "INCONCLUSIVO"
    assert rec_inc == "⚪ INCONCLUSIVO"
    assert "Sem Valuation Calculável" in motivo_inc
    assert "Graham (LPA/VPA)" in m_empty["criterios_nao_avaliados"]
    assert "Teto Bazin" in m_empty["criterios_nao_avaliados"]

    # A2: Ativo 20%+ caro em Graham e Bazin com bônus máximos recebe veto duro -> NEUTRO
    pos_exp = MagicMock()
    pos_exp.quantity = Decimal("100")
    pos_exp.manual_dy = Decimal("0.08")
    pos_exp.last_report_type = None
    pos_exp.asset.category.name = "Ação"
    pos_exp.asset.ai_sentiment = "Positivo"
    pos_exp.asset.market_data = [MagicMock(rsi_14=25.0)]
    pos_exp.asset.technical_data = None

    rec_veto, status_veto, _, motivo_veto, _ = apply_strategy(
        pos_exp,
        {"mg_graham": Decimal("-25.0"), "mg_bazin": Decimal("-25.0"), "p_vp": Decimal("2.0")},
        falta=Decimal("1000.0"),
        preco=Decimal("50.0"),
        min_6m=Decimal("49.0"),
        screener_item=MagicMock(bazin_price=35.0, quality_score=90),
    )
    assert status_veto == "NEUTRO"
    assert rec_veto == "🟡 MANTER"
    assert "Veto Valuation Caro" in motivo_veto

    # A2 OR puro: Graham levemente positivo (+10%), Bazin caro (-25%) -> vetado mesmo com score 81
    rec_or, status_or, score_or, motivo_or, _ = apply_strategy(
        pos_exp,
        {"mg_graham": Decimal("10.0"), "mg_bazin": Decimal("-25.0"), "p_vp": Decimal("1.1")},
        falta=Decimal("1000.0"),
        preco=Decimal("50.0"),
        min_6m=Decimal("49.0"),
        screener_item=MagicMock(bazin_price=37.5, quality_score=90),
    )
    assert score_or >= 70
    assert status_or == "NEUTRO"
    assert rec_or == "🟡 MANTER"
    assert "Veto Valuation Caro" in motivo_or

    # A3: quality_score == 0 não escapa por truthiness -> recebe penalidade -15
    rec_q0, status_q0, score_q0, motivo_q0, _ = apply_strategy(
        pos_exp,
        {"mg_graham": Decimal("25.0"), "mg_bazin": Decimal("25.0"), "p_vp": Decimal("0.9")},
        falta=Decimal("500.0"),
        preco=Decimal("30.0"),
        min_6m=Decimal("29.0"),
        screener_item=MagicMock(bazin_price=40.0, quality_score=0),
    )
    assert "Qualidade Fundamentalista Baixa (-15) [0/100]" in motivo_q0


def test_gordon_dcf_g_ge_k_guard_and_usd_pvp_and_signal_history(val_client):
    from decimal import Decimal
    from unittest.mock import MagicMock
    from services_modules.dashboard_metrics import calculate_fundamental_metrics

    # B1/B2: g >= k retorna None (antes do clamp)
    assert calculate_gordon_price(3.0, required_return_pct=12.0, growth_pct=12.0) is None
    assert calculate_dcf_price(4.0, growth_pct=7.0, terminal_growth_pct=12.5, discount_rate_pct=12.5) is None

    # B5: ativo em USD multiplica preco * fator antes de dividir por vpa em BRL
    pos_usd = MagicMock()
    pos_usd.quantity = Decimal("10")
    pos_usd.manual_dy = Decimal("0.0")
    pos_usd.manual_lpa = Decimal("0.0")
    pos_usd.manual_vpa = Decimal("100.0")  # BRL
    pos_usd.asset.category.name = "Internacional"
    m_usd = calculate_fundamental_metrics(pos_usd, Decimal("20.0"), fator=Decimal("5.0"))
    assert m_usd["p_vp"] == Decimal("1.0")

    # F5: rota de histórico de sinais responde 200 com estrutura de backtest e recent_changes
    res_hist = val_client.get("/api/valuation/signals/history?ticker=PETR4")
    assert res_hist.status_code == 200
    hist_json = res_hist.get_json()
    assert hist_json["status"] == "Sucesso"
    assert "backtest" in hist_json["summary"]
    assert "recent_changes" in hist_json["summary"]


def test_signal_snapshot_change_alert_and_backtest(val_client):
    from datetime import date, timedelta
    from decimal import Decimal
    from db.models import Asset, MarketData, SignalSnapshot, TriggeredAlert, safe_commit
    from db.session import Session
    from services_modules.backup import BackupService

    with Session() as session:
        asset = session.query(Asset).filter_by(ticker="TESTSIG3").first()
        if not asset:
            from db.models import Category
            cat = session.query(Category).first()
            asset = Asset(ticker="TESTSIG3", name="Test Signal", category_id=cat.id, currency="BRL")
            session.add(asset)
            safe_commit(session)
        asset_id = int(asset.id)

        day_prev = date.today() - timedelta(days=190)
        day_cur = date.today() - timedelta(days=2)
        day_same = date.today() - timedelta(days=1)

        # Limpa resíduos anteriores do ticker de teste
        session.query(SignalSnapshot).filter_by(user_id=1, asset_id=asset_id).delete()
        session.query(TriggeredAlert).filter_by(ticker="TESTSIG3").delete()
        session.query(MarketData).filter_by(asset_id=asset_id).delete()
        safe_commit(session)

        # Snapshot antigo (NEUTRO a R$ 10) e cotações +30d (12 -> +20%), +90d (13 -> +30%), +180d (15 -> +50%)
        session.add(SignalSnapshot(
            user_id=1, asset_id=asset_id, ticker="TESTSIG3", date=day_prev,
            score=40, status="NEUTRO", recomendacao="🟡 MANTER",
            preco=Decimal("10.00"), mg_graham=Decimal("5.0"), mg_bazin=Decimal("5.0"),
            p_vp=Decimal("1.0"), quality_score=70,
        ))
        session.add(MarketData(asset_id=asset_id, date=day_prev + timedelta(days=32), price=Decimal("12.00")))
        session.add(MarketData(asset_id=asset_id, date=day_prev + timedelta(days=92), price=Decimal("13.00")))
        session.add(MarketData(asset_id=asset_id, date=day_prev + timedelta(days=182), price=Decimal("15.00")))
        safe_commit(session)

        # Novo snapshot mudando status para COMPRA_FORTE gera TriggeredAlert
        BackupService()._upsert_signal_snapshots(
            session,
            user_id=1,
            ativos=[{
                "id": asset_id, "ticker": "TESTSIG3", "score": 82, "status": "COMPRA_FORTE",
                "recomendacao": "🟢 APORTAR FORTE", "preco_atual": 12.0,
                "mg_graham": 25.0, "mg_bazin": 30.0, "p_vp": 0.9, "quality_score": 85,
            }],
            snap_date=day_cur,
        )
        safe_commit(session)

        # Snapshot seguinte no mesmo status COMPRA_FORTE NÃO deve duplicar alerta
        BackupService()._upsert_signal_snapshots(
            session,
            user_id=1,
            ativos=[{
                "id": asset_id, "ticker": "TESTSIG3", "score": 83, "status": "COMPRA_FORTE",
                "recomendacao": "🟢 APORTAR FORTE", "preco_atual": 12.1,
                "mg_graham": 24.0, "mg_bazin": 29.0, "p_vp": 0.9, "quality_score": 85,
            }],
            snap_date=day_same,
        )
        safe_commit(session)

        alerts = session.query(TriggeredAlert).filter_by(ticker="TESTSIG3", condition="SIGNAL_CHANGE").all()
        assert len(alerts) == 1
        assert "NEUTRO → COMPRA_FORTE" in alerts[0].note

    res = val_client.get("/api/valuation/signals/history?ticker=TESTSIG3")
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["summary"]["total"] == 3
    assert len(payload["summary"]["recent_changes"]) == 1
    assert payload["summary"]["recent_changes"][0]["to_status"] == "COMPRA_FORTE"
    old_item = next(i for i in payload["items"] if i["status"] == "NEUTRO")
    assert old_item["forward_return_30d"] == 20.0
    assert old_item["forward_return_90d"] == 30.0
    assert old_item["forward_return_180d"] == 50.0
    assert payload["summary"]["backtest"]["NEUTRO"]["avg_return_30d"] == 20.0
    assert payload["summary"]["backtest"]["NEUTRO"]["avg_return_90d"] == 30.0
    assert payload["summary"]["backtest"]["NEUTRO"]["avg_return_180d"] == 50.0

    # Cleanup
    with Session() as session:
        session.query(SignalSnapshot).filter_by(ticker="TESTSIG3").delete()
        session.query(TriggeredAlert).filter_by(ticker="TESTSIG3").delete()
        session.query(MarketData).filter_by(asset_id=asset_id).delete()
        safe_commit(session)
