# server/services_modules/portfolio.py
import logging
from datetime import datetime
from decimal import Decimal
from database.models import Position, Asset, MarketData, Category, safe_commit
from database.session import Session

class PortfolioCrudService:
    def update_position(self, ticker, qtd, pm, meta, dy=0, lpa=0, vpa=0, current_price=None):
        logging.info(f"📝 JOB: Recebendo atualização de {ticker} -> Qtd: {qtd}, PM: {pm}, Meta: {meta}%")
        user_id = self.current_user_id
        with Session() as session:
            try:
                asset = session.query(Asset).filter_by(ticker=ticker).first()
                if not asset: 
                    raise ValueError(f"Ativo {ticker} não encontrado")
                
                pos = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                if not pos:
                    pos = Position(asset_id=asset.id, user_id=user_id)
                    session.add(pos)
                
                pos.quantity = Decimal(str(qtd)) 
                pos.average_price = Decimal(str(pm))
                pos.target_percent = Decimal(str(meta))
                
                pos.manual_dy = Decimal(str(dy or 0))
                pos.manual_lpa = Decimal(str(lpa or 0))
                pos.manual_vpa = Decimal(str(vpa or 0))
                
                if current_price is not None and str(current_price).strip() != "":
                    mdata = session.query(MarketData).filter_by(asset_id=asset.id).first()
                    if not mdata:
                        mdata = MarketData(asset_id=asset.id)
                        session.add(mdata)
                    
                    mdata.price = Decimal(str(current_price))
                    mdata.date = datetime.now()
                    mdata.min_6m = Decimal(str(current_price)) 
                    
                self._invalidate_quant_cache(session)
                safe_commit(session)
                logging.info(f"   ✅ Sucesso: {ticker} (Quantity: {pos.quantity}) persistido com sucesso.")
                return "Dados e Preço Atualizados!"
                
            except Exception as e:
                session.rollback()
                logging.error(f"❌ Falha ao atualizar posição de {ticker}: {e}")
                raise
        
    def add_new_asset(self, ticker, category_name, qtd, pm, meta=0):
        ticker = ticker.upper().strip().replace(".SA", "")
        is_intl = category_name == "Internacional" or ticker.endswith("-USD")
        currency = "USD" if is_intl else "BRL" 
        user_id = self.current_user_id
        logging.info(f"🆕 JOB: Mapeando inclusão de novo ativo: {ticker}")
        with Session() as session:
            try:
                asset = session.query(Asset).filter_by(ticker=ticker).first()
                if not asset:
                    category = session.query(Category).filter_by(name=category_name).first()
                    if not category: 
                        category = session.query(Category).first()
                    
                    asset = Asset(ticker=ticker, category_id=category.id, currency=currency)
                    session.add(asset)
                    session.flush() 
                
                exists = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                if exists: 
                    raise ValueError("Ativo já existe na sua carteira!")
                
                pos = Position(
                    asset_id=asset.id, 
                    user_id=user_id,
                    quantity=Decimal(str(qtd)), 
                    average_price=Decimal(str(pm)),
                    target_percent=Decimal(str(meta)) 
                )
                session.add(pos)
                
                self._invalidate_quant_cache(session)
                safe_commit(session)
                return f"Ativo {ticker} criado com sucesso na carteira!"
            except Exception as e:
                session.rollback()
                logging.error(f"❌ Falha ao injetar novo ativo no ecossistema: {e}")
                raise

    def delete_asset(self, asset_id):
        user_id = self.current_user_id
        with Session() as session:
            try:
                pos = session.query(Position).filter_by(asset_id=asset_id, user_id=user_id).first()
                if not pos: 
                    raise ValueError("Ativo não encontrado na carteira")
                
                session.delete(pos)
                # O banco já cuida de deletar os históricos atrelados ao Position se houvesse relation delete-orphan em position
                # Mas para garantir, limpamos caso exista algo avulso:
                # Não deletamos MarketData nem o Asset, pois pertencem à base Global!
                self._invalidate_quant_cache(session)
                safe_commit(session)
                return "Ativo removido da sua carteira!"
            except Exception:
                session.rollback()
                raise
