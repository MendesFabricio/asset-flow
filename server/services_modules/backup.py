# server/services_modules/backup.py
import logging
import os
import sqlite3
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.exc import IntegrityError
from db.models import PortfolioSnapshot, SignalSnapshot, TriggeredAlert, safe_commit
from db.session import Session
import json

class BackupService:
    def _upsert_signal_snapshots(self, session, user_id: int, ativos: list, snap_date: date):
        """Persiste snapshot diário de sinal e gera alerta quando o status muda."""
        if not ativos:
            return
        existing_map = {
            s.asset_id: s
            for s in session.query(SignalSnapshot)
            .filter_by(user_id=user_id)
            .filter(SignalSnapshot.date == snap_date)
            .all()
        }
        prior_rows = (
            session.query(SignalSnapshot)
            .filter_by(user_id=user_id)
            .filter(SignalSnapshot.date < snap_date)
            .order_by(SignalSnapshot.date.desc())
            .all()
        )
        prev_status_by_asset = {}
        for pr in prior_rows:
            if pr.asset_id not in prev_status_by_asset:
                prev_status_by_asset[pr.asset_id] = pr.status

        notified_today = {
            t[0]
            for t in session.query(TriggeredAlert.ticker)
            .filter(
                TriggeredAlert.condition == "SIGNAL_CHANGE",
                TriggeredAlert.triggered_at >= datetime.combine(snap_date, datetime.min.time()),
            )
            .all()
        }

        for item in ativos or []:
            asset_id = item.get("id")
            if not asset_id:
                continue
            row = existing_map.get(asset_id)
            if row is None:
                row = SignalSnapshot(user_id=user_id, asset_id=asset_id, date=snap_date)
                session.add(row)
                existing_map[asset_id] = row
            ticker = str(item.get("ticker", ""))
            new_score = int(item.get("score") or 0)
            new_status = str(item.get("status") or "NEUTRO")
            new_rec = str(item.get("recomendacao") or "")
            new_price = Decimal(str(item.get("preco_atual") or 0))

            row.ticker = ticker
            row.score = new_score
            row.status = new_status
            row.recomendacao = new_rec
            row.preco = new_price
            row.mg_graham = Decimal(str(item.get("mg_graham") or 0))
            row.mg_bazin = Decimal(str(item.get("mg_bazin") or 0))
            row.p_vp = Decimal(str(item.get("p_vp") or 0))
            row.quality_score = int(item.get("quality_score")) if item.get("quality_score") is not None else None

            prev_status = prev_status_by_asset.get(asset_id)
            if prev_status and prev_status != new_status and ticker and ticker not in notified_today:
                session.add(
                    TriggeredAlert(
                        ticker=ticker,
                        condition="SIGNAL_CHANGE",
                        target_price=new_price,
                        current_price=new_price,
                        note=f"Mudança de sinal: {prev_status} → {new_status} ({new_rec}, score {new_score})",
                        triggered_at=datetime.now(),
                        is_notified=False,
                    )
                )
                notified_today.add(ticker)

    def _backup_database(self):
        try:
            backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
            db_path = os.environ.get("DATABASE_PATH", "/app/data/assetflow.db")
            if not os.path.exists(backup_dir): 
                os.makedirs(backup_dir)
            filename = f"assetflow_backup_{date.today()}.db"
            dest = os.path.join(backup_dir, filename)
            with sqlite3.connect(db_path) as src_conn, sqlite3.connect(dest) as dst_conn:
                src_conn.backup(dst_conn)
        except Exception as e: 
            logging.error(f"❌ Falha automática ao gerar backup físico do banco: {e}")

    def take_daily_snapshot(self):
        logging.info("📸 JOB: Computando snapshot patrimonial diário para todos os usuários...")
        # Resolve dashboard payloads before opening the write transaction because get_dashboard_data()
        # closes its own scoped_session context, which would roll back uncommitted adds in a shared thread.
        with Session() as read_session:
            from db.models import User
            user_ids = [u.id for u in read_session.query(User).all()]

        dash_by_user = []
        for uid in user_ids:
            self.current_user_id = uid
            dash_by_user.append((uid, self.get_dashboard_data()))

        with Session() as session:
            try:
                today = date.today()
                for uid, dash in dash_by_user:
                    resumo = dash.get('resumo') or {}
                    total_equity = Decimal(str(resumo.get('Total', 0)))
                    total_invested = Decimal(str(resumo.get('TotalInvestido', 0)))

                    breakdown = {
                        item['name']: float(item.get('value', 0))
                        for item in (dash.get('grafico') or [])
                        if isinstance(item, dict) and 'name' in item
                    }
                    breakdown_str = json.dumps(breakdown)

                    existing = session.query(PortfolioSnapshot).filter_by(user_id=uid).filter(PortfolioSnapshot.date == today).first()
                    if existing:
                        existing.total_equity = total_equity
                        existing.total_invested = total_invested
                        existing.profit = total_equity - total_invested
                        existing.breakdown = breakdown_str
                    else:
                        snap = PortfolioSnapshot(user_id=uid, date=today, total_equity=total_equity, total_invested=total_invested, profit=total_equity-total_invested, breakdown=breakdown_str)
                        session.add(snap)
                    if dash.get('ativos'):
                        self._upsert_signal_snapshots(session, uid, dash.get('ativos'), today)
                safe_commit(session)
                self._backup_database()
            except IntegrityError:
                session.rollback()
                logging.warning("⚠️ Concorrência ao salvar snapshot diário; aplicando upsert nos registros existentes.")
                try:
                    today = date.today()
                    for uid, dash in dash_by_user:
                        resumo = dash.get('resumo') or {}
                        total_equity = Decimal(str(resumo.get('Total', 0)))
                        total_invested = Decimal(str(resumo.get('TotalInvestido', 0)))
                        breakdown = {
                            item['name']: float(item.get('value', 0))
                            for item in (dash.get('grafico') or [])
                            if isinstance(item, dict) and 'name' in item
                        }
                        existing = session.query(PortfolioSnapshot).filter_by(user_id=uid, date=today).first()
                        if existing:
                            existing.total_equity = total_equity
                            existing.total_invested = total_invested
                            existing.profit = total_equity - total_invested
                            existing.breakdown = json.dumps(breakdown)
                        else:
                            session.add(PortfolioSnapshot(user_id=uid, date=today, total_equity=total_equity, total_invested=total_invested, profit=total_equity-total_invested, breakdown=json.dumps(breakdown)))
                        if dash.get('ativos'):
                            self._upsert_signal_snapshots(session, uid, dash.get('ativos'), today)
                    safe_commit(session)
                except Exception as inner_err:
                    session.rollback()
                    logging.error(f"❌ Erro no fallback upsert de snapshot diário: {inner_err}")
            except Exception as e:
                session.rollback()
                logging.error(f"❌ Erro ao salvar snapshot diário: {e}")

    def get_history_data(self, full: bool = False):
        user_id = self.current_user_id
        with Session() as session:
            snapshots = (
                session.query(
                    PortfolioSnapshot.date,
                    PortfolioSnapshot.total_equity,
                    PortfolioSnapshot.total_invested,
                    PortfolioSnapshot.profit,
                    PortfolioSnapshot.breakdown,
                )
                .filter_by(user_id=user_id)
                .order_by(PortfolioSnapshot.date)
                .all()
            )
            history = []
            if not snapshots:
                return history
                
            # --- Encontra o breakdown mais recente válido para proporções retroativas ---
            latest_breakdown = {}
            for s in reversed(snapshots):
                if s.breakdown:
                    try:
                        latest_breakdown = json.loads(s.breakdown)
                        if latest_breakdown:
                            break
                    except Exception as e:
                        logging.warning(f"Failed to parse breakdown for history: {e}")
            
            latest_total = sum(latest_breakdown.values()) if latest_breakdown else 0
            fractions = {k: v / latest_total for k, v in latest_breakdown.items()} if latest_total > 0 else {}

            # Downsample antes do json.loads(s.breakdown) para evitar parse nos ~2000 pontos descartados
            if full or len(snapshots) <= 400:
                selected_snapshots = snapshots
            else:
                recent_keep = 260
                older = snapshots[:-recent_keep]
                recent = snapshots[-recent_keep:]
                if len(older) <= 140:
                    selected_snapshots = snapshots
                else:
                    bucket_count = 69
                    body = older[1:]
                    bucket_size = len(body) / bucket_count
                    sampled = [older[0]]
                    for b in range(bucket_count):
                        s_idx = int(b * bucket_size)
                        e_idx = min(len(body), int((b + 1) * bucket_size))
                        if s_idx >= e_idx:
                            continue
                        min_i = s_idx
                        max_i = s_idx
                        for idx in range(s_idx + 1, e_idx):
                            v = float(body[idx].total_equity or 0)
                            if v < float(body[min_i].total_equity or 0):
                                min_i = idx
                            if v > float(body[max_i].total_equity or 0):
                                max_i = idx
                        if min_i == max_i:
                            sampled.append(body[min_i])
                        elif min_i < max_i:
                            sampled.extend([body[min_i], body[max_i]])
                        else:
                            sampled.extend([body[max_i], body[min_i]])
                    selected_snapshots = sampled + recent

            for s in selected_snapshots:
                item = {
                    "date": s.date.strftime("%d/%m/%y"), 
                    "Patrimônio": float(s.total_equity or 0),
                    "Investido": float(s.total_invested or 0),
                    "Lucro": float(s.profit or 0)
                }
                
                has_valid_bd = False
                if s.breakdown:
                    try:
                        bd = json.loads(s.breakdown)
                        if bd:
                            item.update(bd)
                            has_valid_bd = True
                    except Exception as e:
                        logging.warning(f"Failed to parse breakdown for item: {e}")
                
                if not has_valid_bd and fractions and item["Patrimônio"] > 0:
                    for k, frac in fractions.items():
                        item[k] = round(item["Patrimônio"] * frac, 2)
                        
                history.append(item)

            return history
