import re

with open('server/services_modules/portfolio.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_func = '''    def add_corporate_action(self, ticker, action_type, payload):
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
                    raise ValueError(f"Evento {action_type} desconhecido")'''

pattern = re.compile(r'    def add_corporate_action\(self, ticker, action_type, payload\):.*?                else:\n                    raise ValueError\(f"Evento \{action_type\} desconhecido"\)', re.DOTALL)
if pattern.search(content):
    content = pattern.sub(new_func, content)
    with open('server/services_modules/portfolio.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully')
else:
    print('Pattern not found')
