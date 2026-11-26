from flask import Blueprint, jsonify, request, g
from pydantic import BaseModel, Field, ValidationError
from typing import Optional
from datetime import datetime, date, timedelta
from decimal import Decimal
import math
import sys
import os
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService

assets_bp = Blueprint('assets', __name__)
service = PortfolioService()

# --- Schemas de Validação ---
from schemas import AssetTransactionCreate
class AssetInput(BaseModel):
    ticker: str = Field(..., min_length=1, json_schema_extra={"strip_whitespace": True})
    category: str = Field(..., min_length=1)
    qtd: float = Field(ge=0, default=0)
    pm: float = Field(ge=0, default=0)
    meta: float = Field(ge=0, default=0)

class UpdateInput(BaseModel):
    ticker: str
    qtd: float = Field(ge=0)
    pm: float = Field(ge=0)
    meta: float = Field(ge=0, le=100, default=0)
    dy: float = Field(default=0)
    lpa: float = Field(default=0)
    vpa: float = Field(default=0)
    current_price: Optional[float] = Field(default=None)
    tx_type: Optional[str] = Field(default=None)
    tx_amount: Optional[float] = Field(default=None)

# --- Rotas ---

import json
@assets_bp.route('/api/tickers', methods=['GET'])
def get_tickers():
    try:
        cache_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'tickers_cache.json')
        if not os.path.exists(cache_path):
            return jsonify([])
        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        logging.error(f"Erro ao ler tickers_cache.json: {e}")
        return jsonify([])

@assets_bp.route('/api/add_asset', methods=['POST'])
def add_asset():
    try:
        body = AssetInput(**request.json)
        
        msg = service.add_new_asset(
            body.ticker.upper(), 
            body.category, 
            body.qtd, 
            body.pm,
            body.meta
        )
        
        uid = getattr(g, 'user_id', None)
        def _background_tasks():
            try:
                service.current_user_id = uid
                service.update_prices(user_id=uid)
                service.take_daily_snapshot()
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar pós-inclusão de ativo em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_tasks)
             
        return jsonify({"status": "Sucesso", "msg": msg})
        
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": e.errors()}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/update_asset', methods=['POST'])
def update_asset():
    try:
        body = UpdateInput(**request.json)
        
        msg = service.update_position(
            ticker=body.ticker, 
            qtd=body.qtd, 
            pm=body.pm, 
            meta=body.meta, 
            dy=body.dy, 
            lpa=body.lpa, 
            vpa=body.vpa,
            current_price=body.current_price,
            tx_type=body.tx_type,
            tx_amount=body.tx_amount,
        )
        
        uid = getattr(g, 'user_id', None)

        def _background_update():
            try:
                service.current_user_id = uid
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-atualização em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)
             
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "detalhe": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    
@assets_bp.route('/api/validate_ticker', methods=['POST'])
def validate_ticker():
    data = request.json or {}
    ticker = data.get('ticker', '').strip()
    if not ticker:
        return jsonify({"valid": False, "msg": "Ticker vazio"}), 400
    
    result = service.validate_ticker_on_yahoo(ticker)
    
    if not result['valid']:
        return jsonify({
            "valid": False, 
            "ticker": ticker.upper(), 
            "manual": True, 
            "msg": "Ativo não encontrado no Yahoo. Será cadastrado como Manual."
        }), 200
    return jsonify(result), 200

@assets_bp.route('/api/delete_asset', methods=['POST'])
def delete_asset():
    data = request.json or {}
    asset_id = data.get('id')
    
    if not asset_id:
        return jsonify({"status": "Erro", "msg": "ID não informado"}), 400
    
    try:
        msg = service.delete_asset(asset_id)
        
        def _background_delete():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-exclusão em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_delete)
        
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/asset-transactions', methods=['POST'])
def add_asset_transaction():
    try:
        body = AssetTransactionCreate(**request.json)
        msg = service.add_transaction(
            ticker=body.ticker,
            tx_type=body.type,
            quantity=body.quantity,
            unit_price=body.unit_price,
            date=body.date,
            category=body.category,
            force_duplicate=body.force_duplicate
        )
        
        def _background_update():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-transação em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)

        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": e.errors()}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/asset-transactions/<ticker>', methods=['GET'])
