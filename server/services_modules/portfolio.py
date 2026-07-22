# server/services_modules/portfolio.py
import logging
from datetime import datetime
from decimal import Decimal
from db.models import Position, Asset, MarketData, Category, safe_commit
from db.session import Session

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

    def add_transaction(self, ticker, tx_type, quantity, unit_price, date=None, category=None, force_duplicate=False):
        from db.models import AssetTransaction
        user_id = self.current_user_id
        with Session() as session:
            try:
                asset = session.query(Asset).filter_by(ticker=ticker).first()
                if not asset:
                    # Validate ticker existence using yfinance before auto-creating
                    import yfinance as yf
                    from utils.ticker_helper import to_yf_ticker
                    
                    yf_ticker = to_yf_ticker(ticker, category or "Ação")
                    try:
                        ticker_info = yf.Ticker(yf_ticker).fast_info
                        # Access a lazy property to trigger the network request
                        _ = ticker_info['lastPrice']
                    except Exception as e:
                        logging.warning(f"⚠️ Ativo {ticker} ({yf_ticker}) não retornado pelo Yahoo Finance, criando como cadastro manual: {e}")

                    # Auto-cria o ativo caso ele não exista no banco global
                    from db.models import Category
                    
                    if category:
                        cat_name = category
                    else:
                        # Fallback heurística para descobrir categoria baseada no ticker caso não venha
                        cat_name = "Ação"
                        t = ticker.upper()
                        if t.endswith("34") or t.endswith("39"):
                            cat_name = "Internacional"
                        elif t.endswith("11"):
                            if t in ["KLBN11", "TAEE11", "SANB11", "BPAC11", "ALUP11", "ENGI11", "SULA11"]:
                                cat_name = "Ação"
                            elif t in ["B5P211", "LFTS11", "KDIF11"]:
                                cat_name = "Renda Fixa"
                            else:
                                cat_name = "FII"
                        elif t.endswith("3") or t.endswith("4") or t.endswith("5") or t.endswith("6"):
                            cat_name = "Ação"

                    category = session.query(Category).filter_by(name=cat_name).first()
                    if not category:
                        category = session.query(Category).first()
                        
                    asset = Asset(ticker=ticker, category_id=category.id, currency="BRL")
                    session.add(asset)
                    session.flush()
                
                pos = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                if not pos:
                    if tx_type == "SELL":
                        raise ValueError(f"Posição para {ticker} não encontrada para realizar venda")
                    # Auto-cria a posição zerada na carteira do usuário
                    pos = Position(
                        asset_id=asset.id, 
                        user_id=user_id,
                        quantity=Decimal("0.0"),
                        average_price=Decimal("0.0"),
                        target_percent=Decimal("0.0")
                    )
                    session.add(pos)
                    session.flush()

                qty_dec = Decimal(str(quantity))
                price_dec = Decimal(str(unit_price))
                total_value = qty_dec * price_dec
                
                tx_date = datetime.fromisoformat(date.replace("Z", "+00:00")) if date else datetime.now()

                # Duplicate Check
                if not force_duplicate:
                    from sqlalchemy import func
                    duplicate = session.query(AssetTransaction).filter_by(
                        position_id=pos.id,
                        user_id=user_id,
                        type=tx_type,
                        quantity=qty_dec,
                        unit_price=price_dec
                    ).filter(
                        # compare only date part to avoid time issues
                        func.date(AssetTransaction.transaction_date) == tx_date.date()
                    ).first()
                    
                    if duplicate:
                        raise ValueError(f"DUPLICATE_ERROR: Transação idêntica já existe neste dia.")

                cost_basis = None
                if tx_type == "BUY":
                    new_qty = pos.quantity + qty_dec
                    new_pm = ((pos.quantity * pos.average_price) + total_value) / new_qty
                    pos.quantity = new_qty
                    pos.average_price = new_pm
                elif tx_type == "SELL":
                    if pos.quantity < qty_dec:
                        raise ValueError("Quantidade de venda maior que a posição atual")
                    cost_basis = pos.average_price
                    new_qty = pos.quantity - qty_dec
                    pos.quantity = new_qty
                    if new_qty == 0:
                        pos.average_price = Decimal("0.0")
                else:
                    raise ValueError(f"Tipo de transação inválido: {tx_type}")

                # tx_date is already computed above
                
                transaction = AssetTransaction(
                    position_id=pos.id,
                    user_id=user_id,
                    ticker=ticker,
                    type=tx_type,
                    quantity=qty_dec,
                    unit_price=price_dec,
                    total_value=total_value,
                    cost_basis=cost_basis,
                    transaction_date=tx_date
                )
                session.add(transaction)
                
                self._invalidate_quant_cache(session)
                safe_commit(session)
                return f"Transação de {tx_type} registrada com sucesso!"
            except Exception as e:
                session.rollback()
                logging.error(f"❌ Falha ao adicionar transação para {ticker}: {e}")
                raise

    def get_transaction_history(self, ticker):
        from db.models import AssetTransaction
        user_id = self.current_user_id
        with Session() as session:
            try:
                asset = session.query(Asset).filter_by(ticker=ticker).first()
                if not asset:
                    return []
                
                pos = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                if not pos:
                    return []

                transactions = session.query(AssetTransaction).filter_by(position_id=pos.id, user_id=user_id).order_by(AssetTransaction.transaction_date.desc()).all()
                return [
                    {
                        "id": t.id,
                        "type": t.type,
                        "quantity": float(t.quantity),
                        "unit_price": float(t.unit_price),
                        "total_value": float(t.total_value),
                        "date": t.transaction_date.isoformat()
                    } for t in transactions
                ]
            except Exception:
                return []
                
    def get_all_transactions_history(self):
        from db.models import AssetTransaction
        user_id = self.current_user_id
        with Session() as session:
            txs = session.query(AssetTransaction).filter_by(user_id=user_id).order_by(AssetTransaction.transaction_date.desc()).all()
            return [
                    {
                        "id": t.id,
                        "ticker": t.position.asset.ticker if t.position and t.position.asset else "",
                        "type": t.type,
                        "quantity": float(t.quantity),
                        "unit_price": float(t.unit_price),
                        "total_value": float(t.total_value),
                        "date": t.transaction_date.isoformat()
                    } for t in txs
                ]

    def add_corporate_action(self, ticker, action_type, payload):
        from db.models import AssetTransaction, Category, CorporateEvent
        import math
        user_id = self.current_user_id
        with Session() as session:
            try:
                asset = session.query(Asset).filter_by(ticker=ticker).first()
                if not asset:
                    raise ValueError(f"Ativo {ticker} não encontrado")
                
                pos = session.query(Position).filter_by(asset_id=asset.id, user_id=user_id).first()
                if not pos:
                    raise ValueError(f"Posição para {ticker} não encontrada")
                
                date_str = payload.get("date")
                tx_date = datetime.fromisoformat(date_str.replace("Z", "+00:00")) if date_str else datetime.now()
                auction_value = Decimal(str(payload.get("auction_value") or 0.0))
                
                corp_event = CorporateEvent(
                    asset_id=asset.id,
                    user_id=user_id,
                    type=action_type,
                    factor=Decimal(str(payload.get("factor", 1))) if action_type in ["SPLIT", "INPLIT", "TICKER_CHANGE"] else None,
                    percent=Decimal(str(payload.get("percent", 0))) if action_type == "BONUS" else None,
                    unit_cost=Decimal(str(payload.get("unit_cost", 0.0))) if action_type in ["BONUS", "AMORTIZATION"] else None,
                    new_ticker=payload.get("new_ticker") if action_type in ["SPIN_OFF", "TICKER_CHANGE"] else None,
                    received_qty=Decimal(str(payload.get("received_qty", 0))) if action_type == "SPIN_OFF" else None,
                    date=tx_date.date(),
                    source="MANUAL"
                )
                session.add(corp_event)
                session.flush() # obtemos corp_event.id
                
                if action_type in ["SPLIT", "INPLIT", "BONUS"]:
                    old_qty = pos.quantity
                    old_pm = pos.average_price
                    
                    if action_type == "SPLIT":
                        factor = Decimal(str(payload.get("factor", 1)))
                        new_qty = old_qty * factor
                        new_pm = old_pm / factor if factor > 0 else old_pm
                    elif action_type == "INPLIT":
                        factor = Decimal(str(payload.get("factor", 1)))
                        new_qty = old_qty / factor if factor > 0 else old_qty
                        new_pm = old_pm * factor
                    elif action_type == "BONUS":
                        percent = Decimal(str(payload.get("percent", 0)))
                        unit_cost = Decimal(str(payload.get("unit_cost", 0.0)))
                        
                        added_qty = old_qty * (percent / Decimal("100"))
                        new_qty = old_qty + added_qty
                        
                        if new_qty > 0:
                            new_pm = ((old_qty * old_pm) + (added_qty * unit_cost)) / new_qty
                        else:
                            new_pm = old_pm
                
                    # Tratar fração (venda automática)
                    fraction = new_qty - Decimal(math.floor(new_qty))
                    if fraction > 0:
                        new_qty = Decimal(math.floor(new_qty))
                        
                    transaction = AssetTransaction(
                        position_id=pos.id,
                        user_id=user_id,
                        ticker=ticker,
                        type=action_type,
                        quantity=new_qty,
                        unit_price=new_pm,
                        total_value=Decimal("0.0"),
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction)
                    
                    pos.quantity = new_qty
                    pos.average_price = new_pm
                    
                    if fraction > 0 and auction_value > 0:
                        sell_tx = AssetTransaction(
                            position_id=pos.id,
                            user_id=user_id,
                            ticker=ticker,
                            type="SELL",
                            quantity=fraction,
                            unit_price=auction_value / fraction if fraction > 0 else Decimal("0"),
                            total_value=auction_value,
                            transaction_date=tx_date,
                            corporate_event_id=corp_event.id
                        )
                        session.add(sell_tx)

                elif action_type == "SPIN_OFF":
                    new_ticker = payload.get("new_ticker")
                    received_qty = Decimal(str(payload.get("received_qty", 0)))
                    cost_percent = Decimal(str(payload.get("cost_percent", 0)))
                    
                    if not new_ticker or received_qty <= 0 or cost_percent <= 0:
                        raise ValueError("Para Cisão, informe o Ticker Recebido, Quantidade e % de Custo.")
                    
                    cost_transfer = (cost_percent / Decimal("100")) * pos.average_price
                    pos.average_price = max(Decimal("0"), pos.average_price - cost_transfer)
                    
                    transaction_orig = AssetTransaction(
                        position_id=pos.id,
                        user_id=user_id,
                        ticker=ticker,
                        type=action_type,
                        quantity=pos.quantity,
                        unit_price=pos.average_price,
                        total_value=Decimal("0.0"),
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction_orig)
                    
                    new_asset = session.query(Asset).filter_by(ticker=new_ticker).first()
                    if not new_asset:
                        new_asset = Asset(ticker=new_ticker, category_id=asset.category_id, currency="BRL")
                        session.add(new_asset)
                        session.flush()
                        
                    new_pos = session.query(Position).filter_by(asset_id=new_asset.id, user_id=user_id).first()
                    if not new_pos:
                        new_pos = Position(
                            asset_id=new_asset.id, 
                            user_id=user_id,
                            quantity=received_qty,
                            average_price=cost_transfer,
                            target_percent=Decimal("0.0")
                        )
                        session.add(new_pos)
                        session.flush()
                    else:
                        total_val = (new_pos.quantity * new_pos.average_price) + (received_qty * cost_transfer)
                        new_pos.quantity += received_qty
                        new_pos.average_price = total_val / new_pos.quantity
                        
                    transaction_new = AssetTransaction(
                        position_id=new_pos.id,
                        user_id=user_id,
                        ticker=new_ticker,
                        type="SPIN_OFF_RECEIPT",
                        quantity=received_qty,
                        unit_price=cost_transfer,
                        total_value=received_qty * cost_transfer,
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction_new)

                elif action_type == "TICKER_CHANGE":
                    new_ticker = payload.get("new_ticker")
                    factor = Decimal(str(payload.get("factor", 1)))
                    
                    if not new_ticker:
                        raise ValueError("Novo ticker é obrigatório")
                        
                    new_qty = pos.quantity * factor
                    new_pm = pos.average_price / factor if factor > 0 else pos.average_price
                    
                    transaction_out = AssetTransaction(
                        position_id=pos.id,
                        user_id=user_id,
                        ticker=ticker,
                        type="TICKER_CHANGE_OUT",
                        quantity=pos.quantity,
                        unit_price=pos.average_price,
                        total_value=pos.quantity * pos.average_price,
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction_out)
                    pos.quantity = Decimal("0.0")
                    pos.average_price = Decimal("0.0")
                    
                    new_asset = session.query(Asset).filter_by(ticker=new_ticker).first()
                    if not new_asset:
                        new_asset = Asset(ticker=new_ticker, category_id=asset.category_id, currency="BRL")
                        session.add(new_asset)
                        session.flush()
                        
                    new_pos = session.query(Position).filter_by(asset_id=new_asset.id, user_id=user_id).first()
                    if not new_pos:
                        new_pos = Position(
                            asset_id=new_asset.id, 
                            user_id=user_id,
                            quantity=new_qty,
                            average_price=new_pm,
                            target_percent=Decimal("0.0")
                        )
                        session.add(new_pos)
                        session.flush()
                    else:
                        total_val = (new_pos.quantity * new_pos.average_price) + (new_qty * new_pm)
                        new_pos.quantity += new_qty
                        new_pos.average_price = total_val / new_pos.quantity if new_pos.quantity > 0 else Decimal("0")
                        
                    transaction_in = AssetTransaction(
                        position_id=new_pos.id,
                        user_id=user_id,
                        ticker=new_ticker,
                        type="TICKER_CHANGE_IN",
                        quantity=new_qty,
                        unit_price=new_pm,
                        total_value=new_qty * new_pm,
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction_in)
                    
                elif action_type == "AMORTIZATION":
                    amortization_per_share = Decimal(str(payload.get("unit_cost", 0.0)))
                    if amortization_per_share <= 0:
                        raise ValueError("Para amortização, informe o valor amortizado por cota.")
                        
                    new_pm = max(Decimal("0.0"), pos.average_price - amortization_per_share)
                    
                    transaction_amort = AssetTransaction(
                        position_id=pos.id,
                        user_id=user_id,
                        ticker=ticker,
                        type="AMORTIZATION",
                        quantity=pos.quantity,
                        unit_price=amortization_per_share,
                        total_value=pos.quantity * amortization_per_share,
                        transaction_date=tx_date,
                        corporate_event_id=corp_event.id
                    )
                    session.add(transaction_amort)
                    
                    pos.average_price = new_pm
                    
                else:
                    raise ValueError(f"Evento {action_type} desconhecido")
                    
                self._invalidate_quant_cache(session)
                safe_commit(session)
                return "Evento Corporativo registrado com sucesso!"
            except Exception as e:
                session.rollback()
                logging.error(f"❌ Falha ao processar evento corporativo para {ticker}: {e}")
                raise
