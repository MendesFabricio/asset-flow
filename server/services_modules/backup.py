# server/services_modules/backup.py
import logging
import os
import shutil
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import joinedload
from database.models import Position, Asset, PortfolioSnapshot, safe_commit
from database.session import Session

class BackupService:
    def _backup_database(self):
        try:
            backup_dir = '/app/backups'
            if not os.path.exists(backup_dir): 
                os.makedirs(backup_dir)
            filename = f"assetflow_backup_{date.today()}.db"
            dest = os.path.join(backup_dir, filename)
            shutil.copy('/app/data/assetflow.db', dest)
        except Exception as e: 
            logging.error(f"❌ Falha automática ao gerar backup físico do banco: {e}")

    def take_daily_snapshot(self):
        logging.info("📸 JOB: Computando snapshot patrimonial diário...")
        session = Session()
        try:
            positions = (
                session.query(Position)
                .options(joinedload(Position.asset).selectinload(Asset.market_data))
                .all()
            )
            total_equity = Decimal('0.0')
            total_invested = Decimal('0.0')
            dolar_rate = self.get_usd_rate()
            for pos in positions:
                asset = pos.asset
                if not asset: 
                    continue 
                
                mdata = asset.market_data[0] if asset.market_data else None
                try:
                    price = Decimal(str(mdata.price)) if (mdata and mdata.price) else Decimal(str(pos.average_price or 0))
                    qtd = Decimal(str(pos.quantity or 0))
                    pm = Decimal(str(pos.average_price or 0))
                except Exception as parse_err: 
                    price = Decimal('0.0')
                    qtd = Decimal('0.0')
                    pm = Decimal('0.0')
                    logging.debug(f"Erro ao converter valores de posição para Decimal: {parse_err}")
                fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
                total_equity += (qtd * price * fator)
                total_invested += (qtd * pm * fator)
            
            today = date.today()
            existing = session.query(PortfolioSnapshot).filter(PortfolioSnapshot.date == today).first()
            if existing:
                existing.total_equity = total_equity
                existing.total_invested = total_invested
                existing.profit = total_equity - total_invested
            else:
                snap = PortfolioSnapshot(date=today, total_equity=total_equity, total_invested=total_invested, profit=total_equity-total_invested)
                session.add(snap)
            safe_commit(session)
            self._backup_database()
        except Exception as e: 
            session.rollback()
            logging.error(f"❌ Erro ao salvar snapshot diário: {e}")
        finally: 
            Session.remove()

    def get_history_data(self):
        session = Session()
        try:
            snapshots = session.query(PortfolioSnapshot).order_by(PortfolioSnapshot.date).all()
            history = []
            if not snapshots:
                return history
                
            first_date = snapshots[0].date
            for s in snapshots:
                days_elapsed = (s.date - first_date).days
                years_elapsed = days_elapsed / 365.25
                benchmark_val = Decimal(str(s.total_invested or 0)) * Decimal(str(1.105 ** years_elapsed))
                
                history.append({
                    "date": s.date.strftime("%d/%m"), 
                    "Patrimônio": float(s.total_equity or 0),
                    "Investido": float(s.total_invested or 0),
                    "Lucro": float(s.profit or 0),
                    "IPCA_6": float(round(benchmark_val, 2))
                })
            return history
        finally: 
            Session.remove()