def get_asset_transactions(ticker):
    try:
        history = service.get_transaction_history(ticker.upper())
        return jsonify(history)
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/asset-transactions/<int:tx_id>', methods=['DELETE'])
def delete_asset_transaction(tx_id):
    try:
        service.delete_transaction(tx_id)
        return jsonify({"status": "Sucesso", "msg": "Transação excluída e posição recalculada com sucesso."})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/assets')
def get_assets():
    """Carrega e monta os dados consolidados dos ativos da carteira."""
    try:
        dash_data = service.get_dashboard_data()
        return jsonify(dash_data.get("ativos", []))
    except Exception as e:
        logging.error(f"❌ Erro grave ao montar listagem de ativos: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/refresh_prices', methods=['POST'])
def refresh_prices():
    uid = getattr(g, 'user_id', None)
    sync = request.args.get('sync', '').lower() in ('1', 'true', 'yes')

    def _bg_refresh():
        if service._price_lock.acquire(blocking=sync):
            try:
                logging.info("⚡ Executando atualização manual de preços...")
                service.current_user_id = uid
                service.update_prices(user_id=uid)
                service.take_daily_snapshot()
            except Exception as e:
                logging.error(f"⚠️ Erro no refresh_prices: {e}")
            finally:
                service._price_lock.release()

    if sync:
        _bg_refresh()
        return jsonify({"status": "Sucesso", "msg": "Cotações atualizadas."}), 200

    from services import background_task_executor
    background_task_executor.submit(_bg_refresh)
    
    return jsonify({"status": "Processando", "msg": "Atualização iniciada em background."}), 202

@assets_bp.route('/api/risk-metrics', methods=['GET'])
def risk_metrics():
    """
    Retorna métricas institucionais de risco do portfólio vs. IBOVESPA:
    Beta, Alpha (Jensen), Sharpe, Sortino, Calmar e Maximum Drawdown.
    Usa cache de histórico compartilhado com Monte Carlo para evitar rede redundante.
    """
    try:
        result = service.calculate_risk_metrics()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro nas métricas de risco: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/smart-rebalance', methods=['POST'])
def smart_rebalance():
    """
    Motor de Rebalanceamento Inteligente com Correlação.
    Recebe aporte_mensal (R$) e retorna sugestões de compra por ativo,
    ponderadas pelo gap de alocação e penalidade de correlação.

    Body JSON: { "aporte_mensal": 1500.0 }
    """
    try:
        body = request.get_json(silent=True) or {}
        aporte = float(body.get("aporte_mensal", 0.0))
        raw_max_pct = body.get("max_asset_pct")
        max_asset_pct = float(raw_max_pct) if raw_max_pct not in (None, "", 0, "0") else None
        result = service.calculate_smart_rebalance(
            monthly_contribution=aporte,
            max_asset_pct=max_asset_pct,
        )
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro no smart-rebalance: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@assets_bp.route('/api/corporate-action', methods=['POST'])
def corporate_action():
    try:
        body = request.json or {}
        ticker = body.get('ticker')
        action_type = body.get('type')
        
        if not ticker or not action_type:
            return jsonify({"status": "Erro", "msg": "Ticker e Tipo de Evento são obrigatórios"}), 400
            
        msg = service.add_corporate_action(ticker, action_type, body)
        
        def _background_update():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-evento em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)
        
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except Exception as e:
        logging.error(f"❌ Erro na rota corporate-action: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500


def _compute_qty_on_date(txs, target_date: date, fallback_qty: float) -> float:
    """Reconstrói a quantidade real detida em target_date a partir de AssetTransaction."""
    from domain.portfolio.ledger_replay import compute_qty_at_date
    return compute_qty_at_date(txs, target_date, fallback_qty=fallback_qty)


def _compute_emissions_simulation(session, user_id: int, ticker_filter: str | None = None) -> list[dict]:
    """Calcula quantas cotas teóricas o usuário teria exercendo 100% das emissões registradas."""
    from db.models import Asset, AssetTransaction, Category, CorporateEvent, Dividend, Position

    pos_q = (
        session.query(Position, Asset, Category)
        .join(Asset, Position.asset_id == Asset.id)
        .join(Category, Asset.category_id == Category.id)
        .filter(Position.user_id == user_id)
    )
    if ticker_filter:
        pos_q = pos_q.filter(Asset.ticker == ticker_filter.strip().upper())

    pos_rows = pos_q.order_by(Asset.ticker.asc()).all()
    if not pos_rows:
        return []

    pos_ids = [pos.id for pos, _a, _c in pos_rows]
    asset_ids = [asset.id for _p, asset, _c in pos_rows]

    txs_by_pos: dict[int, list] = {}
    for tx in (
        session.query(AssetTransaction)
        .filter(AssetTransaction.position_id.in_(pos_ids), AssetTransaction.user_id == user_id)
        .order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc())
        .all()
    ):
        txs_by_pos.setdefault(tx.position_id, []).append(tx)

    emissions_by_asset: dict[int, list] = {}
    for ce in (
        session.query(CorporateEvent)
        .filter(CorporateEvent.asset_id.in_(asset_ids), CorporateEvent.user_id == user_id, CorporateEvent.type == "EMISSION")
        .order_by(CorporateEvent.date.asc(), CorporateEvent.id.asc())
        .all()
    ):
        emissions_by_asset.setdefault(ce.asset_id, []).append(ce)

    divs_by_asset: dict[int, list] = {}
    for div_row in (
        session.query(Dividend)
        .filter(Dividend.asset_id.in_(asset_ids), Dividend.user_id == user_id, Dividend.value_per_share > 0)
        .order_by(Dividend.date_com.desc(), Dividend.id.desc())
        .all()
    ):
        divs_by_asset.setdefault(div_row.asset_id, []).append(div_row)

    items = []
    for pos, asset, cat in pos_rows:
        txs = txs_by_pos.get(pos.id, [])
        first_buy_date = None
        for tx in txs:
            if (tx.type or "").upper() == "BUY" and tx.transaction_date:
                first_buy_date = (
                    tx.transaction_date.date()
                    if isinstance(tx.transaction_date, datetime)
                    else tx.transaction_date
                )
                break

        emissions_rows = emissions_by_asset.get(asset.id, [])

        current_qty = float(pos.quantity or 0)
        extra_theoretical_qty = 0.0
        total_theoretical_cost = 0.0
        emissions_out = []

        for ce in emissions_rows:
            ev_date = ce.date if isinstance(ce.date, date) else datetime.now().date()
            base_qty = _compute_qty_on_date(txs, ev_date, current_qty)
            factor_pct = float(
                ce.percent
                if ce.percent is not None
                else (float(ce.factor) * 100.0 if ce.factor is not None else 0.0)
            )
            proportion = max(0.0, factor_pct / 100.0)
            unit_cost = float(ce.unit_cost or 0.0)
            subscribed_qty = float(ce.received_qty or 0.0)

            real_rights_qty = float(math.floor(base_qty * proportion)) if proportion > 0 else 0.0
            theoretical_base_qty = base_qty + extra_theoretical_qty
            theoretical_rights_qty = float(math.floor(theoretical_base_qty * proportion)) if proportion > 0 else 0.0
            missed_qty = max(0.0, theoretical_rights_qty - subscribed_qty)
            extra_theoretical_qty += missed_qty
            theoretical_cost = theoretical_rights_qty * unit_cost
            total_theoretical_cost += theoretical_cost

            raw = ce.raw_data if isinstance(ce.raw_data, dict) else {}
            emissions_out.append({
                "id": ce.id,
                "ticker": asset.ticker,
                "date": ev_date.isoformat(),
                "factor_pct": round(factor_pct, 4),
                "unit_cost": round(unit_cost, 4),
                "subscribed_qty": round(subscribed_qty, 4),
                "base_qty_on_date": round(base_qty, 4),
                "real_rights_qty": real_rights_qty,
                "theoretical_base_qty": round(theoretical_base_qty, 4),
                "theoretical_rights_qty": theoretical_rights_qty,
                "missed_qty": missed_qty,
                "theoretical_cost": round(theoretical_cost, 2),
                "source": ce.source or "MANUAL",
                "title": raw.get("title") or f"Emissão {ev_date.strftime('%d/%m/%Y')}",
                "link": raw.get("link") or "",
                "doc_id": raw.get("doc_id") or "",
            })

        asset_divs = divs_by_asset.get(asset.id, [])
        est_monthly_div_per_share = 0.0
        if cat.name == "FII":
            if asset_divs:
                est_monthly_div_per_share = float(asset_divs[0].value_per_share or 0.0)
        else:
            cutoff_12m = date.today() - timedelta(days=365)
            divs_12m = [d for d in asset_divs if d.date_com and d.date_com >= cutoff_12m]
            if divs_12m:
                est_monthly_div_per_share = sum(float(d.value_per_share or 0.0) for d in divs_12m) / 12.0

        est_monthly_income = round(extra_theoretical_qty * est_monthly_div_per_share, 2)

        items.append({
            "ticker": asset.ticker,
            "category": cat.name,
            "current_qty": round(current_qty, 4),
            "theoretical_qty": round(current_qty + extra_theoretical_qty, 4),
            "missed_total_qty": round(extra_theoretical_qty, 4),
            "total_theoretical_cost": round(total_theoretical_cost, 2),
            "est_monthly_div_per_share": round(est_monthly_div_per_share, 4),
            "est_monthly_income": est_monthly_income,
            "first_buy_date": first_buy_date.isoformat() if first_buy_date else None,
            "emissions": emissions_out,
        })
    return items


