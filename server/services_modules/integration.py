# server/services_modules/integration.py
import logging
import yfinance as yf
from datetime import datetime, timedelta
from database.models import Position, Dividend, safe_commit
from database.session import Session
from utils.ticker_helper import to_yf_ticker
import infrastructure.market_data as _market

class IntegrationService:
    def update_prices(self):
        session = Session()
        try:
            _market.update_prices(session, self._invalidate_price_cache)
        finally:
            Session.remove()

    def record_confirmed_dividends(self):
        logging.info("📅 [SERVICE] Iniciando verificação automática de novos dividendos...")
        session = Session()
        positions_info = []
        try:
            positions = session.query(Position).filter(Position.quantity > 0).all()
            for pos in positions:
                positions_info.append({
                    "asset_id": pos.asset_id,
                    "ticker": pos.asset.ticker,
                    "category_name": pos.asset.category.name if pos.asset.category else '',
                    "quantity": float(pos.quantity)
                })
        finally:
            Session.remove()

        today = datetime.now().date()
        for pos_item in positions_info:
            ticker_raw = pos_item["ticker"]
            asset_id = pos_item["asset_id"]
            qty = pos_item["quantity"]
            category_name = pos_item["category_name"]
            
            ticker_yahoo = to_yf_ticker(ticker_raw, category_name)
            try:
                stock = yf.Ticker(ticker_yahoo)
                divs = stock.dividends
                if not divs.empty:
                    cutoff = today - timedelta(days=180)
                    recent_divs = divs[divs.index.date >= cutoff]
                    for date_com_dt, value in recent_divs.items():
                        date_com = date_com_dt.date()
                        
                        # Abre sessão atômica curta e isolada apenas para dar o INSERT/COMMIT
                        session = Session()
                        try:
                            exists = session.query(Dividend).filter_by(
                                asset_id=asset_id,
                                date_com=date_com
                            ).first()
                            
                            if not exists:
                                total = float(value) * qty
                                new_div = Dividend(
                                    asset_id=asset_id,
                                    date_com=date_com,
                                    date_payment=date_com + timedelta(days=15),
                                    value_per_share=float(value),
                                    quantity_at_date=qty,
                                    total_value=total,
                                    status="PAGO" if date_com < today else "A RECEBER"
                                )
                                session.add(new_div)
                                logging.info(f"🆕 Novo dividendo registrado para {ticker_raw}: R$ {value:.4f} em {date_com}")
                                safe_commit(session)
                        finally:
                            session.close()
            except Exception as ex:
                logging.warning(f"Erro ao verificar dividendos de {ticker_raw}: {ex}")
        return True

    def validate_ticker_on_yahoo(self, ticker):
        return _market.validate_ticker_on_yahoo(ticker)
        
    def sync_reports_with_fnet(self):
        session = Session()
        try:
            return _market.sync_reports_with_fnet(session)
        finally:
            Session.remove()

    def update_fundamentals(self, state_dict=None):
        return _market.update_fundamentals(self.get_usd_rate, state_dict)
