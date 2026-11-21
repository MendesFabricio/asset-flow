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
        min_6m=Decimal("29.0"),
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
        {"mg_graham": Decimal("-25.0"), "mg_bazin": Decimal("20.0"), "p_vp": Decimal("2.0")},
        falta=Decimal("1000.0"),
        preco=Decimal("50.0"),
        min_6m=Decimal("49.0"),
        screener_item=MagicMock(bazin_price=60.0, quality_score=90),
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
    assert score_or >= 65
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


def test_indicators_and_ai_validation_suite():
    from datetime import datetime, timedelta
    from decimal import Decimal
    from types import SimpleNamespace
    from unittest.mock import MagicMock
    import pandas as pd

    import domain.quant.rebalance as reb_mod
    from domain.quant.rebalance import calculate_smart_rebalance
    from infrastructure.screener_service import _compute_dividend_metrics, _safe_pct
    from services_modules.dashboard_metrics import apply_strategy, calculate_fundamental_metrics

    # A1 + A5: Sentiment IA não altera alocação em reais nem quebra por case
    def _run_rebalance(sent_a, sent_b):
        cat = SimpleNamespace(name="Ação", target_percent=100.0)
        a1 = SimpleNamespace(ticker="AAA3", currency="BRL", category=cat, market_data=[SimpleNamespace(price=20.0)], ai_sentiment=sent_a)
        a2 = SimpleNamespace(ticker="BBB3", currency="BRL", category=cat, market_data=[SimpleNamespace(price=25.0)], ai_sentiment=sent_b)
        p1 = SimpleNamespace(asset=a1, quantity=10.0, average_price=20.0, target_percent=50.0)
        p2 = SimpleNamespace(asset=a2, quantity=10.0, average_price=25.0, target_percent=50.0)
        fake_session = MagicMock()
        fake_session.query().options().all.return_value = [p1, p2]
        fake_session.query().filter_by().options().all.return_value = [p1, p2]
        with patch.object(reb_mod, "_get_current_user_id", return_value=1), \
             patch.object(reb_mod, "get_active_positions") as mock_pos:
            mock_pos.return_value.all.return_value = [p1, p2]
            return calculate_smart_rebalance(fake_session, lambda *a, **k: pd.DataFrame(), monthly_contribution=1000.0)

    r_pos = _run_rebalance("positivo", "Negativo")
    r_neu = _run_rebalance("Neutro", "Neutro")
    assert {s["ticker"]: s["suggested_value"] for s in r_pos["sugestoes"]} == {
        s["ticker"]: s["suggested_value"] for s in r_neu["sugestoes"]
    }

    # A2: score 53 (ou 47) com IA Positivo (+4) não cruza corte de compra (55)
    pos_border = MagicMock()
    pos_border.quantity = Decimal("100")
    pos_border.manual_dy = Decimal("0.08")
    pos_border.last_report_type = None
    pos_border.asset.category.name = "Ação"
    pos_border.asset.ai_sentiment = "Positivo"
    pos_border.asset.market_data = [MagicMock(rsi_14=50.0)]
    pos_border.asset.technical_data = None
    # target +25, dy>=6% +8, rsi/6m 0, graham>=20% +15, bazin>=15% +10 -> vamos testar score base 53 (ex.: abaixo alvo +25, DY +8, Graham>=0 +10, Bazin +10 = 53)
    rec_b, st_b, sc_b, _, _ = apply_strategy(
        pos_border,
        {"mg_graham": Decimal("5.0"), "mg_bazin": Decimal("20.0"), "p_vp": Decimal("1.1")},
        falta=Decimal("500.0"),
        preco=Decimal("30.0"),
        min_6m=Decimal("25.0"),
        screener_item=MagicMock(bazin_price=36.0, quality_score=60),
    )
    # 25 + 8 + 10 (mg_bazin) + 10 (mg_graham>0? Graham>0..20 gives 0 unless >20) -> 25+8+10 = 43 +4 = 47; testa tb c/ +10 de min_6m = 53 -> clamped at 54
    rec_b2, st_b2, sc_b2, _, _ = apply_strategy(
        pos_border,
        {"mg_graham": Decimal("5.0"), "mg_bazin": Decimal("20.0"), "p_vp": Decimal("1.1")},
        falta=Decimal("500.0"),
        preco=Decimal("30.0"),
        min_6m=Decimal("29.0"),
        screener_item=MagicMock(bazin_price=36.0, quality_score=60),
    )
    assert sc_b < 55 and st_b == "NEUTRO"
    assert sc_b2 == 54 and st_b2 == "NEUTRO" and rec_b2 == "🟡 MANTER"

    # A2: corte de OPORTUNIDADE (60) com ativo acima da meta não cruza por causa da IA (+4)
    pos_border_above = MagicMock()
    pos_border_above.quantity = Decimal("100")
    pos_border_above.manual_dy = Decimal("0.08")
    pos_border_above.last_report_type = None
    pos_border_above.asset.category.name = "Ação"
    pos_border_above.asset.ai_sentiment = "Positivo"
    pos_border_above.asset.market_data = [MagicMock(rsi_14=25.0)]
    pos_border_above.asset.technical_data = None
    # acima meta (-20) + DY (+8) + RSI (+20) + 6m (+10) + Graham (+15) + Bazin (+10) + qual<=65 (0) -> 43; ou +18 Bazin extremo -> 61.
    # Sem Bazin extremo (mg_bazin=20 -> +10) e qual 90 (+10): -20+8+20+10+15+10+10 = 53 (< 60), com +4 IA = 57 (< 60).
    # Mesmo com qual 75 (+10) e min_6m=29 -> se base ficasse em 57 + 4 = 61, guard deve travar em 59.
    rec_opp_guard, st_opp_guard, sc_opp_guard, _, _ = apply_strategy(
        pos_border_above,
        {"mg_graham": Decimal("35.0"), "mg_bazin": Decimal("40.0"), "p_vp": Decimal("0.80")},
        falta=Decimal("-100.0"),
        preco=Decimal("65.0"),
        min_6m=Decimal("80.0"),
        screener_item=MagicMock(bazin_price=100.0, quality_score=60),  # sem +10 de qual -> -20+8+20+10+15+18+0 = 51 +4 = 55 (< 60)
    )
    assert sc_opp_guard < 60 and st_opp_guard == "NEUTRO"

    # I1 + I2: amortização é descontada do DY/div_ps e Bazin usa base 12m
    now = datetime.now()
    idx = pd.to_datetime([now - timedelta(days=30), now - timedelta(days=400)])
    yf_mock = SimpleNamespace(dividends=pd.Series([1.0, 2.0], index=idx))
    div_ps_full, dy12_full, _, _ = _compute_dividend_metrics(yf_mock, price=10.0, amort_12m=0.0)
    assert div_ps_full == 1.0 and dy12_full == 10.0
    div_ps_amort, dy12_amort, _, _ = _compute_dividend_metrics(yf_mock, price=10.0, amort_12m=1.0)
    assert div_ps_amort is None and dy12_amort == 0.0

    # I3 + I4 + I7: mínimo de critérios conhecidos, gate de solvência/ROE/vacância limitado a 45 e checklist FII com vacância/segmento
    _, q_sparse = evaluate_fundamental_checklist("Ação", {"price": 20.0, "pl": 8.0})
    assert q_sparse is None
    _, q_fii3 = evaluate_fundamental_checklist("FII", {"price": 100.0, "pvp": 0.9, "dy_12m": 10.0, "bazin_price": 120.0})
    assert q_fii3 == 96
    _, q_debt_fail = evaluate_fundamental_checklist(
        "Ação",
        {"price": 20.0, "pl": 8.0, "roe": 20.0, "net_margin": 15.0, "debt_to_ebitda": 5.0, "dy_12m": 8.0, "bazin_price": 30.0, "graham_price": 30.0},
    )
    assert q_debt_fail == 45

    _, st_q45, _, mot_q45, _ = apply_strategy(
        pos_border,
        {"mg_graham": Decimal("25.0"), "mg_bazin": Decimal("25.0"), "p_vp": Decimal("0.9")},
        falta=Decimal("500.0"),
        preco=Decimal("30.0"),
        min_6m=Decimal("29.0"),
        screener_item=MagicMock(bazin_price=40.0, quality_score=q_debt_fail),
    )
    assert "Qualidade Fundamentalista Baixa (-15) [45/100]" in mot_q45

    chk_vac_ok, q_vac_ok = evaluate_fundamental_checklist(
        "FII",
        {"price": 100.0, "pvp": 0.9, "dy_12m": 10.0, "bazin_price": 120.0, "leverage_pct": 10.0, "vacancy_pct": 3.5, "segmento": "Logística"},
    )
    assert any(i["key"] == "vacancy" and i["status"] == "pass" for i in chk_vac_ok)
    assert q_vac_ok == 100

    chk_vac_bad, q_vac_bad = evaluate_fundamental_checklist(
        "FII",
        {"price": 100.0, "pvp": 0.9, "dy_12m": 10.0, "bazin_price": 120.0, "leverage_pct": 10.0, "vacancy_pct": 18.0, "segmento": "Lajes Corporativas"},
    )
    assert any(i["key"] == "vacancy" and i["status"] == "fail" for i in chk_vac_bad)
    assert q_vac_bad is not None and q_vac_bad <= 45

    chk_paper, _ = evaluate_fundamental_checklist(
        "FII",
        {"price": 100.0, "pvp": 0.9, "dy_12m": 11.0, "bazin_price": 120.0, "segmento": "Títulos e Valores Mobiliários"},
    )
    assert any(i["key"] == "vacancy" and i["status"] == "pass" for i in chk_paper)

    # I5 + §3: Gordon só em Ação, Número Mágico só em FII
    pos_fii = SimpleNamespace(quantity=Decimal("10"), manual_dy=Decimal("0.08"), manual_lpa=Decimal("0"), manual_vpa=Decimal("10"), asset=SimpleNamespace(category=SimpleNamespace(name="FII")))
    m_fii = calculate_fundamental_metrics(pos_fii, Decimal("10.0"))
    assert m_fii["gordon_price"] == Decimal("0.0") and m_fii["magic_number"] == 150

    pos_acao = SimpleNamespace(quantity=Decimal("10"), manual_dy=Decimal("0.08"), manual_lpa=Decimal("2.0"), manual_vpa=Decimal("10"), asset=SimpleNamespace(category=SimpleNamespace(name="Ação")))
    m_acao = calculate_fundamental_metrics(pos_acao, Decimal("10.0"))
    assert m_acao["magic_number"] == 0 and m_acao["gordon_price"] > Decimal("0.0")

    # I6: normalização de escala de percentuais
    assert _safe_pct(0.18) == 18.0
    assert _safe_pct(18.0) == 18.0

    # A3: parse JSON inválido marca ai_status = "error" e mantém ai_sentiment = "Neutro"
    import infrastructure.gemini_service as gem_svc
    fake_asset = SimpleNamespace(id=999, ticker="ERR3", cvm_code=None, ai_status="idle", ai_sentiment=None, ai_summary=None, ai_updated_at=None)
    fake_db = MagicMock()
    fake_db.query().filter_by().first.return_value = fake_asset
    with patch.object(gem_svc, "SessionLocal", return_value=fake_db), \
         patch.object(gem_svc, "generate_ai_text", return_value=("resposta nao-json", "gemini")):
        gem_svc._run_sentiment_analysis(999, "ERR3", [{"title": "Fato relevante", "source": "RI", "link": "https://ex.com"}], {})
    assert fake_asset.ai_status == "error"
    assert fake_asset.ai_sentiment == "Neutro"

    # I8: setor financeiro/bancos não sofre penalidade de Dívida/EBITDA e fica fora da Fórmula Mágica
    chk_bank, q_bank = evaluate_fundamental_checklist(
        "Ação",
        {"sector": "Financeiro & Bancos", "price": 14.0, "pl": 7.0, "roe": 20.0, "net_margin": 18.0, "debt_to_ebitda": 9.5, "dy_12m": 8.0, "bazin_price": 20.0, "graham_price": 22.0},
    )
    assert any(i["key"] == "debt" and i["status"] == "unknown" and i["formatted"] == "N/A" for i in chk_bank)
    assert q_bank == 100
    ranks_bank = compute_magic_formula_ranks([
        {"ticker": "BBDC4", "asset_type": "Ação", "sector": "Financeiro & Bancos", "ev_ebitda": 3.0, "roic": 20.0},
        {"ticker": "WEGE3", "asset_type": "Ação", "sector": "Bens Industriais", "ev_ebitda": 12.0, "roic": 25.0},
    ])
    assert "BBDC4" not in ranks_bank and ranks_bank.get("WEGE3") == 100.0

    # I9: dados oficiais CVM/locais prevalecem sobre Yahoo Finance para Ações
    from infrastructure.screener_service import fetch_ticker_fundamentals
    fake_yt = SimpleNamespace(
        info={"currentPrice": 20.0, "previousClose": 19.5, "trailingEps": 1.0, "bookValue": 10.0, "returnOnEquity": 0.10, "sector": "Energy"},
        dividends=pd.Series([1.5], index=pd.to_datetime([now - timedelta(days=30)])),
    )
    with patch("infrastructure.screener_service.yf.Ticker", return_value=fake_yt):
        res_i9 = fetch_ticker_fundamentals(
            "PETR4",
            asset_type="Ação",
            db_overrides={"lpa": 4.0, "vpa": 25.0, "roe": 31.23, "debt_to_ebitda": 0.98},
        )
    assert res_i9 is not None
    assert res_i9["lpa"] == 4.0 and res_i9["vpa"] == 25.0
    assert res_i9["roe"] == 31.23 and res_i9["debt_to_ebitda"] == 0.98

    # §4.5: get_history_data aplica downsample preservando últimos 260 pontos quando > 400 e full=True retorna tudo
    from datetime import date as _date
    from services_modules.backup import BackupService
    fake_snaps = [
        SimpleNamespace(date=_date(2024, 1, 1) + timedelta(days=i), total_equity=1000.0 + i, total_invested=900.0, profit=100.0 + i, breakdown=None)
        for i in range(600)
    ]
    fake_hist_sess = MagicMock()
    fake_hist_sess.__enter__.return_value = fake_hist_sess
    fake_hist_sess.__exit__.return_value = False
    fake_hist_sess.query.return_value.filter_by.return_value.order_by.return_value.all.return_value = fake_snaps
    b_svc = BackupService()
    b_svc.current_user_id = 1
    with patch("services_modules.backup.Session", return_value=fake_hist_sess):
        sampled_hist = b_svc.get_history_data(full=False)
        full_hist = b_svc.get_history_data(full=True)
    assert len(full_hist) == 600
    assert len(sampled_hist) <= 400 and sampled_hist[-1]["Patrimônio"] == full_hist[-1]["Patrimônio"]


