"""
Agregador único (Single Source of Truth) para o Relatório Patrimonial PDF.
Consome os mesmos serviços do Dashboard, Sinais v2, Proventos e Motor Fiscal.
Escopo: 100% exclusivo para ativos (sem reembolsos/contas a receber).
"""
import logging
import re
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    _BRT_TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _BRT_TZ = timezone(timedelta(hours=-3))


SETUP_LABELS = {
    "VALUE_GRAHAM_BAZIN": "Valor (Graham/Bazin)",
    "QUALITY_GARP": "Qualidade GARP",
    "DEEP_DISCOUNT_OVERSOLD": "Desconto / Sobrevenda",
    "MOMENTUM_BREAKOUT": "Momentum / Tendência",
    "FII_TIJOLO_PVP_DISCOUNT": "FII Tijolo (P/VP)",
    "FII_PAPEL_SPREAD_REAL": "FII Papel (Spread Real)",
    "DIVIDEND_YIELD_TRAP_FILTER": "Renda / DY Ajustado",
    "ETF_TREND_PULLBACK": "ETF Tendência / Pullback",
    "INTL_FX_MEAN_REVERT": "Internacional / Câmbio",
}

_FII_TIJOLO_TICKERS = {
    "BTLG11", "HGBS11", "HGLG11", "HGRU11", "XPML11", "GGRC11", "TRXF11",
    "BRCR11", "VISC11", "HSML11", "KNRI11", "LVBI11", "VILG11", "XPLG11",
    "ALZR11", "PVBI11", "JSRE11", "RBRP11", "NEWL11", "MALL11", "RECT11",
}
_FII_PAPEL_TICKERS = {
    "MXRF11", "RZAG11", "VGIA11", "VGHF11", "HCTR11", "KNCR11", "KNIP11",
    "CPTS11", "IRDM11", "RECR11", "RBRY11", "DEVA11", "URPR11",
    "KNSC11", "IRIM11", "RBRF11", "VGIR11", "BCRI11", "HABT11",
}


def _classify_fii_kind(ticker: str, name: str = "") -> str:
    t = str(ticker or "").upper()
    n = str(name or "").upper()
    if t in _FII_TIJOLO_TICKERS or any(k in n for k in ("LOG", "MALL", "URB", "SHOP", "REAL", "TIJOLO", "BC FUND")):
        return "TIJOLO"
    if t in _FII_PAPEL_TICKERS or any(k in n for k in ("FIAGRO", "CRI", "RECEB", "PAPEL", "HECTARE", "MAXI REN", "VALOR HE")):
        return "PAPEL"
    return "ANY"


def _safe_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except Exception:
        return default


def _fmt_date_br(iso_str: str | None) -> str:
    if not iso_str:
        return "—"
    try:
        return date.fromisoformat(str(iso_str)[:10]).strftime("%d/%m/%Y")
    except Exception:
        return str(iso_str)


def sanitize_pdf_text(text: str) -> str:
    """Remove emojis/símbolos fora do charset Latin-1 (evita quadrados ■) e usa vírgula decimal PT-BR."""
    if not text:
        return ""
    # Converte separadores com emojis em ' · ' limpo
    cleaned = re.sub(r"[\U00010000-\U0010ffff\u2600-\u27bf\ufe0f]", "", str(text))
    # Mantém apenas caracteres suportados pela fonte Helvetica (Latin-1 + travessão/bullet)
    cleaned = "".join(ch for ch in cleaned if ord(ch) <= 255 or ch in ("•", "—", "–"))
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ·•")
    cleaned = re.sub(r"(?<![a-zA-Z0-9.])(\d+)\.(\d+)(?![a-zA-Z0-9.])", r"\1,\2", cleaned)
    return cleaned


def normalize_action_badge(raw_status: str) -> str:
    """Fonte única de verdade para o badge de ação entre tabela de posições e resumo."""
    st = str(raw_status or "NEUTRO").upper()
    if "COMPRA" in st or "APORT" in st:
        return "COMPRAR"
    if "REDUZ" in st or "CARO" in st or "VEND" in st or "REALIZ" in st:
        return "REALIZAR"
    return "NEUTRO"


