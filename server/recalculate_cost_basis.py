import os
import sys
from decimal import Decimal
import math

# Adicionar a pasta server ao sys.path para conseguir importar os módulos do app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))

from db.session import Session
from db.models import AssetTransaction, Position

def run():
    print("Starting retroactive cost_basis calculation for SELL transactions...")
    with Session() as session:
        positions = session.query(Position).all()
        
        for pos in positions:
            transactions = session.query(AssetTransaction).filter_by(
                position_id=pos.id
            ).order_by(AssetTransaction.transaction_date.asc(), AssetTransaction.id.asc()).all()
            
            running_qty = Decimal("0.0")
            running_pm = Decimal("0.0")
            
            for tx in transactions:
                # Tratar os tipos de transação
                if tx.type == "BUY":
                    qty_dec = tx.quantity
                    price_dec = tx.unit_price
                    total_value = tx.total_value
                    
                    new_qty = running_qty + qty_dec
                    if new_qty > 0:
                        running_pm = ((running_qty * running_pm) + total_value) / new_qty
                    running_qty = new_qty
                    
                elif tx.type == "SELL":
                    # Definir o cost_basis da venda como o PM atual!
                    tx.cost_basis = running_pm
                    
                    qty_dec = tx.quantity
                    running_qty -= qty_dec
                    if running_qty <= 0:
                        running_qty = Decimal("0.0")
                        running_pm = Decimal("0.0")
                        
                elif tx.type in ["SPLIT", "INPLIT", "BONUS", "AMORTIZATION"]:
                    # Durante esses eventos corporativos, salvamos a nova quantidade e novo PM na transação
                    running_qty = tx.quantity
                    running_pm = tx.unit_price
                    
                elif tx.type == "CHANGE_TICKER":
                    pass

        session.commit()
        print("Finished calculation and committed to database.")

if __name__ == "__main__":
    run()
