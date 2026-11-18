"""
routes/valuation.py
Endpoints para Preço Teto (Bazin/Graham/Gordon/DCF), Checklist Fundamentalista,
Radar B3, Watchlist, Comparador de Ativos e Simulador de Renda Passiva.
"""
import logging
import threading
from typing import Optional
from flask import Blueprint, g, jsonify, request
from pydantic import BaseModel, Field, ValidationError

from db.models import (
    Asset,
    DatabaseStateProxy,
    MarketScreenerItem,
    Position,
    WatchlistItem,
    safe_commit,
)
from db.session import Session
from domain.quant.passive_income import simulate_passive_income
from domain.valuation.calculator import compute_sector_averages
from infrastructure.screener_service import (
    get_or_fetch_asset_valuation,
    refresh_b3_screener,
)
from utils.db_utils import get_current_user_id

valuation_bp = Blueprint("valuation", __name__)
RADAR_SYNC_STATE = DatabaseStateProxy("radar_sync")
_radar_lock = threading.Lock()


class WatchlistCreateInput(BaseModel):
    ticker: str = Field(..., min_length=2, max_length=16)
    desired_bazin_dy: float = Field(default=6.0, ge=1.0, le=30.0)
    target_price: Optional[float] = Field(default=None, ge=0.0)
    notes: Optional[str] = Field(default="", max_length=240)


class PassiveIncomeInput(BaseModel):
    initial_portfolio: float = Field(default=0.0, ge=0.0)
    monthly_contribution: float = Field(default=1000.0, ge=0.0)
    target_monthly_income: float = Field(default=5000.0, ge=1.0)
    annual_dy_pct: float = Field(default=8.0, ge=0.5, le=35.0)
    annual_growth_pct: float = Field(default=4.0, ge=0.0, le=25.0)
    reinvest_dividends: bool = Field(default=True)
    max_years: int = Field(default=30, ge=1, le=50)


def _portfolio_tickers_set(session, user_id: int) -> set[str]:
    rows = (
        session.query(Asset.ticker)
        .join(Position)
        .filter(Position.user_id == user_id, Position.quantity > 0)
        .all()
    )
    return {r[0].upper() for r in rows if r[0]}


def _filter_and_sort_radar(items: list[dict], strategy: str, asset_type: str, sector: str, search: str, only_outside: bool) -> list[dict]:
    filtered = items
    if asset_type and asset_type != "TODOS":
        filtered = [i for i in filtered if i.get("asset_type") == asset_type]
    if sector and sector != "TODOS":
        filtered = [i for i in filtered if i.get("sector") == sector]
    if only_outside:
        filtered = [i for i in filtered if not i.get("in_portfolio")]
    if search:
        q = search.upper()
        filtered = [
            i for i in filtered
            if q in (i.get("ticker") or "").upper() or q in (i.get("name") or "").upper()
        ]

    strat = (strategy or "quality").lower()
    if strat == "dividends":
        filtered = [i for i in filtered if (i.get("dy_12m") or 0) > 0]
        filtered.sort(key=lambda x: ((x.get("margin_bazin_pct") or -999), (x.get("dy_12m") or 0)), reverse=True)
    elif strat == "bargain":
        filtered.sort(
            key=lambda x: (
                x.get("margin_graham_pct") if x.get("margin_graham_pct") is not None else -999,
                x.get("quality_score") or 0,
            ),
            reverse=True,
        )
    elif strat == "magic":
        filtered = [i for i in filtered if i.get("magic_score") is not None]
        filtered.sort(key=lambda x: (x.get("magic_score") or 0, x.get("quality_score") or 0), reverse=True)
    elif strat == "fiis":
        filtered = [i for i in filtered if i.get("asset_type") == "FII"]
        filtered.sort(
            key=lambda x: (
                -(x.get("pvp") if x.get("pvp") and x.get("pvp") > 0 else 99),
                x.get("dy_12m") or 0,
            ),
            reverse=True,
        )
    else:
        filtered.sort(key=lambda x: (x.get("quality_score") or 0, x.get("margin_bazin_pct") or -999), reverse=True)

    return filtered


@valuation_bp.route("/api/valuation/asset/<ticker>", methods=["GET"])
def get_asset_valuation(ticker: str):
    user_id = get_current_user_id()
    bazin_dy = request.args.get("bazin_dy", type=float)
    discount_rate = request.args.get("discount_rate", type=float)
    growth_rate = request.args.get("growth_rate", type=float)
    terminal_growth = request.args.get("terminal_growth", type=float)
    force = request.args.get("force", "false").lower() == "true"

    try:
        with Session() as session:
            data = get_or_fetch_asset_valuation(
                session=session,
                ticker=ticker,
                user_id=user_id,
                bazin_dy=bazin_dy,
                discount_rate=discount_rate,
                growth_rate=growth_rate,
                terminal_growth=terminal_growth,
                force_refresh=force,
            )
            if not data:
                return jsonify({"status": "Erro", "msg": f"Não foi possível obter valuation para '{ticker.upper()}'."}), 404
            return jsonify({"status": "Sucesso", "data": data})
    except Exception as exc:
        logging.error(f"❌ Erro ao calcular valuation de {ticker}: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/radar", methods=["GET"])
