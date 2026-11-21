from datetime import date, datetime, timedelta
from decimal import Decimal
import json
import logging
from flask import Blueprint, jsonify, g, request
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from db.models import (
    Asset,
    AssetTransaction,
    Dividend,
    MarketData,
    MonthlyPortfolioSnapshot,
    Session,
    SystemCache,
    get_active_positions,
    safe_commit,
) # ⚡ Importada a factory controlada thread-safe
from domain.portfolio.monthly_snapshot import (
    _extract_symbol_history,
    _to_date,
    apply_transaction_to_position_state,
)
from utils.ticker_helper import extract_option_meta, get_yf_historical_proxy
from services import PortfolioService

_YOC_PRICE_CACHE_KEY = "yoc_dividend_mkt_prices_v1"
_YOC_PRICE_CACHE_TTL = timedelta(hours=24)

dividends_bp = Blueprint('dividends', __name__)
service = PortfolioService()

@dividends_bp.route('/api/dividends', methods=['POST'])
def add_dividend():
    from datetime import datetime
    data = request.json or {}
    ticker = data.get('ticker')
    amount = data.get('amount')
    date_str = data.get('date')
    
    if not ticker or amount is None or not date_str:
        return jsonify({"msg": "Missing required fields"}), 400
        
    try:
        amount = float(amount)
        tx_date = datetime.strptime(date_str.split('T')[0], '%Y-%m-%d').date()
        qty = float(data.get('quantity', 1))
    except Exception as e:
        return jsonify({"msg": "Invalid date or amount format"}), 400

    with Session() as session:
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset:
                from utils.ticker_helper import to_yf_ticker
                import yfinance as yf
                # Try to auto-create asset like add_transaction does
                yf_ticker = to_yf_ticker(ticker, "Ação")
                try:
                    _ = yf.Ticker(yf_ticker).fast_info['lastPrice']
                except Exception:
                    pass
                from db.models import Category
                category = session.query(Category).filter_by(name="Ação").first()
                if not category:
                    category = session.query(Category).first()
                asset = Asset(ticker=ticker, category_id=category.id, currency="BRL")
                session.add(asset)
                session.flush()

            # Check duplicate
            duplicate = session.query(Dividend).filter_by(
                asset_id=asset.id,
                user_id=g.user_id,
                date_com=tx_date,
                total_value=amount
            ).first()
            
            if duplicate:
                return jsonify({"msg": "Duplicate dividend already exists."}), 409
                
            div = Dividend(
                asset_id=asset.id,
                user_id=g.user_id,
                date_com=tx_date,
                date_payment=tx_date,
                value_per_share=(amount / qty) if qty > 0 else amount,
                quantity_at_date=qty,
                total_value=amount,
                status="PAGO"
            )
            session.add(div)
            from db.models import safe_commit
            safe_commit(session)
            return jsonify({"msg": "Success", "id": div.id}), 201
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Error adding dividend: {e}")
            return jsonify({"msg": str(e)}), 500


@dividends_bp.route('/api/dividends/history', methods=['GET'])
def get_dividend_history():
    # ⚡ Gerenciador de Contexto: Garante liberação e fechamento imediato de conexões no SQLite
    with Session() as session:
        try:
            # Busca todos os dividendos carimbados do usuário logado, ordenando pelos mais recentes
            history = (
                session.query(Dividend)
                .options(joinedload(Dividend.asset))
                .filter_by(user_id=g.user_id)
                .order_by(func.coalesce(Dividend.date_payment, Dividend.date_com).desc(), Dividend.id.desc())
                .all()
            )

            results = []
            for div in history:
                eff_date = div.date_payment or div.date_com
                results.append({
                    "ticker": div.asset.ticker if div.asset else "UNKNOWN",
                    "date": eff_date.strftime('%Y-%m-%d') if eff_date else None,
                    "date_com": div.date_com.strftime('%Y-%m-%d') if div.date_com else None,
                    "date_payment": eff_date.strftime('%Y-%m-%d') if eff_date else None,
                    "type": div.type or "Dividendo",
                    "value_per_share": float(div.value_per_share or 0),
                    "quantity": float(div.quantity_at_date or 0),
                    "total": float(div.total_value or 0),
                    "status": div.status,
                })
            return jsonify(results)
        except Exception as e:
            logging.error(f"❌ Erro crítico na extração da rota de histórico de dividendos: {e}")
            return jsonify({"error": "Falha interna ao processar histórico de proventos"}), 500