@assets_bp.route('/api/emissions', methods=['GET'])
def get_emissions():
    from db.session import Session
    ticker = request.args.get('ticker')
    with Session() as session:
        items = _compute_emissions_simulation(session, g.user_id, ticker)
        return jsonify({"status": "Sucesso", "items": items})


@assets_bp.route('/api/emissions', methods=['POST'])
def save_emission():
    from db.session import Session
    from db.models import Asset, CorporateEvent, Position, safe_commit
    body = request.get_json(silent=True) or {}
    ticker = str(body.get('ticker') or '').strip().upper()
    date_str = str(body.get('date') or '').strip()
    if not ticker or not date_str:
        return jsonify({"status": "Erro", "msg": "Ticker e data-base são obrigatórios."}), 400

    try:
        ev_date = datetime.fromisoformat(date_str[:10]).date()
        factor_pct = max(0.0, float(body.get('factor_pct') or 0))
        unit_cost = max(0.0, float(body.get('unit_cost') or 0))
        subscribed_qty = max(0.0, float(body.get('subscribed_qty') or 0))
    except (TypeError, ValueError):
        return jsonify({"status": "Erro", "msg": "Valores numéricos ou data inválidos."}), 400

    title = str(body.get('title') or '').strip()
    link = str(body.get('link') or '').strip()
    event_id = body.get('id')

    with Session() as session:
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset:
                return jsonify({"status": "Erro", "msg": f"Ativo {ticker} não encontrado."}), 404
            pos = session.query(Position).filter_by(asset_id=asset.id, user_id=g.user_id).first()
            if not pos:
                return jsonify({"status": "Erro", "msg": f"Posição de {ticker} não encontrada."}), 404

            if event_id:
                ce = session.query(CorporateEvent).filter_by(
                    id=int(event_id), user_id=g.user_id, asset_id=asset.id, type="EMISSION"
                ).first()
                if not ce:
                    return jsonify({"status": "Erro", "msg": "Emissão não encontrada."}), 404
            else:
                ce = CorporateEvent(
                    asset_id=asset.id,
                    user_id=g.user_id,
                    type="EMISSION",
                    source="MANUAL",
                    raw_data={},
                )
                session.add(ce)

            ce.date = ev_date
            ce.percent = Decimal(str(factor_pct))
            ce.factor = Decimal(str(factor_pct / 100.0))
            ce.unit_cost = Decimal(str(unit_cost))
            ce.received_qty = Decimal(str(subscribed_qty))
            raw = dict(ce.raw_data) if isinstance(ce.raw_data, dict) else {}
            if title:
                raw["title"] = title
            if link:
                raw["link"] = link
            ce.raw_data = raw
            safe_commit(session)
            items = _compute_emissions_simulation(session, g.user_id, ticker)
            return jsonify({"status": "Sucesso", "id": ce.id, "items": items})
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro ao salvar emissão de {ticker}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500


