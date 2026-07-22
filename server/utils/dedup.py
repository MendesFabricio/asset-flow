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

        # 3. Carregar Dividends do usuario e mapear
        div_hash = {}
        if asset_ids:
            db_dividends = session.query(Dividend.id, Dividend.asset_id, Dividend.total_value).filter(
                Dividend.user_id == user_id,
                Dividend.asset_id.in_(asset_ids)
            ).all()
            for row in db_dividends:
                div_hash[(row.asset_id, round(float(row.total_value), 2))] = row.id

        # 4. Carregar AssetTransactions e mapear
        tx_hash = {}
        if tickers_set:
            db_txs = session.query(AssetTransaction.id, AssetTransaction.ticker, AssetTransaction.transaction_date, AssetTransaction.quantity).filter(
                AssetTransaction.user_id == user_id,
                func.upper(AssetTransaction.ticker).in_(tickers_set)
            ).all()
            for row in db_txs:
                dt = row.transaction_date.date() if hasattr(row.transaction_date, 'date') else row.transaction_date
                # No SQLite o transaction_date pode vir como string as vezes se não parseado 
                if isinstance(dt, str):
                    try:
                        dt = datetime.strptime(dt.split(' ')[0], '%Y-%m-%d').date()
                    except:
                        pass
                tx_hash[(row.ticker.upper(), dt, round(float(row.quantity), 4))] = row.id

        # 5. Carregar CorporateEvents
        ce_hash = {}
        if asset_ids:
            db_events = session.query(CorporateEvent.id, CorporateEvent.asset_id, CorporateEvent.date).filter(
                CorporateEvent.user_id == user_id,
                CorporateEvent.asset_id.in_(asset_ids)
            ).all()
            for row in db_events:
                dt = row.date
                if isinstance(dt, str):
                    try: dt = datetime.strptime(dt.split(' ')[0], '%Y-%m-%d').date()
                    except: pass
                ce_hash[(row.asset_id, dt)] = row.id

        # 6. Avaliar cada array em memória O(1)
        for d in dividends:
            try:
                val = round(float(d["total_value"]), 2)
                asset = asset_map.get(d["ticker"].upper())
                if not asset:
                    d["db_matched"] = False
                    continue
                
                matched_id = div_hash.get((asset.id, val))
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
                
                matched_id = tx_hash.get((ticker_upper, dt, qty))
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
                    
                matched_id = ce_hash.get((asset.id, dt))
                ce["db_matched"] = bool(matched_id)
                if matched_id: ce["matched_id"] = matched_id
            except Exception as e:
                logging.error(f"Erro deduplicando evento {ce}: {e}")
                ce["db_matched"] = False

    return parsed_data