@dividends_bp.route('/api/dividends/yoc', methods=['GET'])
def get_dividend_yoc():
    """Calcula o Dividend Yield on Cost (YOC) Preditivo de cada ativo na carteira."""
    with Session() as session:
        try:
            # 1. Busca previsões de dividendos
            forecast_res = service.calculate_dividend_forecast()
            details = forecast_res.get("details", [])
            
            # Agrupa o valor projetado total por ticker
            projected_map = {}
            for f in details:
                t = f["ticker"]
                projected_map[t] = projected_map.get(t, 0.0) + f["amount"]
                
            # 2. Busca posições do usuário logado
            positions = get_active_positions(session, g.user_id).all()
            
            yoc_list = []
            for pos in positions:
                if not pos.asset:
                    continue
                ticker = pos.asset.ticker.upper()
                qty = float(pos.quantity)
                avg_price = float(pos.average_price)
                cost = qty * avg_price
                
                projected_div = projected_map.get(ticker, 0.0)
                yoc = (projected_div / cost * 100) if cost > 0 else 0.0
                
                # Preço atual para fins de comparação com o DY atual
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else avg_price
                current_value = qty * price
                dy_atual = (projected_div / current_value * 100) if current_value > 0 else 0.0
                
                yoc_list.append({
                    "ticker": ticker,
                    "quantity": qty,
                    "average_price": avg_price,
                    "cost": round(cost, 2),
                    "current_price": price,
                    "current_value": round(current_value, 2),
                    "projected_dividend_12m": round(projected_div, 2),
                    "yoc": round(yoc, 2),
                    "dy_atual": round(dy_atual, 2)
                })
            yoc_list.sort(key=lambda x: x["yoc"], reverse=True)
            return jsonify(yoc_list)
        except Exception as e:
            logging.error(f"❌ Erro ao calcular YOC Preditivo: {e}", exc_info=True)
            return jsonify([]), 500