@assets_bp.route('/api/emissions/<int:event_id>', methods=['DELETE'])
def delete_emission(event_id: int):
    from db.session import Session
    from db.models import CorporateEvent, safe_commit
    with Session() as session:
        try:
            ce = session.query(CorporateEvent).filter_by(
                id=event_id, user_id=g.user_id, type="EMISSION"
            ).first()
            if not ce:
                return jsonify({"status": "Erro", "msg": "Emissão não encontrada."}), 404
            session.delete(ce)
            safe_commit(session)
            return jsonify({"status": "Sucesso"})
        except Exception as e:
            session.rollback()
            return jsonify({"status": "Erro", "msg": str(e)}), 500


def _scan_asset_emissions(session, pos, asset, cat, user_id: int) -> int:
    """Varre comunicados de emissão de um ativo na B3/CVM e salva/atualiza em CorporateEvent."""
    from db.models import AssetTransaction, CorporateEvent
    from crawlers.b3_fnet import B3FnetCrawler
    from crawlers.cvm_enet import CVMEnetCrawler
    from utils.cvm_finder import CVMFinder
    from utils.cnpj_finder import CNPJFinder

    first_buy = (
        session.query(AssetTransaction)
        .filter_by(position_id=pos.id, user_id=user_id, type="BUY")
        .order_by(AssetTransaction.transaction_date.asc())
        .first()
    )
    since_date = (
        first_buy.transaction_date.date()
        if first_buy and first_buy.transaction_date
        else (date.today() - timedelta(days=365 * 5))
    )

    if not asset.cnpj or len(str(asset.cnpj)) < 14:
        found_cnpj = CNPJFinder.find_by_ticker(asset.ticker)
        if found_cnpj:
            asset.cnpj = found_cnpj
    if cat.name == "Ação" and asset.cnpj and not asset.cvm_code:
        clean_cnpj = "".join(filter(str.isdigit, str(asset.cnpj)))
        found_cvm = CVMFinder.find_code(clean_cnpj)
        if found_cvm:
            asset.cvm_code = found_cvm

    if cat.name == "FII" and asset.cnpj:
        notices = B3FnetCrawler.scan_historical_emissions(asset.cnpj, since_date=since_date)
        src = "B3_FNET"
    elif asset.cvm_code:
        notices = CVMEnetCrawler.scan_historical_emissions(asset.cvm_code, since_date=since_date)
        src = "CVM_ENET"
    else:
        return -1

    existing = (
        session.query(CorporateEvent)
        .filter_by(asset_id=asset.id, user_id=user_id, type="EMISSION")
        .all()
    )
    existing_by_doc_id = {
        str((ce.raw_data or {}).get("doc_id")): ce
        for ce in existing
        if isinstance(ce.raw_data, dict) and ce.raw_data.get("doc_id")
    }

    imported = 0
    for notice in notices:
        doc_id = str(notice.get("doc_id") or "").strip()
        parsed_dt = B3FnetCrawler._parse_date(notice.get("date"))
        ev_date = parsed_dt.date() if parsed_dt != datetime.min else date.today()
        title = str(notice.get("title") or "Comunicado de Emissão").strip()
        factor_val = notice.get("factor_pct")
        unit_cost_val = notice.get("unit_cost")

        if doc_id and doc_id in existing_by_doc_id:
            prev_ce = existing_by_doc_id[doc_id]
            updated = False
            if prev_ce.percent is None and factor_val is not None:
                prev_ce.percent = Decimal(str(factor_val))
                updated = True
            if prev_ce.unit_cost is None and unit_cost_val is not None:
                prev_ce.unit_cost = Decimal(str(unit_cost_val))
                updated = True
            if updated:
                prev_ce.date = ev_date
                prev_ce.raw_data = {**(prev_ce.raw_data or {}), "title": title}
                imported += 1
            continue

        if any(ce.date == ev_date and (ce.raw_data or {}).get("title") == title for ce in existing):
            continue
        ce = CorporateEvent(
            asset_id=asset.id,
            user_id=user_id,
            type="EMISSION",
            date=ev_date,
            percent=Decimal(str(factor_val)) if factor_val is not None else None,
            unit_cost=Decimal(str(unit_cost_val)) if unit_cost_val is not None else None,
            source=src,
            raw_data={
                "doc_id": doc_id,
                "title": title,
                "link": notice.get("link") or "",
            },
        )
        session.add(ce)
        existing.append(ce)
        if doc_id:
            existing_by_doc_id[doc_id] = ce
        imported += 1
    return imported


