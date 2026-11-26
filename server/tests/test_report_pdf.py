"""Testes anti-regressão para o agregador de dados e gerador de PDF patrimonial."""
import os
import re
from decimal import Decimal
from unittest.mock import MagicMock

import fitz
from db.session import Session
from services_modules.report_data import _classify_fii_kind, build_report_payload, sanitize_pdf_text
from utils.pdf_generator import generate_monthly_report_pdf


def test_build_report_payload_never_zero_and_deduplicates():
    """Garante Single Source of Truth, ausência de duplicatas de sinais e competência MM/AAAA."""
    mock_service = MagicMock()
    mock_service.get_dashboard_data.return_value = {
        "dolar": 5.82,
        "resumo": {
            "Total": Decimal("50000.00"),
            "TotalInvestido": Decimal("45000.00"),
            "LucroTotal": Decimal("5000.00"),
            "RendaMensal": Decimal("350.00"),
            "TotalDividendos": Decimal("4200.00"),
            "TotalReturnPct": Decimal("20.44"),
        },
        "grafico": [
            {"name": "Ação", "value": Decimal("30000.00")},
            {"name": "FII", "value": Decimal("20000.00")},
        ],
        "categorias": [
            {"name": "Ação", "meta": Decimal("50.00")},
            {"name": "FII", "meta": Decimal("50.00")},
        ],
        "ativos": [
            {
                "ticker": "PETR4",
                "categoria": "Ação",
                "currency": "BRL",
                "qtd": 100.0,
                "pm": 30.0,
                "preco_atual": 40.0,
                "total_atual": 4000.0,
                "total_investido": 3000.0,
                "lucro_valor": 1000.0,
                "lucro_pct": 33.33,
                "score": 95,
                "status": "COMPRA_FORTE",
                "motivo": "Abaixo do Teto Bazin (+15.4%)",
                "falta_comprar": 500.0,
            },
            {
                "ticker": "MXRF11",
                "categoria": "FII",
                "currency": "BRL",
                "qtd": 200.0,
                "pm": 10.0,
                "preco_atual": 9.8,
                "total_atual": 1960.0,
                "total_investido": 2000.0,
                "lucro_valor": -40.0,
                "lucro_pct": -2.0,
                "score": 60,
                "status": "NEUTRO",
                "motivo": "Estável",
                "falta_comprar": 0.0,
            },
            {
                "ticker": "GOAU4",
                "categoria": "Ação",
                "currency": "BRL",
                "qtd": 100.0,
                "pm": 10.0,
                "preco_atual": 12.0,
                "total_atual": 1200.0,
                "total_investido": 1000.0,
                "lucro_valor": 200.0,
                "lucro_pct": 20.0,
                "score": 25,
                "status": "REDUZIR",
                "motivo": "Acima do alvo",
                "falta_comprar": 0.0,
            },
        ],
    }

    with Session() as db_session:
        payload = build_report_payload(db_session, user_id=1, service=mock_service)

    assert payload["summary"]["total_brl"] == 50000.0
    assert payload["summary"]["usd_brl"] == 5.82
    assert len(payload["assets"]) == 3
    assert len(payload["allocation"]) == 2

    # Contadores devem bater exatamente com action_badge das posições
    badges = [p["action_badge"] for p in payload["assets"]]
    assert payload["signals_summary"]["compra"] == badges.count("COMPRAR")
    assert payload["signals_summary"]["observar"] == badges.count("NEUTRO")
    assert payload["signals_summary"]["realizar"] == badges.count("REALIZAR")

    # Motivo formatado em PT-BR (vírgula decimal)
    assert "+15,4%" in payload["assets"][0]["motivo"]

    # Sem duplicatas por ticker/setup e soma exata dos proventos 30d
    tickers_seen = [s["ticker"] for s in payload["signals_v2"]]
    assert len(tickers_seen) == len(set(tickers_seen))
    if payload["dividends_30d_total"] > 0:
        div_sum = round(sum(d["amount_brl"] for d in payload["dividends_30d_items"]), 2)
        assert abs(div_sum - round(payload["dividends_30d_total"], 2)) <= 0.02

    # Nenhum FII de tijolo recebe setup de FII de papel
    for sig in payload["signals_v2"]:
        if _classify_fii_kind(sig["ticker"]) == "TIJOLO":
            assert sig["setup_code"] != "FII_PAPEL_SPREAD_REAL"

    # Sem emojis/caracteres fora do charset Latin-1 da fonte do PDF
    sanitized = sanitize_pdf_text("⚖️ Abaixo do Alvo (+25) · 💰 DY 9.4%")
    assert "9,4%" in sanitized
    assert all(ord(c) <= 255 or c in ("•", "—", "–", "≤", "≥") for c in sanitized)

    # Competência DARF no formato MM/AAAA
    if payload["tax_summary"] is not None:
        assert re.match(r"^\d{2}/\d{4}$", payload["tax_summary"]["competencia"])