def get_radar_screener():
    user_id = get_current_user_id()
    strategy = request.args.get("strategy", "quality")
    asset_type = request.args.get("type", "TODOS")
    sector = request.args.get("sector", "TODOS")
    search = request.args.get("q", "").strip()
    only_outside = request.args.get("only_outside", "false").lower() == "true"

    try:
        with Session() as session:
            rows = session.query(MarketScreenerItem).all()
            in_port = _portfolio_tickers_set(session, user_id)
            items = []
            for r in rows:
                d = r.to_dict()
                d["in_portfolio"] = d["ticker"] in in_port
                items.append(d)

            sectors = sorted({i["sector"] for i in items if i.get("sector")})
            sector_avgs = compute_sector_averages(items)
            filtered = _filter_and_sort_radar(items, strategy, asset_type, sector, search, only_outside)

            return jsonify({
                "status": "Sucesso",
                "total_cached": len(items),
                "sectors": sectors,
                "sector_averages": sector_avgs,
                "sync_state": RADAR_SYNC_STATE.to_dict() if hasattr(RADAR_SYNC_STATE, "to_dict") else {
                    "status": RADAR_SYNC_STATE.get("status", "idle"),
                    "message": RADAR_SYNC_STATE.get("message", "Pronto"),
                },
                "items": filtered,
            })
    except Exception as exc:
        logging.error(f"❌ Erro no Radar B3: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/radar/refresh", methods=["POST"])
def trigger_radar_refresh():
    user_id = get_current_user_id()
    body = request.get_json(silent=True) or {}
    limit = body.get("limit")
    sync = request.args.get("sync", "false").lower() in ("1", "true", "yes")

    def _run_refresh():
        if not _radar_lock.acquire(blocking=False):
            return
        try:
            RADAR_SYNC_STATE.update({"status": "processing", "progress": 10, "total": 100, "message": "Varrendo fundamentos da B3..."})
            with Session() as session:
                res = refresh_b3_screener(session, user_id=user_id, limit=limit)
            RADAR_SYNC_STATE.update({
                "status": "success",
                "progress": 100,
                "total": 100,
                "message": f"Radar atualizado: {res['updated']} ativos em {res['elapsed_sec']}s.",
            })
        except Exception as exc:
            logging.error(f"❌ Falha ao atualizar Radar B3: {exc}", exc_info=True)
            RADAR_SYNC_STATE.update({"status": "error", "message": str(exc)})
        finally:
            _radar_lock.release()

    if _radar_lock.locked():
        return jsonify({"status": "Processando", "msg": "Varredura do Radar já está em andamento."}), 202

    if sync:
        _run_refresh()
        return jsonify({"status": "Sucesso", "msg": RADAR_SYNC_STATE.get("message", "Radar atualizado.")})

    threading.Thread(target=_run_refresh, daemon=True).start()
    return jsonify({"status": "Processando", "msg": "Varredura do Radar B3 iniciada em background."}), 202


@valuation_bp.route("/api/valuation/compare", methods=["GET"])
def compare_assets():
    user_id = get_current_user_id()
    raw_tickers = request.args.get("tickers", "")
    tickers = []
    for part in raw_tickers.split(","):
        clean = part.strip().upper().replace(".SA", "")
        if clean and clean not in tickers:
            tickers.append(clean)
    tickers = tickers[:4]

    if not tickers:
        return jsonify({"status": "Erro", "msg": "Informe ao menos 1 ticker para comparar."}), 400

    try:
        with Session() as session:
            in_port = _portfolio_tickers_set(session, user_id)
            results = []
            for tkr in tickers:
                val = get_or_fetch_asset_valuation(session, tkr, user_id=user_id)
                if val:
                    val["in_portfolio"] = val["ticker"] in in_port
                    results.append(val)
            return jsonify({"status": "Sucesso", "items": results})
    except Exception as exc:
        logging.error(f"❌ Erro ao comparar ativos {tickers}: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/watchlist", methods=["GET", "POST"])
