# server/services_modules/backup.py
import logging
import os
import shutil
from datetime import date
from decimal import Decimal
from typing import List, Dict, Any
from sqlalchemy.orm import joinedload
from db.models import Position, Asset, PortfolioSnapshot, Category, safe_commit
from db.session import Session
from utils.formatters import extract_position_metrics
import json

class BackupService:
    def _backup_database(self):
        try:
            backup_dir = os.environ.get("BACKUP_DIR", "/app/backups")
            db_path = os.environ.get("DATABASE_PATH", "/app/data/assetflow.db")
            if not os.path.exists(backup_dir): 
                os.makedirs(backup_dir)
            filename = f"assetflow_backup_{date.today()}.db"
            dest = os.path.join(backup_dir, filename)
            shutil.copy(db_path, dest)
        except Exception as e: 
            logging.error(f"❌ Falha automática ao gerar backup físico do banco: {e}")

    def take_daily_snapshot(self):
        logging.info("📸 JOB: Computando snapshot patrimonial diário para todos os usuários...")
        with Session() as session:
            try:
                from db.models import User
                users = session.query(User).all()
                for user in users:
                    self.current_user_id = user.id
                    dash = self.get_dashboard_data()
                    
                    total_equity = Decimal(str(dash.get('totalPatrimonio', 0)))
                    total_invested = Decimal(str(dash.get('totalInvestido', 0)))
                    
                    # Convert breakdown floats back to float (dash.categories returns a dict {str: value})
                    breakdown = {k: float(v) for k, v in dash.get('categories', {}).items()}
                    breakdown_str = json.dumps(breakdown)
                    
                    today = date.today()
                    existing = session.query(PortfolioSnapshot).filter_by(user_id=user.id).filter(PortfolioSnapshot.date == today).first()
                    if existing:
                        existing.total_equity = total_equity
                        existing.total_invested = total_invested
                        existing.profit = total_equity - total_invested
                        existing.breakdown = breakdown_str
                    else:
                        snap = PortfolioSnapshot(user_id=user.id, date=today, total_equity=total_equity, total_invested=total_invested, profit=total_equity-total_invested, breakdown=breakdown_str)
                        session.add(snap)
                safe_commit(session)
                self._backup_database()
            except Exception as e: 
                session.rollback()
                logging.error(f"❌ Erro ao salvar snapshot diário: {e}")

    def get_history_data(self):
        user_id = self.current_user_id
        with Session() as session:
            snapshots = session.query(PortfolioSnapshot).filter_by(user_id=user_id).order_by(PortfolioSnapshot.date).all()
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
                    except:
                        pass
            
            latest_total = sum(latest_breakdown.values()) if latest_breakdown else 0
            fractions = {k: v / latest_total for k, v in latest_breakdown.items()} if latest_total > 0 else {}

            first_date = snapshots[0].date
            for s in snapshots:
                days_elapsed = (s.date - first_date).days
                years_elapsed = days_elapsed / 365.25
                benchmark_val = Decimal(str(s.total_invested or 0)) * Decimal(str(1.105 ** years_elapsed))
                
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
                    except:
                        pass
                
                if not has_valid_bd and fractions and item["Patrimônio"] > 0:
                    for k, frac in fractions.items():
                        item[k] = round(item["Patrimônio"] * frac, 2)
                        
                history.append(item)
            return history