def test_collect_db_overrides_ticker_filter_and_fresh_cache_skips_overrides():
    from datetime import datetime
    from unittest.mock import MagicMock
    from infrastructure.screener_service import _collect_db_overrides, get_or_fetch_asset_valuation

    # Filtra _FII_SEGMENT_FALLBACK apenas ao ticker solicitado
    empty_sess = MagicMock()
    empty_sess.query.return_value.filter.return_value.group_by.return_value.all.return_value = []
    empty_sess.query.return_value.options.return_value.filter.return_value.all.return_value = []
    empty_sess.query.return_value.filter.return_value.all.return_value = []
    with patch("infrastructure.screener_service.collect_amortization_12m_map", return_value={}):
        filtered = _collect_db_overrides(empty_sess, user_id=1, tickers=["HGLG11"])
    assert list(filtered.keys()) == ["HGLG11"]

    # Cache fresco não deve acionar _collect_db_overrides nem fetch externo
    fresh_row = MagicMock()
    fresh_row.updated_at = datetime.now()
    fresh_row.raw_metrics_json = {}
    fresh_row.to_dict.return_value = {
        "ticker": "ITUB3",
        "name": "Itau",
        "asset_type": "Ação",
        "sector": "Financeiro & Bancos",
        "price": 30.0,
        "dividend_per_share": 2.4,
        "lpa": 4.0,
        "vpa": 20.0,
        "dy_12m": 8.0,
        "fcf_per_share": 3.0,
    }
    fresh_sess = MagicMock()
    fresh_sess.query.return_value.filter_by.return_value.first.return_value = fresh_row
    fresh_sess.query.return_value.all.return_value = [fresh_row]

    with patch("infrastructure.screener_service._collect_db_overrides") as mock_ovr:
        out = get_or_fetch_asset_valuation(fresh_sess, "ITUB3", user_id=1)
    assert out is not None
    mock_ovr.assert_not_called()