@assets_bp.route('/api/emissions/scan', methods=['POST'])
def scan_emissions():
    from db.session import Session
    from db.models import Asset, Category, Position, safe_commit

    body = request.get_json(silent=True) or {}
    ticker = str(body.get('ticker') or '').strip().upper()
    scan_all = not ticker or ticker == 'ALL'

    with Session() as session:
        try:
            if scan_all:
                rows = (
                    session.query(Position, Asset, Category)
                    .join(Asset, Position.asset_id == Asset.id)
                    .join(Category, Asset.category_id == Category.id)
                    .filter(
                        Position.user_id == g.user_id,
                        Position.quantity > 0,
                        Category.name.in_(("FII", "Ação")),
                    )
                    .order_by(Asset.ticker.asc())
                    .all()
                )
                total_imported = 0
                scanned_assets = 0
                for pos, asset, cat in rows:
                    try:
                        count = _scan_asset_emissions(session, pos, asset, cat, g.user_id)
                        if count >= 0:
                            total_imported += count
                            scanned_assets += 1
                    except Exception as e:
                        logging.warning(f"⚠️ Falha ao varrer emissões de {asset.ticker}: {e}")
                safe_commit(session)
                items = _compute_emissions_simulation(session, g.user_id)
                return jsonify({
                    "status": "Sucesso",
                    "imported": total_imported,
                    "scanned_assets": scanned_assets,
                    "items": items,
                })

            row = (
                session.query(Position, Asset, Category)
                .join(Asset, Position.asset_id == Asset.id)
                .join(Category, Asset.category_id == Category.id)
                .filter(Position.user_id == g.user_id, Asset.ticker == ticker)
                .first()
            )
            if not row:
                return jsonify({"status": "Erro", "msg": f"Posição de {ticker} não encontrada."}), 404
            pos, asset, cat = row
            imported = _scan_asset_emissions(session, pos, asset, cat, g.user_id)
            if imported < 0:
                return jsonify({
                    "status": "Erro",
                    "msg": f"{ticker} ainda não possui CNPJ/Código CVM vinculado para varredura.",
                }), 400
            safe_commit(session)
            items = _compute_emissions_simulation(session, g.user_id, ticker)
            return jsonify({"status": "Sucesso", "imported": imported, "scanned_assets": 1, "items": items})
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro ao varrer emissões ({ticker or 'ALL'}): {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500