def build_report_payload(session, user_id: int, service) -> dict:
    """Monta o payload completo e deduplicado do relatório patrimonial de ativos."""
    now_brt = datetime.now(_BRT_TZ)
    dash_data = service.get_dashboard_data() or {}

    resumo = dash_data.get("resumo") or {}
    ativos_raw = dash_data.get("ativos") or []
    grafico_raw = dash_data.get("grafico") or []
    categorias_raw = dash_data.get("categorias") or []

    dolar_rate = _safe_float(dash_data.get("dolar"))
    if dolar_rate <= 0:
        try:
            dolar_rate = _safe_float(service.get_usd_rate())
        except Exception:
            dolar_rate = 0.0

    total_brl = _safe_float(resumo.get("Total"))
    total_invested_brl = _safe_float(resumo.get("TotalInvestido"))
    total_gain_brl = _safe_float(resumo.get("LucroTotal"))
    total_gain_pct = (total_gain_brl / total_invested_brl * 100.0) if total_invested_brl > 0 else 0.0
    total_dividends_hist = _safe_float(resumo.get("TotalDividendos"))
    renda_mensal_est = _safe_float(resumo.get("RendaMensal"))
    total_return_pct = _safe_float(resumo.get("TotalReturnPct"))
    dy_projetado_pct = (renda_mensal_est * 12.0 / total_brl * 100.0) if total_brl > 0 else 0.0

    # --- Normalização das posições (Single Source of Truth) ---
    positions = []
    brl_total = 0.0
    intl_usd_total = 0.0
    status_counts = {"COMPRAR": 0, "NEUTRO": 0, "REALIZAR": 0}

    for a in ativos_raw:
        qty = _safe_float(a.get("qtd", a.get("quantidade")))
        val_brl = _safe_float(a.get("total_atual"))
        if qty <= 0 and val_brl <= 0:
            continue
        asset_class = str(a.get("categoria") or a.get("tipo") or "-")
        currency = str(a.get("currency") or a.get("moeda") or "BRL").upper()
        if currency == "USD" or asset_class.strip().lower() == "internacional":
            intl_usd_total += val_brl
        else:
            brl_total += val_brl

        raw_st = str(a.get("status") or "NEUTRO").upper()
        action_badge = normalize_action_badge(raw_st)
        status_counts[action_badge] += 1

        positions.append({
            "ticker": str(a.get("ticker") or "-"),
            "nome": str(a.get("nome") or ""),
            "asset_class": asset_class,
            "currency": currency,
            "quantity": qty,
            "avg_price": _safe_float(a.get("pm", a.get("preco_medio"))),
            "current_price": _safe_float(a.get("preco_atual")),
            "current_value_brl": val_brl,
            "total_invested_brl": _safe_float(a.get("total_investido")),
            "gain_brl": _safe_float(a.get("lucro_valor", a.get("lucro"))),
            "gain_pct": _safe_float(a.get("lucro_pct", a.get("lucro_percent"))),
            "weight_pct": (val_brl / total_brl * 100.0) if total_brl > 0 else 0.0,
            "falta_comprar": _safe_float(a.get("falta_comprar")),
            "score": int(_safe_float(a.get("score"))),
            "status": raw_st,
            "action_badge": action_badge,
            "recomendacao": sanitize_pdf_text(str(a.get("recomendacao") or "Neutro")),
            "motivo": sanitize_pdf_text(str(a.get("motivo") or "")),
        })

    positions.sort(key=lambda x: x["current_value_brl"], reverse=True)

    # --- Alocação por classe (excluindo Reserva da base tática quando meta == 0%) ---
    val_by_class = {str(g.get("name")): _safe_float(g.get("value")) for g in grafico_raw if g.get("name")}
    target_by_class = {str(c.get("name")): _safe_float(c.get("meta")) for c in categorias_raw if c.get("name")}
    count_by_class: dict[str, int] = {}
    for p in positions:
        count_by_class[p["asset_class"]] = count_by_class.get(p["asset_class"], 0) + 1

    reserva_val = val_by_class.get("Reserva", 0.0) if target_by_class.get("Reserva", 0.0) <= 0 else 0.0
    invested_ex_reserva_brl = max(0.0, total_brl - reserva_val)

    all_classes = list(dict.fromkeys(list(val_by_class.keys()) + list(target_by_class.keys())))
    allocation = []
    for cls_name in all_classes:
        val = val_by_class.get(cls_name, 0.0)
        tgt = target_by_class.get(cls_name, 0.0)
        cnt = count_by_class.get(cls_name, 0)
        if val <= 0 and tgt <= 0 and cnt == 0:
            continue
        is_liquidity_reserve = cls_name.strip().lower() == "reserva" and tgt <= 0
        act_total_pct = (val / total_brl * 100.0) if total_brl > 0 else 0.0
        if is_liquidity_reserve:
            act_tactical_pct = None
            diff_pp = 0.0
            gap_brl = 0.0
        else:
            act_tactical_pct = (val / invested_ex_reserva_brl * 100.0) if invested_ex_reserva_brl > 0 else act_total_pct
            diff_pp = act_tactical_pct - tgt
            gap_brl = (tgt / 100.0 * invested_ex_reserva_brl) - val if invested_ex_reserva_brl > 0 else 0.0
        allocation.append({
            "class": cls_name,
            "count": cnt,
            "value_brl": round(val, 2),
            "actual_pct": round(act_total_pct, 2),
            "tactical_pct": round(act_tactical_pct, 2) if act_tactical_pct is not None else None,
            "target_pct": round(tgt, 2),
            "diff_pp": round(diff_pp, 2),
            "gap_brl": round(gap_brl, 2),
            "is_liquidity_reserve": is_liquidity_reserve,
        })
    allocation.sort(key=lambda x: x["value_brl"], reverse=True)

    # --- Diagnóstico de Concentração & Exposição Cambial ---
    top3_concentration = [
        {"ticker": p["ticker"], "asset_class": p["asset_class"], "weight_pct": round(p["weight_pct"], 2), "value_brl": round(p["current_value_brl"], 2)}
        for p in positions[:3]
    ]
    brl_pct = (brl_total / total_brl * 100.0) if total_brl > 0 else 0.0
    usd_pct = (intl_usd_total / total_brl * 100.0) if total_brl > 0 else 0.0

    # --- Risco & Regime Macro ---
    regime_data = None
    try:
        from domain.signals.regime import get_latest_market_regime
        regime_data = get_latest_market_regime(session)
    except Exception as exc:
        logging.warning(f"Falha ao carregar regime no relatório: {exc}")

    risk_metrics = {}
    try:
        from domain.quant.risk import calculate_risk_metrics
        from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn
        risk = calculate_risk_metrics(session, _fetch_price_history_fn, dolar_rate=dolar_rate or 5.8)
        if isinstance(risk, dict) and risk.get("status") == "Sucesso":
            risk_metrics = {
                "beta": risk.get("beta"),
                "sharpe": risk.get("sharpe_12m"),
                "var_95": risk.get("var_95_monthly_pct"),
                "max_drawdown_pct": risk.get("max_drawdown_pct"),
                "volatility_pct": risk.get("volatilidade_anual_pct"),
            }
    except Exception as exc:
        logging.warning(f"Falha ao calcular métricas de risco no relatório: {exc}")

    # --- Ações de Rebalanceamento Tático ---
    rebalance_actions = []
    for item in allocation:
        if item["is_liquidity_reserve"]:
            rebalance_actions.append({
                "class": item["class"],
                "action": "RESERVA DE LIQUIDEZ (FORA DA MATRIZ)",
                "diff_pct": None,
                "amount_brl": None,
            })
            continue
        diff_pp = item["diff_pp"]
        if abs(diff_pp) < 1.0:
            continue
        action_label = "APORTAR" if diff_pp < 0 else "REDUZIR / AGUARDAR"
        rebalance_actions.append({
            "class": item["class"],
            "action": action_label,
            "diff_pct": diff_pp,
            "amount_brl": abs(item["gap_brl"]),
        })

    # --- Sinais Quantitativos v2 (FII Tijolo vs Papel corrigido, payoff >= 1.5:1, sem duplicatas) ---
    signals_table = []
    total_buy_signals = 0
    try:
        from db.models.signals import SignalLedger, SignalSetupStat
        raw_sigs = (
            session.query(SignalLedger)
            .filter(SignalLedger.user_id == user_id)
            .order_by(SignalLedger.emitted_date.desc(), SignalLedger.wilson_lb_95.desc())
            .limit(80)
            .all()
        )
        stats_rows = session.query(SignalSetupStat).all()
        stats_map: dict[tuple[str, str], object] = {}
        for st in stats_rows:
            k = (str(st.setup_code or ""), str(st.asset_class or ""))
            prev_st = stats_map.get(k)
            cur_n = int(st.sample_size_n or 0)
            prev_n = int(prev_st.sample_size_n or 0) if prev_st else -1
            cur_h = getattr(st, "horizon_days", None)
            if prev_st is None or (cur_n > 0 and prev_n <= 0) or (cur_h in (63, 90) and cur_n > 0) or (cur_n > prev_n and getattr(prev_st, "horizon_days", None) not in (63, 90)):
                stats_map[k] = st

        pos_by_ticker = {p["ticker"]: p for p in positions}
        best_per_ticker: dict[str, dict] = {}
        seen_pairs: set[tuple[str, str]] = set()

        for s in raw_sigs:
            tkr = str(s.ticker or "").upper()
            setup_code = str(s.setup_code or "")
            if not tkr or (tkr, setup_code) in seen_pairs:
                continue

            pos_info = pos_by_ticker.get(tkr)
            fii_kind = _classify_fii_kind(tkr, pos_info.get("nome", "") if pos_info else "")
            if fii_kind == "TIJOLO" and setup_code == "FII_PAPEL_SPREAD_REAL":
                continue
            if fii_kind == "PAPEL" and setup_code == "FII_TIJOLO_PVP_DISCOUNT":
                continue

            seen_pairs.add((tkr, setup_code))

            stat = stats_map.get((setup_code, str(s.asset_class or "")))
            n_samp = int(stat.sample_size_n) if stat and stat.sample_size_n else int(s.sample_size_n or 0)
            has_valid_bt = stat is not None and n_samp > 0 and float(stat.win_rate or 0.0) > 0.0

            win_rate = float(stat.win_rate) * 100.0 if has_valid_bt else None
            raw_exp = float(stat.expectancy_net) if (has_valid_bt and stat.expectancy_net is not None) else None
            # Descarta outliers corrompidos (> 100% de expectativa por trade)
            if raw_exp is not None and abs(raw_exp) > 1.0:
                raw_exp = None
            exp_net = raw_exp * 100.0 if raw_exp is not None else None
            wlb_95 = float(stat.wilson_lb_95) * 100.0 if (has_valid_bt and stat.wilson_lb_95 is not None) else None

            entry_p = _safe_float(s.entry_price_raw)
            if entry_p <= 0 and pos_info:
                entry_p = pos_info["current_price"]

            target_p = None
            risk_p = None
            if entry_p > 0 and has_valid_bt:
                raw_avg_ret = float(stat.avg_return) if (stat.avg_return is not None and abs(float(stat.avg_return)) <= 1.0) else (raw_exp or 0.05)
                mae = float(stat.max_drawdown_mae or 0.0)
                mae_abs = min(0.15, max(0.04, abs(mae) if mae < 0 else 0.07))
                upside = min(0.45, max(raw_avg_ret, mae_abs * 1.5, 0.08))
                target_p = round(entry_p * (1.0 + upside), 2)
                risk_p = round(entry_p * (1.0 - mae_abs), 2)

            if pos_info is not None:
                badge = pos_info["action_badge"]
                if badge == "COMPRAR":
                    if exp_net is not None and exp_net < 0.5:
                        signal_label = "APORTE (FUND.)"
                    else:
                        signal_label = "PONTO DE COMPRA"
                    is_actionable = True
                elif badge == "REALIZAR":
                    signal_label = "REALIZAR"
                    is_actionable = False
                else:
                    signal_label = "OBSERVAR"
                    is_actionable = False
            else:
                raw_status = str(s.status or "EM_OBSERVACAO").upper()
                has_edge = exp_net is not None and exp_net >= 0.5
                is_actionable = has_valid_bt and has_edge and raw_status in ("TRIGGERED", "ACIONADO", "COMPRA", "COMPRA_FORTE")
                signal_label = "PONTO DE COMPRA" if is_actionable else "OBSERVAR"

            candidate = {
                "ticker": tkr,
                "setup_code": setup_code,
                "setup_name": SETUP_LABELS.get(setup_code, setup_code.replace("_", " ").title() if setup_code else "—"),
                "win_rate_pct": round(win_rate, 1) if win_rate is not None else None,
                "wilson_lb_95_pct": round(wlb_95, 1) if wlb_95 is not None else None,
                "expectancy_pct": round(exp_net, 2) if exp_net is not None else None,
                "sample_size_n": n_samp if has_valid_bt else 0,
                "entry_price": round(entry_p, 2) if entry_p > 0 else None,
                "target_price": target_p,
                "risk_price": risk_p,
                "signal_label": signal_label,
                "is_actionable": is_actionable,
            }

            prev = best_per_ticker.get(tkr)
            if prev is None or (candidate["is_actionable"] and not prev["is_actionable"]) or (
                candidate["is_actionable"] == prev["is_actionable"]
                and (candidate["wilson_lb_95_pct"] or -1) > (prev["wilson_lb_95_pct"] or -1)
            ):
                best_per_ticker[tkr] = candidate

        all_unique_sigs = list(best_per_ticker.values())
        actionable_signals = sorted(
            [s for s in all_unique_sigs if s["is_actionable"]],
            key=lambda x: (-(x["expectancy_pct"] or -99.0), -(x["wilson_lb_95_pct"] or 0.0)),
        )
        total_buy_signals = len(actionable_signals)
        observed_list = [s for s in all_unique_sigs if not s["is_actionable"]]
        signals_table = actionable_signals[:8] + observed_list[: max(0, 6 - len(actionable_signals[:6]))]
    except Exception as exc:
        logging.warning(f"Falha ao montar sinais v2 para o relatório: {exc}")

    # Micro-cards de justificativa para os top ativos em Ponto de Compra (da carteira)
    buy_highlights = [
        {
            "ticker": p["ticker"],
            "asset_class": p["asset_class"],
            "score": p["score"],
            "current_price": p["current_price"],
            "falta_comprar": p["falta_comprar"],
            "motivo": p["motivo"],
        }
        for p in positions
        if p["action_badge"] == "COMPRAR"
    ][:4]

    # --- Proventos Provisionados (próximos 30 dias) ---
    dividends_30d_total = 0.0
    dividends_30d_items = []
    try:
        from routes.signals_v2 import compute_free_cash_bridge
        bridge = compute_free_cash_bridge(session, user_id, window_days=30)
        dividends_30d_total = _safe_float((bridge.get("components") or {}).get("dividends_30d"))
        raw_div_items = (bridge.get("items") or {}).get("dividends") or []
        dividends_30d_items = [
            {
                "ticker": d.get("ticker") or "-",
                "event_type": d.get("type") or "Dividendo",
                "date_com": _fmt_date_br(d.get("date_com")),
                "payment_date": _fmt_date_br(d.get("date_payment")),
                "amount_brl": _safe_float(d.get("net_total", d.get("net_total_brl"))),
            }
            for d in raw_div_items
        ]
    except Exception as exc:
        logging.warning(f"Falha ao carregar proventos 30d no relatório: {exc}")

    # --- Resumo Fiscal (DARF) ---
    tax_summary = None
    try:
        from domain.tax.tax_engine import calculate_monthly_darf
        darf_res = calculate_monthly_darf(user_id, now_brt.month, now_brt.year)
        sales_stocks = _safe_float(darf_res.get("sales_total_stocks"))
        darf_due = _safe_float((darf_res.get("darf") or {}).get("darf_to_pay"))
        profits = darf_res.get("profits") or {}
        net_profit = _safe_float(profits.get("stocks_st")) + _safe_float(profits.get("stocks_dt")) + _safe_float(profits.get("fiis"))
        acc_losses = darf_res.get("accumulated_losses") or {}
        total_acc_loss = _safe_float(acc_losses.get("stocks_st")) + _safe_float(acc_losses.get("stocks_dt")) + _safe_float(acc_losses.get("fiis"))

        if darf_due > 0:
            tax_status = "DARF a pagar"
        elif sales_stocks <= 0 and net_profit == 0:
            tax_status = "Sem vendas tributáveis"
        elif bool(darf_res.get("is_exempt_stocks_st")) and sales_stocks <= 20000.0:
            tax_status = "Isento (<= R$ 20 mil)"
        else:
            tax_status = "Quitado / Zerado"

        tax_summary = {
            "competencia": f"{now_brt.month:02d}/{now_brt.year}",
            "sales_total_stocks": sales_stocks,
            "exempt_limit_brl": 20000.0,
            "net_profit_brl": net_profit,
            "accumulated_loss_brl": total_acc_loss,
            "darf_to_pay": darf_due,
            "status_label": tax_status,
        }
    except Exception as exc:
        logging.warning(f"Falha ao calcular DARF no relatório: {exc}")

    # --- Destaques objetivos (apenas ativos) ---
    insights = []
    if positions:
        top1 = positions[0]
        w_str = sanitize_pdf_text(f"{top1['weight_pct']:.1f}%")
        insights.append(
            f"Maior posição: <b>{top1['ticker']}</b> ({top1['asset_class']}) com {w_str} do patrimônio."
        )
    tactical_allocs = [a for a in allocation if not a["is_liquidity_reserve"]]
    if tactical_allocs:
        biggest_gap = max(tactical_allocs, key=lambda x: abs(x["diff_pp"]))
        if abs(biggest_gap["diff_pp"]) >= 2.0:
            dir_txt = "acima" if biggest_gap["diff_pp"] > 0 else "abaixo"
            d_str = sanitize_pdf_text(f"{abs(biggest_gap['diff_pp']):.1f}")
            insights.append(
                f"Maior desvio tático: <b>{biggest_gap['class']}</b> está {d_str} p.p. {dir_txt} da meta."
            )
    if buy_highlights:
        tickers_str = ", ".join(b["ticker"] for b in buy_highlights[:3])
        insights.append(f"Ativos com maior convicção de aporte hoje: <b>{tickers_str}</b>.")
    if dividends_30d_total > 0:
        val_fmt = f"{dividends_30d_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        insights.append(f"Fluxo de proventos provisionados nos próximos 30 dias: <b>R$ {val_fmt}</b>.")

    return {
        "generated_at": now_brt.strftime("%d/%m/%Y %H:%M BRT"),
        "period_ref": now_brt.strftime("%m/%Y"),
        "summary": {
            "total_brl": total_brl,
            "invested_ex_reserva_brl": invested_ex_reserva_brl,
            "total_invested_brl": total_invested_brl,
            "total_gain_brl": total_gain_brl,
            "total_gain_pct": total_gain_pct,
            "total_return_pct": total_return_pct,
            "total_dividends_hist": total_dividends_hist,
            "renda_mensal_est": renda_mensal_est,
            "dy_projetado_pct": dy_projetado_pct,
            "usd_brl": dolar_rate,
            "assets_count": len(positions),
            "brl_pct": round(brl_pct, 1),
            "usd_pct": round(usd_pct, 1),
        },
        "allocation": allocation,
        "top3_concentration": top3_concentration,
        "assets": positions,
        "regime": regime_data,
        "risk": risk_metrics,
        "rebalance_actions": rebalance_actions,
        "signals_summary": {
            "compra": status_counts["COMPRAR"],
            "observar": status_counts["NEUTRO"],
            "realizar": status_counts["REALIZAR"],
            "total_buy_signals": total_buy_signals,
        },
        "signals_v2": signals_table,
        "buy_highlights": buy_highlights,
        "dividends_30d_total": dividends_30d_total,
        "dividends_30d_items": dividends_30d_items,
        "tax_summary": tax_summary,
        "insights": insights,
    }