def test_calendar_includes_b3_crypto_etfs_and_skips_reserva(val_client):
    from types import SimpleNamespace
    from unittest.mock import MagicMock
    import routes.calendar as cal_routes

    def _mk_pos(aid, ticker, cat_name, qty=10.0):
        return SimpleNamespace(
            asset_id=aid,
            quantity=qty,
            asset=SimpleNamespace(ticker=ticker, category=SimpleNamespace(name=cat_name)),
        )

    mock_positions = [
        _mk_pos(1, "COIN11", "Cripto", 20.0),
        _mk_pos(2, "ETHY11", "Cripto", 5.0),
        _mk_pos(3, "NUBANK TURBO", "Reserva", 1.0),
        _mk_pos(4, "BITCOIN", "Cripto", 1.0),
        _mk_pos(5, "BTC", "Cripto", 0.5),
        _mk_pos(6, "BTC-USD", "Cripto", 0.1),
    ]
    fake_sess = MagicMock()
    fake_sess.__enter__.return_value = fake_sess
    fake_sess.__exit__.return_value = False
    fake_sess.query.return_value.filter_by.return_value.join.return_value.options.return_value.filter.return_value.all.return_value = mock_positions
    fake_sess.query.return_value.options.return_value.filter.return_value.all.return_value = []

    processed_tickers = []
    captured_targets = []

    class CaptureThread:
        def __init__(self, target=None, daemon=None):
            self._target = target

        def start(self):
            if self._target:
                captured_targets.append(self._target)

    prev_cache = dict(cal_routes.CALENDAR_CACHE)
    prev_flag = cal_routes.IS_UPDATING_CALENDAR
    cal_routes.CALENDAR_CACHE.clear()
    cal_routes.IS_UPDATING_CALENDAR = False
    try:
        with patch("routes.calendar.Session", return_value=fake_sess), \
             patch("routes.calendar.get_secure_session", return_value=MagicMock()), \
             patch("routes.calendar.fetch_single_asset_proventos", side_effect=lambda item, _s: processed_tickers.append(item[0]) or []):
            with patch("routes.calendar.threading.Thread", CaptureThread):
                resp = val_client.get("/api/calendar")
            assert len(captured_targets) == 1
            captured_targets[0]()
    finally:
        cal_routes.CALENDAR_CACHE.clear()
        cal_routes.CALENDAR_CACHE.update(prev_cache)
        cal_routes.IS_UPDATING_CALENDAR = prev_flag

    assert resp.status_code == 200
    assert sorted(processed_tickers) == ["COIN11", "ETHY11"]


def test_fetch_ticker_fundamentals_scales_unit_distorted_vpa_for_sapr4():
    from types import SimpleNamespace
    import pandas as pd
    from infrastructure.screener_service import fetch_ticker_fundamentals

    fake_yt = SimpleNamespace(
        info={
            "currentPrice": 6.62,
            "previousClose": 6.55,
            "trailingEps": 0.32,
            "bookValue": 41.048,
            "returnOnEquity": 0.12,
            "sector": "Utilities",
        },
        dividends=pd.Series(dtype=float),
    )
    with patch("infrastructure.screener_service.yf.Ticker", return_value=fake_yt):
        res = fetch_ticker_fundamentals("SAPR4", asset_type="Ação")

    assert res is not None
    assert res["vpa"] == pytest.approx(8.2096, abs=0.01)
    assert res["pvp"] == pytest.approx(6.62 / 8.2096, abs=0.05)
