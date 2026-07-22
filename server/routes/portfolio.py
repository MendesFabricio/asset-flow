from flask import Blueprint, jsonify, g
from db.session import Session
from domain.portfolio.monthly_snapshot import get_monthly_evolution_series, generate_or_update_monthly_snapshot
from db.models import DatabaseStateProxy, AssetTransaction
from services_modules.backup import BackupService
import traceback
import threading
from datetime import timedelta, date

portfolio_bp = Blueprint('portfolio', __name__)

@portfolio_bp.route('/api/portfolio/monthly-evolution', methods=['GET'])
def get_monthly_evolution():
    try:
        user_id = getattr(g, 'user_id', 1)
        with Session() as session:
            series = get_monthly_evolution_series(session, user_id)
            return jsonify(series), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

HISTORY_SYNC_STATE = DatabaseStateProxy("history_sync")

def _run_history_sync(user_id):
    try:
        from db.session import Session
        with Session() as session:
            first_tx = session.query(AssetTransaction).filter(AssetTransaction.user_id == user_id).order_by(AssetTransaction.transaction_date).first()
            if not first_tx:
                HISTORY_SYNC_STATE.update({"status": "idle", "progress": 1, "total": 1, "message": "Nenhuma transação encontrada."})
                return
                
            start_date = first_tx.transaction_date.date() if hasattr(first_tx.transaction_date, 'date') else first_tx.transaction_date
            end_date = date.today()
            delta_days = (end_date - start_date).days
            total_steps = delta_days + 1
            
            HISTORY_SYNC_STATE.update({"status": "processing", "progress": 0, "total": total_steps, "message": "Iniciando recálculo..."})
            
            backup_service = BackupService()
            
            # Fetch all transactions ordered by date
            from sqlalchemy import func
            from db.models import MarketData, PortfolioSnapshot, Asset, SyncState
            import calendar
            import json
            
            # Helper to update state inside the same session
            def update_state_in_session(sess, status, progress, total, message):
                state = sess.query(SyncState).filter_by(key="history_sync").first()
                if not state:
                    state = SyncState(key="history_sync")
                    sess.add(state)
                state.status = status
                state.progress = progress
                state.total = total
                state.message = message
                sess.flush()
            
            txs = session.query(AssetTransaction, Asset).join(Asset, AssetTransaction.ticker == Asset.ticker).filter(AssetTransaction.user_id == user_id).order_by(AssetTransaction.transaction_date).all()
            
            # Fetch historical prices dynamically from Yahoo Finance (last 10 years)
            import yfinance as yf
            import pandas as pd
            from utils.ticker_helper import to_yf_ticker
            
            user_assets = {asset for _, asset in txs}
            md_cache = {}
            for asset in user_assets:
                md_cache[asset.id] = {}
                
            download_list = []
            asset_symbol_map = {}
            for asset in user_assets:
                ticker_raw = asset.ticker.strip().upper()
                if len(ticker_raw) > 7 or " " in ticker_raw: continue
                symbol = to_yf_ticker(ticker_raw, asset.category.name if asset.category else '')
                asset_symbol_map[symbol] = asset.id
                download_list.append(symbol)
                
            if download_list:
                update_state_in_session(session, 'processing', 0, 100, f"Baixando histórico de {len(download_list)} ativos (10 anos)...")
                try:
                    batch_data = yf.download(download_list, period="10y", group_by='ticker', threads=False, progress=False, auto_adjust=False)
                    for symbol, asset_id in asset_symbol_map.items():
                        hist = pd.DataFrame()
                        if isinstance(batch_data.columns, pd.MultiIndex):
                            if symbol in batch_data.columns.levels[0]:
                                hist = batch_data[symbol]
                        else:
                            if len(download_list) == 1:
                                hist = batch_data
                            elif symbol in batch_data.columns:
                                hist = batch_data[symbol]
                        
                        if not hist.empty and 'Close' in hist.columns:
                            hist = hist.dropna(subset=['Close'])
                            for date_idx, row in hist.iterrows():
                                dt = date_idx.date() if hasattr(date_idx, 'date') else date_idx
                                md_cache[asset_id][dt] = float(row['Close'])
                except Exception as e:
                    print(f"Error fetching historical prices: {e}")
                
            def get_price_on_date(asset_id, d):
                # Search backwards for the closest price
                curr = d
                for _ in range(30): # look back up to 30 days
                    if asset_id in md_cache and curr in md_cache[asset_id]:
                        return md_cache[asset_id][curr]
                    curr -= timedelta(days=1)
                return 0.0

            portfolio = {}
            tx_index = 0
            num_txs = len(txs)
            
            # Delete old daily snapshots
            session.query(PortfolioSnapshot).filter(PortfolioSnapshot.user_id == user_id).delete()
            
            for i in range(total_steps):
                current_date = start_date + timedelta(days=i)
                
                # Apply transactions for this day
                while tx_index < num_txs:
                    tx, asset = txs[tx_index]
                    tx_d = tx.transaction_date.date() if hasattr(tx.transaction_date, 'date') else tx.transaction_date
                    if tx_d > current_date:
                        break
                        
                    if asset.id not in portfolio:
                        portfolio[asset.id] = {"quantity": 0.0, "total_cost": 0.0, "category": asset.category.name if asset.category else "Outros"}
                    
                    pos = portfolio[asset.id]
                    qty = float(tx.quantity)
                    val = float(tx.total_value)
                    
                    if tx.type == "BUY":
                        pos["quantity"] += qty
                        pos["total_cost"] += val
                    elif tx.type == "SELL":
                        if pos["quantity"] > 0:
                            avg_price = pos["total_cost"] / pos["quantity"]
                            pos["quantity"] -= qty
                            pos["total_cost"] -= (avg_price * qty)
                            if pos["quantity"] <= 0.0001:
                                pos["quantity"] = 0.0
                                pos["total_cost"] = 0.0
                    
                    tx_index += 1
                    
                # Calculate daily snapshot
                total_invested = 0.0
                total_equity = 0.0
                breakdown = {}
                
                for asset_id, pos in portfolio.items():
                    if pos["quantity"] > 0:
                        total_invested += pos["total_cost"]
                        price = get_price_on_date(asset_id, current_date)
                        if price == 0.0:
                            price = pos["total_cost"] / pos["quantity"]
                        equity = pos["quantity"] * price
                        total_equity += equity
                        
                        cat = pos["category"]
                        if cat not in breakdown:
                            breakdown[cat] = 0.0
                        breakdown[cat] += equity
                        
                # Save Daily Snapshot
                if total_invested > 0 or total_equity > 0:
                    snap = PortfolioSnapshot(
                        user_id=user_id,
                        date=current_date,
                        total_invested=total_invested,
                        total_equity=total_equity,
                        profit=total_equity - total_invested,
                        breakdown=json.dumps(breakdown)
                    )
                    session.add(snap)
                    
                is_last_day = (current_date.month != (current_date + timedelta(days=1)).month)
                if is_last_day or i == total_steps - 1:
                    generate_or_update_monthly_snapshot(session, user_id, current_date.year, current_date.month, md_cache)
                
                # Update progress every 30 days to avoid spamming the DB
                if i % 30 == 0:
                    update_state_in_session(session, "processing", i, total_steps, f"Analisando dia {i} de {total_steps}...")
                    session.commit()
            
            update_state_in_session(session, "idle", total_steps, total_steps, "Histórico recalculado com sucesso!")
            session.commit()
    except Exception as e:
        HISTORY_SYNC_STATE.update({"status": "error", "message": f"Erro: {str(e)}"})
        traceback.print_exc()

@portfolio_bp.route('/api/portfolio/recalculate-history', methods=['POST'])
def recalculate_history():
    user_id = getattr(g, 'user_id', 1)
    
    # Check if already running
    status = HISTORY_SYNC_STATE.get("status")
    if status == "processing":
        return jsonify({"message": "Já existe uma sincronização em andamento."}), 400
        
    HISTORY_SYNC_STATE.update({"status": "processing", "progress": 0, "total": 100, "message": "Iniciando recálculo..."})
    
    thread = threading.Thread(target=_run_history_sync, args=(user_id,))
    thread.start()
    
    return jsonify({"message": "Recálculo iniciado com sucesso"}), 202

@portfolio_bp.route('/api/portfolio/history-sync-status', methods=['GET'])
def get_history_sync_status():
    return jsonify(HISTORY_SYNC_STATE.get_all())
