"""
server/domain/portfolio/attribution.py
Atribuição patrimonial mensal (Aportes Líquidos vs. Valorização de Mercado vs. Dividendos)
com deflator IPCA (BCB SGS 433) em cache de 24h e fallback offline.
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

import requests
from sqlalchemy import func

from db.models import AssetTransaction, Dividend, SystemCache
from domain.portfolio.monthly_snapshot import get_monthly_evolution_series

IPCA_CACHE_KEY = "bcb_sgs_433_ipca_v2"
FALLBACK_MONTHLY_IPCA = 0.0040  # Usado apenas se BCB SGS 433 nunca respondeu


def _parse_bcb_date(date_str: str) -> Optional[Tuple[int, int]]:
    try:
        dt = datetime.strptime(date_str.strip(), "%d/%m/%Y")
        return (dt.year, dt.month)
    except Exception:
        return None


def get_monthly_ipca_series(session) -> Tuple[Dict[Tuple[int, int], float], str]:
    """
    Obtém série mensal do IPCA (BCB SGS 433) em formato decimal (ex.: 0.0045 = 0.45%).
    Usa cache em SystemCache por 24h e mantém fallback determinístico offline.
    """
    cached = session.query(SystemCache).filter_by(key=IPCA_CACHE_KEY).first()
    cached_map: Dict[Tuple[int, int], float] = {}
    if cached and cached.value:
        try:
            raw_cached = json.loads(cached.value)
            cached_map = {
                tuple(map(int, k.split("-"))): float(v)
                for k, v in raw_cached.items()
            }
            if cached.updated_at and (datetime.now() - cached.updated_at) < timedelta(hours=24):
                return cached_map, "bcb_cache"
        except Exception as exc:
            logging.warning(f"Falha ao ler cache IPCA: {exc}")

    try:
        end_dt = datetime.now().date()
        start_dt = end_dt - timedelta(days=3600)
        url = (
            "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados"
            f"?formato=json&dataInicial={start_dt.strftime('%d/%m/%Y')}"
            f"&dataFinal={end_dt.strftime('%d/%m/%Y')}"
        )
        res = requests.get(url, timeout=6.0)
        if res.status_code == 200:
            rows = res.json()
            fresh_map: Dict[Tuple[int, int], float] = {}
            for item in rows:
                ym = _parse_bcb_date(str(item.get("data", "")))
                if ym is None:
                    continue
                fresh_map[ym] = float(item["valor"]) / 100.0

            if fresh_map:
                serialized = json.dumps({f"{y}-{m}": v for (y, m), v in fresh_map.items()})
                if cached:
                    cached.value = serialized
                    cached.updated_at = datetime.now()
                else:
                    session.add(SystemCache(key=IPCA_CACHE_KEY, value=serialized, updated_at=datetime.now()))
                try:
                    session.commit()
                except Exception:
                    session.rollback()
                return fresh_map, "bcb_live"
    except Exception as exc:
        logging.warning(f"BCB SGS 433 indisponível, usando fallback IPCA: {exc}")

    if cached_map:
        return cached_map, "bcb_stale_cache"
    return {}, "fallback"


def _ym_from_date(val) -> Optional[Tuple[int, int]]:
    if val is None:
        return None
    if hasattr(val, "year") and hasattr(val, "month"):
        return (int(val.year), int(val.month))
    if isinstance(val, str):
        try:
            dt = datetime.strptime(val.split(" ")[0][:10], "%Y-%m-%d")
            return (dt.year, dt.month)
        except Exception:
            return None
    return None


def calculate_monthly_attribution(session, user_id: int) -> dict:
    """
    Calcula decomposição mensal do patrimônio preservando a identidade contábil:
      crescimento_custodia == aportes_liquidos + variacao_mercado
      retorno_total == variacao_mercado + dividendos
    Também calcula valores reais deflacionados pelo IPCA (F6).
    """
    snapshots = get_monthly_evolution_series(session, user_id)
    if not snapshots:
        return {
            "status": "Sucesso",
            "series": [],
            "ipca_source": "none",
            "summary": {
                "patrimonio_atual": 0.0,
                "patrimonio_inicial": 0.0,
                "total_aportes_liquidos": 0.0,
                "total_aporte_do_bolso": 0.0,
                "total_variacao_mercado": 0.0,
                "total_dividendos": 0.0,
                "retorno_total_acumulado": 0.0,
                "retorno_sobre_bolso_pct": 0.0,
                "variacao_mercado_real_acumulada": 0.0,
                "retorno_total_real_acumulado": 0.0,
                "ipca_acumulado_pct": 0.0,
            },
        }

    # Agrupa aportes líquidos (BUY - SELL) por mês
    txs = (
        session.query(
            AssetTransaction.type,
            AssetTransaction.total_value,
            AssetTransaction.transaction_date,
        )
        .filter(
            AssetTransaction.user_id == user_id,
            AssetTransaction.type.in_(["BUY", "SELL"]),
        )
        .all()
    )
    flows_by_ym: Dict[Tuple[int, int], float] = {}
    for tx_type, total_val, tx_date in txs:
        ym = _ym_from_date(tx_date)
        if ym is None:
            continue
        amount = float(total_val or 0.0)
        signed = amount if tx_type == "BUY" else -amount
        flows_by_ym[ym] = flows_by_ym.get(ym, 0.0) + signed

    # Agrupa dividendos recebidos/pagos no mês
    divs = (
        session.query(Dividend.total_value, Dividend.date_payment, Dividend.date_com)
        .filter(Dividend.user_id == user_id)
        .all()
    )
    divs_by_ym: Dict[Tuple[int, int], float] = {}
    today = date.today()
    for total_val, dt_pay, dt_com in divs:
        ref_date = dt_pay or dt_com
        if ref_date is not None:
            ref_d = ref_date.date() if hasattr(ref_date, "date") else ref_date
            if isinstance(ref_d, date) and ref_d > today:
                continue
        ym = _ym_from_date(ref_date)
        if ym is None:
            continue
        divs_by_ym[ym] = divs_by_ym.get(ym, 0.0) + float(total_val or 0.0)

    ipca_by_ym, ipca_source = get_monthly_ipca_series(session)

    series: List[dict] = []
    prev_market = 0.0
    cum_aportes = 0.0
    cum_mercado = 0.0
    cum_dividendos = 0.0
    cum_mercado_real = 0.0
    cum_ipca_factor = 1.0
    ipca_fallback_months = 0
    recent_ipca_vals = [ipca_by_ym[k] for k in sorted(ipca_by_ym.keys())[-12:]] if ipca_by_ym else []
    recent_ipca_avg = (sum(recent_ipca_vals) / len(recent_ipca_vals)) if recent_ipca_vals else FALLBACK_MONTHLY_IPCA

    for snap in snapshots:
        y = int(snap["year"])
        m = int(snap["month"])
        patrimonio_fim = round(float(snap.get("total_market_value", 0.0)), 2)
        crescimento = round(patrimonio_fim - prev_market, 2)
        aportes = round(flows_by_ym.get((y, m), 0.0), 2)
        # Identidade exata preservada no último centavo
        variacao_mercado = round(crescimento - aportes, 2)
        dividendos = round(divs_by_ym.get((y, m), 0.0), 2)
        retorno_total = round(variacao_mercado + dividendos, 2)

        ipca_is_fallback = (y, m) not in ipca_by_ym
        if ipca_is_fallback:
            ipca_fallback_months += 1
        ipca_m = ipca_by_ym.get((y, m), recent_ipca_avg)
        cum_ipca_factor *= (1.0 + ipca_m)

        # Erosão inflacionária sobre o patrimônio inicial exposto ao mês
        erosao_ipca = round(prev_market * ipca_m, 2)
        variacao_mercado_real = round(variacao_mercado - erosao_ipca, 2)
        retorno_total_real = round(variacao_mercado_real + dividendos, 2)

        cum_aportes = round(cum_aportes + aportes, 2)
        cum_mercado = round(cum_mercado + variacao_mercado, 2)
        cum_dividendos = round(cum_dividendos + dividendos, 2)
        cum_mercado_real = round(cum_mercado_real + variacao_mercado_real, 2)

        series.append({
            "year": y,
            "month": m,
            "period": snap["period"],
            "patrimonio_inicio": prev_market,
            "patrimonio_fim": patrimonio_fim,
            "aportes_liquidos": aportes,
            "crescimento_custodia": crescimento,
            "variacao_mercado": variacao_mercado,
            "dividendos": dividendos,
            "retorno_total": retorno_total,
            "ipca_mes_pct": round(ipca_m * 100.0, 2),
            "ipca_is_fallback": ipca_is_fallback,
            "erosao_ipca": erosao_ipca,
            "variacao_mercado_real": variacao_mercado_real,
            "retorno_total_real": retorno_total_real,
            "aportes_acumulados": cum_aportes,
            "aporte_bolso_acumulado": round(cum_aportes - cum_dividendos, 2),
            "patrimonio_acumulado": patrimonio_fim,
            "retorno_acumulado": round(cum_mercado + cum_dividendos, 2),
            "retorno_real_acumulado": round(cum_mercado_real + cum_dividendos, 2),
        })
        prev_market = patrimonio_fim

    ipca_acumulado_pct = round((cum_ipca_factor - 1.0) * 100.0, 2)
    retorno_total_acumulado = round(cum_mercado + cum_dividendos, 2)
    total_aporte_do_bolso = round(cum_aportes - cum_dividendos, 2)
    retorno_sobre_bolso_pct = (
        round((retorno_total_acumulado / total_aporte_do_bolso) * 100.0, 2)
        if total_aporte_do_bolso > 0
        else 0.0
    )
    return {
        "status": "Sucesso",
        "ipca_source": ipca_source,
        "series": series,
        "summary": {
            "patrimonio_atual": series[-1]["patrimonio_fim"],
            "patrimonio_inicial": series[0]["patrimonio_inicio"],
            "total_aportes_liquidos": cum_aportes,
            "total_aporte_do_bolso": total_aporte_do_bolso,
            "total_variacao_mercado": cum_mercado,
            "total_dividendos": cum_dividendos,
            "retorno_total_acumulado": retorno_total_acumulado,
            "retorno_sobre_bolso_pct": retorno_sobre_bolso_pct,
            "variacao_mercado_real_acumulada": cum_mercado_real,
            "retorno_total_real_acumulado": round(cum_mercado_real + cum_dividendos, 2),
            "ipca_acumulado_pct": ipca_acumulado_pct,
            "ipca_fallback_months": ipca_fallback_months,
        },
    }