def watchlist_collection():
    user_id = get_current_user_id()
    try:
        with Session() as session:
            if request.method == "GET":
                wl_rows = (
                    session.query(WatchlistItem)
                    .filter_by(user_id=user_id)
                    .order_by(WatchlistItem.created_at.desc())
                    .all()
                )
                tickers = [w.ticker for w in wl_rows]
                screener_map = (
                    {
                        s.ticker: s.to_dict()
                        for s in session.query(MarketScreenerItem).filter(MarketScreenerItem.ticker.in_(tickers)).all()
                    }
                    if tickers
                    else {}
                )
                payload = []
                for w in wl_rows:
                    snap = screener_map.get(w.ticker)
                    if not snap:
                        snap = get_or_fetch_asset_valuation(session, w.ticker, user_id=user_id) or {}
                    price = snap.get("price") or 0.0
                    div_ps = snap.get("dividend_per_share")
                    custom_bazin = (
                        round(div_ps / (w.desired_bazin_dy / 100.0), 2)
                        if div_ps and w.desired_bazin_dy and w.desired_bazin_dy > 0
                        else snap.get("bazin_price")
                    )
                    effective_target = w.target_price or custom_bazin
                    discount_pct = (
                        round(((effective_target - price) / price) * 100.0, 2)
                        if effective_target and price > 0
                        else None
                    )
                    payload.append({
                        "id": w.id,
                        "ticker": w.ticker,
                        "desired_bazin_dy": w.desired_bazin_dy,
                        "target_price": w.target_price,
                        "effective_target_price": effective_target,
                        "discount_pct": discount_pct,
                        "notes": w.notes or "",
                        "market": snap,
                    })
                return jsonify({"status": "Sucesso", "items": payload})

            body = WatchlistCreateInput(**(request.get_json(silent=True) or {}))
            clean_ticker = body.ticker.strip().upper().replace(".SA", "")
            existing = session.query(WatchlistItem).filter_by(user_id=user_id, ticker=clean_ticker).first()
            if existing:
                existing.desired_bazin_dy = body.desired_bazin_dy
                existing.target_price = body.target_price
                existing.notes = body.notes
            else:
                existing = WatchlistItem(
                    user_id=user_id,
                    ticker=clean_ticker,
                    desired_bazin_dy=body.desired_bazin_dy,
                    target_price=body.target_price,
                    notes=body.notes,
                )
                session.add(existing)
            safe_commit(session)
            # Garante dados cacheados para o item adicionado
            get_or_fetch_asset_valuation(session, clean_ticker, user_id=user_id)
            return jsonify({"status": "Sucesso", "id": existing.id, "ticker": clean_ticker}), 201
    except ValidationError as exc:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": exc.errors()}), 400
    except Exception as exc:
        logging.error(f"❌ Erro na Watchlist: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/watchlist/<ticker>", methods=["DELETE"])
def delete_watchlist_item(ticker: str):
    user_id = get_current_user_id()
    clean_ticker = ticker.strip().upper().replace(".SA", "")
    try:
        with Session() as session:
            item = session.query(WatchlistItem).filter_by(user_id=user_id, ticker=clean_ticker).first()
            if not item:
                return jsonify({"status": "Erro", "msg": "Item não encontrado na Watchlist."}), 404
            session.delete(item)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "msg": f"{clean_ticker} removido da Watchlist."})
    except Exception as exc:
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/passive-income", methods=["POST"])
def passive_income_simulation():
    try:
        body = PassiveIncomeInput(**(request.get_json(silent=True) or {}))
        result = simulate_passive_income(
            initial_portfolio=body.initial_portfolio,
            monthly_contribution=body.monthly_contribution,
            target_monthly_income=body.target_monthly_income,
            annual_dy_pct=body.annual_dy_pct,
            annual_growth_pct=body.annual_growth_pct,
            reinvest_dividends=body.reinvest_dividends,
            max_years=body.max_years,
        )
        return jsonify({"status": "Sucesso", "data": result})
    except ValidationError as exc:
        return jsonify({"status": "Erro", "msg": "Parâmetros inválidos", "errors": exc.errors()}), 400
    except Exception as exc:
        logging.error(f"❌ Erro no simulador de renda passiva: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500


@valuation_bp.route("/api/valuation/signals/history", methods=["GET"])
def signal_history():
    user_id = get_current_user_id()
    ticker = (request.args.get("ticker") or "").strip().upper().replace(".SA", "")
    try:
        limit = min(max(int(request.args.get("limit", 180)), 1), 1000)
    except ValueError:
        limit = 180

    try:
        from db.models import SignalSnapshot
        with Session() as session:
            query = session.query(SignalSnapshot).filter_by(user_id=user_id)
            if ticker:
                query = query.filter(SignalSnapshot.ticker == ticker)
            rows = query.order_by(SignalSnapshot.date.desc(), SignalSnapshot.ticker.asc()).limit(limit).all()

            items = [
                {
                    "ticker": r.ticker,
                    "date": r.date.isoformat() if r.date else None,
                    "score": int(r.score or 0),
                    "status": r.status,
                    "recomendacao": r.recomendacao,
                    "preco": float(r.preco or 0),
                    "mg_graham": float(r.mg_graham or 0),
                    "mg_bazin": float(r.mg_bazin or 0),
                    "p_vp": float(r.p_vp or 0),
                    "quality_score": r.quality_score,
                }
                for r in rows
            ]
            by_status = {}
            for it in items:
                by_status[it["status"]] = by_status.get(it["status"], 0) + 1
            return jsonify({"status": "Sucesso", "items": items, "summary": {"total": len(items), "by_status": by_status}})
    except Exception as exc:
        logging.error(f"❌ Erro ao carregar histórico de sinais: {exc}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(exc)}), 500
