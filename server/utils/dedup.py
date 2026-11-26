from db.session import Session
from db.models import AssetTransaction, Dividend, CorporateEvent, Asset
from datetime import datetime
import logging
from sqlalchemy import func

def match_b3_to_db(user_id, parsed_data):
    """
    Recebe os dados do B3 Parser e cruza com o banco de dados.
    Adiciona a flag 'db_matched': True/False em cada item.
    Otimizado para O(1) queries por loop (Sem N+1).
    """
    dividends = parsed_data.get("dividends", [])
    transactions = parsed_data.get("transactions", [])
    corporate_events = parsed_data.get("corporate_events_suggestions", [])
    
    if not (dividends or transactions or corporate_events):
        return parsed_data

    with Session() as session:
        # 1. Obter todos os tickers únicos
        tickers_set = set()
        for d in dividends: tickers_set.add(d["ticker"].upper())
        for t in transactions: tickers_set.add(t["ticker"].upper())
        for ce in corporate_events: tickers_set.add(ce["ticker"].upper())

        # 2. Carregar Assets
        assets = session.query(Asset).filter(func.upper(Asset.ticker).in_(tickers_set)).all()
        asset_map = {a.ticker.upper(): a for a in assets}
        asset_ids = [a.id for a in assets]

        if not asset_ids and tickers_set:
            # Se tem ativos mas nenhum ta no DB
            pass

        # 3. Carregar Dividends do usuario e mapear com (asset_id, ref_date, type, total_value)
        def _coerce_dt(raw_d):
            if hasattr(raw_d, 'date'):
                return raw_d.date()
            if isinstance(raw_d, str) and raw_d.strip():
                try:
                    return datetime.strptime(raw_d.strip().split(' ')[0][:10], '%Y-%m-%d').date()
                except Exception:
                    return None
            return raw_d

        div_hash = {}
        div_hash_by_date_val = {}
        if asset_ids:
            db_dividends = session.query(
                Dividend.id, Dividend.asset_id, Dividend.date_com, Dividend.date_payment, Dividend.type, Dividend.total_value
            ).filter(
                Dividend.user_id == user_id,
                Dividend.asset_id.in_(asset_ids)
            ).all()
            for row in db_dividends:
                d_ref = _coerce_dt(row.date_payment or row.date_com)
                d_type = (row.type or "Dividendo").strip().upper()
                val_r = round(float(row.total_value or 0), 2)
                if d_ref is not None:
                    div_hash[(row.asset_id, d_ref, d_type, val_r)] = row.id
                    div_hash_by_date_val[(row.asset_id, d_ref, val_r)] = row.id
                div_hash[(row.asset_id, None, d_type, val_r)] = row.id

        # 4. Carregar AssetTransactions e mapear por (ticker, data, tipo, quantidade, unit_price)
        tx_hash = {}
        tx_hash_fallback = {}
        if tickers_set:
            db_txs = session.query(
                AssetTransaction.id,
                AssetTransaction.ticker,
                AssetTransaction.type,
                AssetTransaction.transaction_date,
                AssetTransaction.quantity,
                AssetTransaction.unit_price,
            ).filter(
                AssetTransaction.user_id == user_id,
                func.upper(AssetTransaction.ticker).in_(tickers_set)
            ).all()
            for row in db_txs:
                dt = _coerce_dt(row.transaction_date)
                t_type = (row.type or "BUY").strip().upper()
                q_r = round(float(row.quantity or 0), 4)
                p_r = round(float(row.unit_price or 0), 2)
                tx_hash[(row.ticker.upper(), dt, t_type, q_r, p_r)] = row.id
                tx_hash_fallback[(row.ticker.upper(), dt, t_type, q_r)] = row.id

        # 5. Carregar CorporateEvents
        ce_hash = {}
        if asset_ids:
            db_events = session.query(CorporateEvent.id, CorporateEvent.asset_id, CorporateEvent.date, CorporateEvent.type).filter(
                CorporateEvent.user_id == user_id,
                CorporateEvent.asset_id.in_(asset_ids)
            ).all()
            for row in db_events:
                dt = _coerce_dt(row.date)
                ce_type = (row.type or "").strip().upper()
                ce_hash[(row.asset_id, dt, ce_type)] = row.id
                ce_hash[(row.asset_id, dt, "")] = row.id

        # 6. Avaliar cada array em memória O(1)
        for d in dividends:
            try:
                val = round(float(d["total_value"]), 2)
                asset = asset_map.get(d["ticker"].upper())
                if not asset:
                    d["db_matched"] = False
                    continue
                d_ref = _coerce_dt(d.get("date_payment") or d.get("date_com") or d.get("date"))
                d_type = (d.get("type") or "Dividendo").strip().upper()
                matched_id = (
                    div_hash.get((asset.id, d_ref, d_type, val))
                    or (div_hash_by_date_val.get((asset.id, d_ref, val)) if d_ref is not None else None)
                    or (div_hash.get((asset.id, None, d_type, val)) if d_ref is None else None)
                )
                d["db_matched"] = bool(matched_id)
                if matched_id: d["matched_id"] = matched_id
            except Exception as e:
                logging.error(f"Erro deduplicando dividendo {d}: {e}")
                d["db_matched"] = False

        for t in transactions:
            try:
                dt = datetime.strptime(t["date"], "%Y-%m-%d").date()
                qty = round(float(t["quantity"]), 4)
                ticker_upper = t["ticker"].upper()
                t_type = (t.get("type") or "BUY").strip().upper()
                if t.get("unit_price") is not None:
                    p_r = round(float(t["unit_price"]), 2)
                    matched_id = tx_hash.get((ticker_upper, dt, t_type, qty, p_r)) or tx_hash_fallback.get((ticker_upper, dt, t_type, qty))
                else:
                    matched_id = tx_hash_fallback.get((ticker_upper, dt, t_type, qty))
                t["db_matched"] = bool(matched_id)
                if matched_id: t["matched_id"] = matched_id
            except Exception as e:
                logging.error(f"Erro deduplicando transacao {t}: {e}")
                t["db_matched"] = False
                
        for ce in corporate_events:
            try:
                dt = datetime.strptime(ce["date"], "%Y-%m-%d").date()
                asset = asset_map.get(ce["ticker"].upper())
                if not asset:
                    ce["db_matched"] = False
                    continue
                ce_type = (ce.get("type") or "").strip().upper()
                matched_id = ce_hash.get((asset.id, dt, ce_type)) or ce_hash.get((asset.id, dt, ""))
                ce["db_matched"] = bool(matched_id)
                if matched_id: ce["matched_id"] = matched_id
            except Exception as e:
                logging.error(f"Erro deduplicando evento {ce}: {e}")
                ce["db_matched"] = False

    return parsed_data