@dividends_bp.route('/api/dividends/analytics', methods=['GET'])
def get_dividend_analytics():
    """Calcula estatísticas de dividendos para o portfólio (DY Forward, Payout, Regularidade)"""
    with Session() as session:
        try:
            forecast_res = service.calculate_dividend_forecast()
            details = forecast_res.get("details", [])
            
            projected_map = {}
            for f in details:
                t = f["ticker"]
                projected_map[t] = projected_map.get(t, 0.0) + f["amount"]
                
            positions = get_active_positions(session, g.user_id).all()
            analytics = []
            
            for pos in positions:
                if not pos.asset:
                    continue
                cat = pos.asset.category.name if pos.asset.category else ""
                if cat in ["Reserva"]:
                    continue
                    
                ticker = pos.asset.ticker.upper()
                qty = float(pos.quantity)
                avg_price = float(pos.average_price)
                
                # Preço atual
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else avg_price
                
                projected_div = projected_map.get(ticker, 0.0)
                
                # DY Forward
                if pos.manual_dy and float(pos.manual_dy) > 0:
                    dy_forward = float(pos.manual_dy) * 100
                else:
                    current_value = qty * price
                    dy_forward = (projected_div / current_value * 100) if current_value > 0 else 0.0
                
                # Payout histórico estimado (DPA / LPA)
                payout = None
                manual_lpa = float(pos.manual_lpa) if pos.manual_lpa else 0.0
                if manual_lpa > 0:
                    dpa = (projected_div / qty) if qty > 0 else 0.0
                    if dpa <= 0 and pos.manual_dy:
                        dpa = float(pos.manual_dy) * price
                    payout = (dpa / manual_lpa) * 100
                    payout = min(100.0, round(payout, 2))
                
                # Consistência de Pagamento Score (número de trimestres com distribuição nos últimos 3 anos)
                divs = [d for d in pos.asset.dividends if d.user_id == g.user_id]
                quarters = set()
                for d in divs:
                    if d.date_com:
                        q_key = (d.date_com.year, (d.date_com.month - 1) // 3 + 1)
                        quarters.add(q_key)
                
                # Score de 0 a 100 (12 trimestres = 100%)
                num_quarters = len(quarters)
                regularity_score = min(100, int(num_quarters * 8.33))
                if regularity_score == 0 and pos.manual_dy and float(pos.manual_dy) > 0:
                    # Fallback suave se não tivermos histórico mas tiver cadastro manual
                    regularity_score = 60
                
                analytics.append({
                    "ticker": ticker,
                    "dy_forward": round(dy_forward, 2),
                    "payout_historico": payout,
                    "regularidade_score": regularity_score,
                    "num_quarters": num_quarters
                })
                
            return jsonify(analytics)
        except Exception as e:
            logging.error(f"Erro ao calcular analíticas de dividendos: {e}", exc_info=True)
            return jsonify([]), 500

def _compute_position_pm_at_dividend(txs: list, div: Dividend, fallback_pm: float) -> tuple[date, float]:
    """Reconstrói o PM vigente na Data-Com (ou pré-split compatível) de cada provento pago."""
    dt_com = div.date_com or div.date_payment
    dt_pay = div.date_payment or div.date_com
    eval_dt = dt_com
    d_qty = Decimal(str(div.quantity_at_date or 0))
    eps = Decimal("0.0001")

    state = {"quantity": Decimal("0.0"), "total_cost": Decimal("0.0")}
    for tx in txs:
        tx_d = _to_date(tx.transaction_date)
        if not tx_d or tx_d > dt_com:
            continue
        if (
            (tx.type or "").upper() in ("SPLIT", "INPLIT")
            and (dt_com - tx_d).days <= 25
            and d_qty > Decimal("0")
            and abs(state["quantity"] - d_qty) <= Decimal("0.01")
        ):
            eval_dt = tx_d - timedelta(days=1)
            break
        apply_transaction_to_position_state(state, tx, use_decimal=True)

    if state["quantity"] <= eps and dt_pay and dt_pay != dt_com:
        state = {"quantity": Decimal("0.0"), "total_cost": Decimal("0.0")}
        for tx in txs:
            tx_d = _to_date(tx.transaction_date)
            if tx_d and tx_d <= dt_pay:
                apply_transaction_to_position_state(state, tx, use_decimal=True)
        if state["quantity"] > eps:
            eval_dt = dt_pay

    if state["quantity"] <= eps and txs:
        apply_transaction_to_position_state(state, txs[0], use_decimal=True)

    if state["quantity"] > eps and state["total_cost"] > Decimal("0"):
        return eval_dt, float(state["total_cost"] / state["quantity"])
    return eval_dt, float(fallback_pm)


def _lookup_series_price(series: dict[date, float], eval_dt: date) -> float | None:
    """Busca fechamento no pregão mais próximo até 30 dias antes ou 30 dias após eval_dt."""
    if not series:
        return None
    curr = eval_dt
    for _ in range(30):
        if curr in series:
            return series[curr]
        curr -= timedelta(days=1)
    curr = eval_dt + timedelta(days=1)
    for _ in range(30):
        if curr in series:
            return series[curr]
        curr += timedelta(days=1)
    return None


def _get_dividend_market_prices(
    session,
    pos_by_aid: dict[int, object],
    eval_points_by_aid: dict[int, set[date]],
    txs_by_pos: dict[int, list],
) -> dict[tuple[int, date], float]:
    """Resolve cotações nominais históricas na data de cada dividendo com cache de 24h em SystemCache."""
    required_keys: list[tuple[int, date, str]] = [
        (aid, dt, f"{aid}:{dt.isoformat()}")
        for aid, dts in eval_points_by_aid.items()
        for dt in dts
    ]
    if not required_keys:
        return {}

    cached_map: dict[str, float] = {}
    cache_rec = session.query(SystemCache).filter_by(key=_YOC_PRICE_CACHE_KEY).first()
    cache_fresh = False
    if cache_rec and cache_rec.value and cache_rec.updated_at:
        try:
            loaded = json.loads(cache_rec.value)
            if isinstance(loaded, dict):
                cached_map = loaded
            cache_fresh = (datetime.now() - cache_rec.updated_at) < _YOC_PRICE_CACHE_TTL
        except Exception:
            cached_map = {}

    if cache_fresh and all(k in cached_map for _, _, k in required_keys):
        return {
            (aid, dt): float(cached_map[k])
            for aid, dt, k in required_keys
            if float(cached_map[k]) > 0
        }

    missing = [
        (aid, dt, k)
        for aid, dt, k in required_keys
        if (not cache_fresh) or (k not in cached_map)
    ]

    # 1. Tenta resolver via MarketData já persistido na data exata
    missing_aids = sorted({aid for aid, _, _ in missing})
    md_exact: dict[tuple[int, date], float] = {}
    md_latest: dict[int, float] = {}
    if missing_aids:
        md_rows = (
            session.query(MarketData)
            .filter(MarketData.asset_id.in_(missing_aids))
            .order_by(MarketData.date.asc())
            .all()
        )
        for md in md_rows:
            if md.price is None or float(md.price) <= 0:
                continue
            md_d = _to_date(md.date)
            p_val = float(md.price)
            md_latest[md.asset_id] = p_val
            if md_d:
                md_exact[(md.asset_id, md_d)] = p_val

    still_missing: list[tuple[int, date, str]] = []
    cache_dirty = False
    for aid, dt, k in missing:
        if (aid, dt) in md_exact:
            cached_map[k] = round(md_exact[(aid, dt)], 4)
            cache_dirty = True
        else:
            still_missing.append((aid, dt, k))

    # 2. Baixa séries históricas em lote via Yahoo Finance apenas para datas ausentes no cache
    if still_missing:
        sym_map: dict[str, list[tuple[object, int, float, date | None]]] = {}
        for aid in sorted({a for a, _, _ in still_missing}):
            pos = pos_by_aid.get(aid)
            if not pos or not pos.asset:
                continue
            t_raw = (pos.asset.ticker or "").strip().upper()
            if not t_raw or len(t_raw) > 7 or " " in t_raw or extract_option_meta(t_raw):
                continue
            cat_name = pos.asset.category.name if pos.asset.category else ""
            sym, factor, max_iso = get_yf_historical_proxy(t_raw, cat_name)
            sym_map.setdefault(sym, []).append((pos, aid, factor, _to_date(max_iso) if max_iso else None))

        if sym_map:
            yf_ok = False
            built_series: dict[int, dict[date, float]] = {}
            try:
                import pandas as pd
                import yfinance as yf

                syms = sorted(sym_map.keys())
                batch = yf.download(
                    syms,
                    period="10y",
                    group_by="ticker",
                    threads=True,
                    progress=False,
                    auto_adjust=False,
                    actions=True,
                )
                yf_ok = batch is not None and not getattr(batch, "empty", True)
                if yf_ok:
                    for sym, targets in sym_map.items():
                        raw_hist = _extract_symbol_history(batch, sym, len(syms))
                        if raw_hist.empty or "Close" not in raw_hist.columns:
                            continue
                        hist = raw_hist.dropna(subset=["Close"])
                        if hist.empty:
                            continue
                        med_close = float(hist["Close"].median())
                        yf_splits = []
                        if "Stock Splits" in hist.columns:
                            for idx, val in hist["Stock Splits"].items():
                                if pd.notna(val) and float(val) > 0:
                                    sp_dt = _to_date(idx)
                                    if sp_dt:
                                        yf_splits.append((sp_dt, float(val)))

                        for pos, aid, factor, max_dt in targets:
                            db_event_dates = [
                                d
                                for tx in txs_by_pos.get(pos.id, [])
                                if (tx.type or "").upper() in ("SPLIT", "INPLIT", "BONUS")
                                and (d := _to_date(tx.transaction_date)) is not None
                            ]
                            eff_splits = [
                                (next((d for d in db_event_dates if abs((d - yf_dt).days) <= 15), yf_dt), ratio)
                                for yf_dt, ratio in yf_splits
                            ]
                            series: dict[date, float] = {}
                            for date_idx, row in hist.iterrows():
                                row_dt = _to_date(date_idx)
                                if row_dt is None or (max_dt is not None and row_dt > max_dt):
                                    continue
                                close_val = float(row["Close"])
                                # Filtra outliers de erro de escala decimal no feed (ex: 1.06 vs 106.4)
                                if med_close > 0 and close_val < med_close * 0.2:
                                    continue
                                price = close_val * factor
                                for eff_dt, ratio in eff_splits:
                                    if row_dt < eff_dt:
                                        price *= ratio
                                series[row_dt] = price
                            built_series[aid] = series
            except Exception as exc:
                logging.warning(f"Falha ao consultar série histórica no Yahoo para YoC/DY: {exc}")

            for aid, dt, k in still_missing:
                found_price = _lookup_series_price(built_series.get(aid, {}), dt)
                if found_price and found_price > 0:
                    cached_map[k] = round(found_price, 4)
                    cache_dirty = True
                elif aid in md_latest and md_latest[aid] > 0:
                    cached_map[k] = round(md_latest[aid], 4)
                    cache_dirty = True
                elif yf_ok:
                    cached_map[k] = -1.0
                    cache_dirty = True

    if cache_dirty:
        payload = json.dumps(cached_map)
        if not cache_rec:
            session.add(SystemCache(key=_YOC_PRICE_CACHE_KEY, value=payload, updated_at=datetime.now()))
        else:
            cache_rec.value = payload
            cache_rec.updated_at = datetime.now()
        safe_commit(session)

    return {
        (aid, dt): float(cached_map[k])
        for aid, dt, k in required_keys
        if k in cached_map and float(cached_map[k]) > 0
    }


@dividends_bp.route('/api/dividends/yoc-history', methods=['GET'])
def get_yoc_history():
    """Retorna a série histórica de YoC (PM do momento) e DY do ativo (e da Carteira toda) por ano e recebimento."""
    with Session() as session:
        try:
            positions = get_active_positions(session, g.user_id).all()
            positions.sort(key=lambda p: (p.asset.ticker if p.asset and p.asset.ticker else "").upper())

            all_txs = (
                session.query(AssetTransaction)
                .filter_by(user_id=g.user_id)
                .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
                .all()
            )
            txs_by_pos: dict[int, list] = {}
            txs_by_ticker: dict[str, list] = {}
            for tx in all_txs:
                txs_by_pos.setdefault(tx.position_id, []).append(tx)
                if tx.ticker:
                    txs_by_ticker.setdefault(tx.ticker.upper(), []).append(tx)

            all_paid_divs = (
                session.query(Dividend)
                .options(joinedload(Dividend.asset).joinedload(Asset.category))
                .filter_by(user_id=g.user_id, status="PAGO")
                .order_by(func.coalesce(Dividend.date_payment, Dividend.date_com).asc(), Dividend.id.asc())
                .all()
            )
            divs_by_aid: dict[int, list[Dividend]] = {}
            for div in all_paid_divs:
                divs_by_aid.setdefault(div.asset_id, []).append(div)

            pos_by_aid: dict[int, object] = {}
            eval_points_by_aid: dict[int, set[date]] = {}
            prepared_by_ticker: dict[str, dict] = {}

            for pos in positions:
                if not pos.asset:
                    continue
                cat = pos.asset.category.name if pos.asset.category else ""
                if cat in ["Reserva"]:
                    continue

                ticker = pos.asset.ticker.upper()
                avg_price = float(pos.average_price or 0)
                if avg_price <= 0:
                    continue

                pos_by_aid[pos.asset_id] = pos
                txs = txs_by_pos.get(pos.id, [])
                divs = divs_by_aid.get(pos.asset_id, [])

                computed_divs = []
                for div in divs:
                    dt_com = div.date_com or div.date_payment
                    dt_pay = div.date_payment or div.date_com
                    if not dt_com or not dt_pay:
                        continue
                    eval_dt, pm_mom = _compute_position_pm_at_dividend(txs, div, avg_price)
                    eval_points_by_aid.setdefault(pos.asset_id, set()).add(eval_dt)
                    computed_divs.append((div, dt_com, dt_pay, eval_dt, pm_mom))

                prepared_by_ticker[ticker] = {
                    "pos": pos,
                    "avg_price": avg_price,
                    "divs": computed_divs,
                }

            mkt_prices = _get_dividend_market_prices(
                session,
                pos_by_aid,
                eval_points_by_aid,
                txs_by_pos,
            )

            results = {}
            for ticker, entry in prepared_by_ticker.items():
                pos = entry["pos"]
                avg_price = entry["avg_price"]
                year_map: dict[int, dict] = {}

                for div, dt_com, dt_pay, eval_dt, pm_mom in entry["divs"]:
                    total_val = float(div.total_value or 0)
                    qty_at_dt = float(div.quantity_at_date or 0)
                    # Prioriza o líquido real recebido por cota (corrige JCP bruto e arredondamentos antigos B3)
                    if qty_at_dt > 0 and total_val > 0:
                        dpa = total_val / qty_at_dt
                    else:
                        dpa = float(div.value_per_share or 0)

                    mkt_p = mkt_prices.get((pos.asset_id, eval_dt), 0.0)
                    if mkt_p <= 0:
                        mkt_p = pm_mom

                    yoc_ev = (dpa / pm_mom) * 100.0 if pm_mom > 0 else 0.0
                    dy_ev = (dpa / mkt_p) * 100.0 if mkt_p > 0 else 0.0

                    yr = dt_pay.year
                    bucket = year_map.setdefault(yr, {
                        "dpa": 0.0,
                        "total_received": 0.0,
                        "yoc": 0.0,
                        "dy_market": 0.0,
                        "pms": [],
                        "mkts": [],
                        "events": [],
                    })
                    bucket["dpa"] += dpa
                    bucket["total_received"] += total_val
                    bucket["yoc"] += yoc_ev
                    bucket["dy_market"] += dy_ev
                    bucket["pms"].append(pm_mom)
                    bucket["mkts"].append(mkt_p)
                    bucket["events"].append({
                        "ticker": ticker,
                        "date": dt_pay.strftime("%Y-%m-%d"),
                        "date_com": dt_com.strftime("%Y-%m-%d"),
                        "type": div.type or "Dividendo",
                        "dpa": round(dpa, 4),
                        "total": round(total_val, 2),
                        "quantity": round(qty_at_dt, 4),
                        "pm_at_moment": round(pm_mom, 2),
                        "market_price": round(mkt_p, 2),
                        "yoc_at_moment": round(yoc_ev, 2),
                        "dy_at_moment": round(dy_ev, 2),
                    })

                history = []
                for yr in sorted(year_map.keys()):
                    bucket = year_map[yr]
                    pms = bucket["pms"]
                    mkts = bucket["mkts"]
                    history.append({
                        "year": yr,
                        "dpa": round(bucket["dpa"], 4),
                        "total_received": round(bucket["total_received"], 2),
                        "yoc": round(bucket["yoc"], 2),
                        "dy_market": round(bucket["dy_market"], 2),
                        "pm_at_moment": round(pms[-1], 2),
                        "pm_avg_year": round(sum(pms) / len(pms), 2),
                        "market_price": round(sum(mkts) / len(mkts), 2),
                        "payments_count": len(bucket["events"]),
                        "events": bucket["events"],
                    })

                # Fallback se não houver histórico de proventos no SQLite, simula com o DY cadastrado
                if not history and pos.manual_dy and float(pos.manual_dy) > 0:
                    current_year = date.today().year
                    mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                    price = float(mdata.price or 0) if mdata else avg_price
                    dpa_est = float(pos.manual_dy) * price
                    yoc_est = (dpa_est / avg_price) * 100
                    dy_est = (dpa_est / price) * 100 if price > 0 else yoc_est
                    history = [
                        {
                            "year": current_year - 2 + idx,
                            "dpa": round(dpa_est * mult, 4),
                            "total_received": 0.0,
                            "yoc": round(yoc_est * mult, 2),
                            "dy_market": round(dy_est * mult, 2),
                            "pm_at_moment": round(avg_price, 2),
                            "pm_avg_year": round(avg_price, 2),
                            "market_price": round(price, 2),
                            "payments_count": 0,
                            "events": [],
                        }
                        for idx, mult in enumerate((0.9, 0.95, 1.0))
                    ]

                if history:
                    results[ticker] = history

            # Visão consolidada da Carteira Toda (ex-Reserva) com custo e valor de mercado no momento
            portfolio_history = _build_portfolio_yoc_history(
                session=session,
                user_id=g.user_id,
                all_paid_divs=all_paid_divs,
                all_txs=all_txs,
                txs_by_ticker=txs_by_ticker,
                pos_by_aid=pos_by_aid,
                mkt_prices=mkt_prices,
            )
            if portfolio_history:
                results["CARTEIRA"] = portfolio_history

            return jsonify(results)
        except Exception as e:
            logging.error(f"Erro ao calcular histórico de YOC: {e}", exc_info=True)
            return jsonify({}), 500


def _build_portfolio_yoc_history(
    session,
    user_id: int,
    all_paid_divs: list[Dividend],
    all_txs: list,
    txs_by_ticker: dict[str, list],
    pos_by_aid: dict[int, object],
    mkt_prices: dict[tuple[int, date], float],
) -> list[dict]:
    """Calcula YoC e DY consolidados da carteira toda (ex-Reserva) considerando custo/valor da época."""
    if not all_paid_divs:
        return []

    snaps = (
        session.query(MonthlyPortfolioSnapshot)
        .filter_by(user_id=user_id)
        .order_by(MonthlyPortfolioSnapshot.year.asc(), MonthlyPortfolioSnapshot.month.asc())
        .all()
    )
    snap_by_ym = {
        (s.year, s.month): (float(s.total_invested_cost or 0), float(s.total_market_value or 0))
        for s in snaps
    }

    # Identifica ativos de Reserva pelas transações/categorias para isolar capital de renda fixa líquida
    reserva_tickers: set[str] = set()
    reserva_aids = {
        a.id for a in session.query(Asset).join(Asset.category).filter_by(name="Reserva").all()
    }
    reserva_txs = []
    non_res_txs = []
    for tx in all_txs:
        tx_d = _to_date(tx.transaction_date)
        if not tx_d:
            continue
        t_up = (tx.ticker or "").upper()
        if t_up in ("NUBANK TURBO", "CAIXINHA TURBO", "NUBANK CAIXINHA") or "CAIXINHA" in t_up:
            reserva_tickers.add(t_up)
            reserva_txs.append((tx_d, t_up, tx))
        else:
            non_res_txs.append((tx_d, t_up, tx))

    # Inclui Reserva marcada diretamente na categoria dos ativos pagos/posições
    for aid, pos in pos_by_aid.items():
        if pos.asset and pos.asset.category and pos.asset.category.name == "Reserva":
            reserva_tickers.add(pos.asset.ticker.upper())
    if reserva_aids:
        for res_a in session.query(Asset).filter(Asset.id.in_(reserva_aids)).all():
            reserva_tickers.add(res_a.ticker.upper())
        # Reclassifica se havia transação em Reserva por categoria no banco
        moved = [item for item in non_res_txs if item[1] in reserva_tickers]
        if moved:
            non_res_txs = [item for item in non_res_txs if item[1] not in reserva_tickers]
            reserva_txs.extend(moved)
            reserva_txs.sort(key=lambda x: (x[0], getattr(x[2], "id", 0) or 0))

    # Índice de cotações mais recentes por ativo caso um snapshot não exista
    latest_mkt_by_aid: dict[int, float] = {}
    for (aid, dt), price in sorted(mkt_prices.items(), key=lambda kv: kv[0][1]):
        if price > 0:
            latest_mkt_by_aid[aid] = price

    res_state: dict[str, dict] = {}
    port_state: dict[str, dict] = {}
    r_idx = 0
    p_idx = 0

    def _lookup_snapshot(yr: int, mo: int) -> tuple[float, float] | None:
        cy, cm = yr, mo
        for _ in range(12):
            if (cy, cm) in snap_by_ym:
                return snap_by_ym[(cy, cm)]
            cm -= 1
            if cm == 0:
                cm = 12
                cy -= 1
        return None

    # Cache por (ticker, eval_dt) para ativos já calculados ou antigos
    asset_aid_by_ticker = {p.asset.ticker.upper(): aid for aid, p in pos_by_aid.items() if p.asset}
    year_map: dict[int, dict] = {}

    for div in all_paid_divs:
        if not div.asset:
            continue
        dt_com = div.date_com or div.date_payment
        dt_pay = div.date_payment or div.date_com
        if not dt_com or not dt_pay:
            continue

        ticker = div.asset.ticker.upper()
        total_val = float(div.total_value or 0)
        qty_at_dt = float(div.quantity_at_date or 0)
        if total_val <= 0:
            continue
        dpa = (total_val / qty_at_dt) if qty_at_dt > 0 else float(div.value_per_share or 0)

        while r_idx < len(reserva_txs) and reserva_txs[r_idx][0] <= dt_pay:
            _, r_tkr, r_tx = reserva_txs[r_idx]
            st = res_state.setdefault(r_tkr, {"quantity": Decimal("0.0"), "total_cost": Decimal("0.0")})
            apply_transaction_to_position_state(st, r_tx, use_decimal=True)
            r_idx += 1

        while p_idx < len(non_res_txs) and non_res_txs[p_idx][0] <= dt_pay:
            _, p_tkr, p_tx = non_res_txs[p_idx]
            st = port_state.setdefault(p_tkr, {"quantity": Decimal("0.0"), "total_cost": Decimal("0.0")})
            apply_transaction_to_position_state(st, p_tx, use_decimal=True)
            p_idx += 1

        res_cost = float(sum(max(Decimal("0.0"), st["total_cost"]) for st in res_state.values()))

        # PM e cotação do ativo individual neste provento
        pos = pos_by_aid.get(div.asset_id)
        fallback_pm = float(pos.average_price or 0) if pos else 0.0
        txs_asset = txs_by_ticker.get(ticker, [])
        eval_dt, pm_mom = _compute_position_pm_at_dividend(txs_asset, div, fallback_pm)
        if pm_mom <= 0:
            pm_mom = float(pos.average_price or 0) if pos else 0.0

        mkt_p = mkt_prices.get((div.asset_id, eval_dt), 0.0)
        if mkt_p <= 0:
            mkt_p = pm_mom

        asset_yoc = (dpa / pm_mom) * 100.0 if pm_mom > 0 else 0.0
        asset_dy = (dpa / mkt_p) * 100.0 if mkt_p > 0 else 0.0

        # Custo e valor de mercado da carteira ex-Reserva na época
        snap = _lookup_snapshot(dt_pay.year, dt_pay.month)
        if snap:
            port_cost = max(0.0, snap[0] - res_cost)
            port_mkt = max(0.0, snap[1] - res_cost)
        else:
            port_cost = 0.0
            port_mkt = 0.0
            for p_tkr, st in port_state.items():
                if st["quantity"] <= Decimal("0.0001"):
                    continue
                port_cost += float(max(Decimal("0.0"), st["total_cost"]))
                p_aid = asset_aid_by_ticker.get(p_tkr)
                p_mkt = mkt_prices.get((p_aid, eval_dt), 0.0) if p_aid else 0.0
                if p_mkt <= 0 and p_aid:
                    p_mkt = latest_mkt_by_aid.get(p_aid, 0.0)
                if p_mkt > 0:
                    port_mkt += float(st["quantity"]) * p_mkt
                else:
                    port_mkt += float(max(Decimal("0.0"), st["total_cost"]))

        port_yoc_ev = (total_val / port_cost) * 100.0 if port_cost > 0 else 0.0
        port_dy_ev = (total_val / port_mkt) * 100.0 if port_mkt > 0 else 0.0

        yr = dt_pay.year
        bucket = year_map.setdefault(yr, {
            "total_received": 0.0,
            "yoc": 0.0,
            "dy_market": 0.0,
            "costs": [],
            "mkts": [],
            "events": [],
        })
        bucket["total_received"] += total_val
        bucket["yoc"] += port_yoc_ev
        bucket["dy_market"] += port_dy_ev
        if port_cost > 0:
            bucket["costs"].append(port_cost)
        if port_mkt > 0:
            bucket["mkts"].append(port_mkt)
        bucket["events"].append({
            "ticker": ticker,
            "date": dt_pay.strftime("%Y-%m-%d"),
            "date_com": dt_com.strftime("%Y-%m-%d"),
            "type": div.type or "Dividendo",
            "dpa": round(dpa, 4),
            "total": round(total_val, 2),
            "quantity": round(qty_at_dt, 4),
            "pm_at_moment": round(pm_mom, 2),
            "market_price": round(mkt_p, 2),
            "yoc_at_moment": round(asset_yoc, 2),
            "dy_at_moment": round(asset_dy, 2),
        })

    history = []
    for yr in sorted(year_map.keys()):
        bucket = year_map[yr]
        costs = bucket["costs"]
        mkts = bucket["mkts"]
        history.append({
            "year": yr,
            "dpa": round(bucket["total_received"], 2),
            "total_received": round(bucket["total_received"], 2),
            "yoc": round(bucket["yoc"], 2),
            "dy_market": round(bucket["dy_market"], 2),
            "pm_at_moment": round(costs[-1], 2) if costs else 0.0,
            "pm_avg_year": round(sum(costs) / len(costs), 2) if costs else 0.0,
            "market_price": round(sum(mkts) / len(mkts), 2) if mkts else 0.0,
            "payments_count": len(bucket["events"]),
            "events": bucket["events"],
        })
    return history

@dividends_bp.route('/api/dividends/seasonality', methods=['GET'])
def get_dividend_seasonality():
    """Retorna uma matriz de sazonalidade mensal dos dividendos recebidos no portfólio"""
    with Session() as session:
        try:
            divs = session.query(Dividend).filter_by(user_id=g.user_id).all()
            matrix = {}
            
            for d in divs:
                if d.status != "PAGO":
                    continue
                eff_dt = d.date_payment or d.date_com
                if eff_dt:
                    yr = eff_dt.year
                    mo = eff_dt.month
                    val = float(d.total_value)

                    if yr not in matrix:
                        matrix[yr] = {m: 0.0 for m in range(1, 13)}
                    matrix[yr][mo] += val
            
            # Formata para o frontend
            years_list = sorted(matrix.keys(), reverse=True)
            data = []
            
            for yr in years_list:
                row = {"year": yr}
                for m in range(1, 13):
                    row[f"m{m}"] = round(matrix[yr][m], 2)
                data.append(row)
                
            # Fallback se não houver dados, gera matriz vazia para evitar quebras
            if not data:
                current_year = 2026
                data = [
                    {"year": current_year, **{f"m{m}": 0.0 for m in range(1, 13)}},
                    {"year": current_year - 1, **{f"m{m}": 0.0 for m in range(1, 13)}}
                ]
                
            return jsonify(data)
        except Exception as e:
            logging.error(f"Erro ao calcular sazonalidade de proventos: {e}", exc_info=True)
            return jsonify([]), 500