def test_generate_pdf_populated_and_empty(tmp_path):
    """Gera PDF válido (> 5 KB, %PDF-) tanto com carteira populada quanto vazia."""
    populated = {
        "generated_at": "25/11/2026 16:30 BRT",
        "period_ref": "11/2026",
        "summary": {
            "total_brl": 47813.13,
            "total_invested_brl": 49585.25,
            "total_gain_brl": -1772.12,
            "total_gain_pct": -3.57,
            "renda_mensal_est": 222.29,
            "dy_projetado_pct": 5.58,
            "usd_brl": 5.81,
            "assets_count": 2,
            "brl_pct": 84.8,
            "usd_pct": 15.2,
        },
        "allocation": [
            {"class": "Ação", "count": 1, "value_brl": 27813.13, "actual_pct": 58.2, "target_pct": 50.0, "diff_pp": 8.2, "gap_brl": -3906.56},
            {"class": "FII", "count": 1, "value_brl": 20000.00, "actual_pct": 41.8, "target_pct": 50.0, "diff_pp": -8.2, "gap_brl": 3906.56},
        ],
        "top3_concentration": [{"ticker": "PETR4", "asset_class": "Ação", "weight_pct": 58.2, "value_brl": 27813.13}],
        "assets": [
            {
                "ticker": "PETR4",
                "asset_class": "Ação",
                "currency": "BRL",
                "quantity": 100.0,
                "avg_price": 35.0,
                "current_price": 41.46,
                "current_value_brl": 4146.0,
                "weight_pct": 58.2,
                "gain_brl": 646.0,
                "gain_pct": 18.46,
                "status": "COMPRA_FORTE",
            },
            {
                "ticker": "MXRF11",
                "asset_class": "FII",
                "currency": "BRL",
                "quantity": 200.0,
                "avg_price": 10.5,
                "current_price": 9.8,
                "current_value_brl": 1960.0,
                "weight_pct": 41.8,
                "gain_brl": -140.0,
                "gain_pct": -6.67,
                "status": "NEUTRO",
            },
        ],
        "regime": {"regime_code": "NEUTRO"},
        "risk": {"sharpe": 0.45, "beta": 0.78, "max_drawdown_pct": -11.2},
        "rebalance_actions": [{"class": "FII", "action": "APORTAR", "diff_pct": -8.2, "amount_brl": 3906.56}],
        "signals_summary": {"compra": 1, "observar": 1, "realizar": 0},
        "signals_v2": [
            {
                "ticker": "PETR4",
                "setup_name": "Valor (Graham/Bazin)",
                "win_rate_pct": 64.5,
                "expectancy_pct": 4.2,
                "sample_size_n": 31,
                "entry_price": 41.46,
                "target_price": 48.50,
                "risk_price": 37.80,
                "signal_label": "PONTO DE COMPRA",
            }
        ],
        "buy_highlights": [{"ticker": "PETR4", "score": 100, "falta_comprar": 500.0, "motivo": "Abaixo do Teto Bazin"}],
        "dividends_30d_total": 125.40,
        "dividends_30d_items": [{"ticker": "MXRF11", "event_type": "Rendimento", "date_com": "2026-11-28", "payment_date": "2026-12-10", "amount_brl": 125.40}],
        "tax_summary": {
            "competencia": "11/2026",
            "sales_total_stocks": 0.0,
            "net_profit_brl": 0.0,
            "accumulated_loss_brl": 0.0,
            "darf_to_pay": 0.0,
            "status_label": "Sem vendas tributáveis",
        },
        "insights": ["Maior posição: PETR4 (58,2%)."],
    }

    pop_path = str(tmp_path / "populated.pdf")
    populated["assets"][0]["asset_class"] = "Ação & Renda <Teste>"
    assert generate_monthly_report_pdf(pop_path, populated) is True
    assert os.path.exists(pop_path)
    assert os.path.getsize(pop_path) > 5000
    with open(pop_path, "rb") as f:
        assert f.read(5) == b"%PDF-"

    # Inspeção de texto real com PyMuPDF: sem quadrados ■ / \ufffd e com KPIs presentes
    with fitz.open(pop_path) as pdf_doc:
        full_text = "\n".join(page.get_text() for page in pdf_doc)
    assert "■" not in full_text
    assert "\ufffd" not in full_text
    assert "PETR4" in full_text
    assert "11/2026" in full_text

    empty_path = str(tmp_path / "empty.pdf")
    assert generate_monthly_report_pdf(empty_path, {}) is True
    assert os.path.exists(empty_path)
    assert os.path.getsize(empty_path) > 2000
    with open(empty_path, "rb") as f:
        assert f.read(5) == b"%PDF-"
