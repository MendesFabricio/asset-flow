# server/routes/fixed_income.py
from flask import Blueprint, jsonify, request, g
from database.models import Session, Asset, Position, Category, FixedIncome, safe_commit
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import joinedload
from schemas import FixedIncomeCreate

fixed_income_bp = Blueprint('fixed_income', __name__)

def calculate_fixed_income_metrics(fi, quantity, average_price):
    now = datetime.now()
    days_elapsed = max(0, (now - fi.issue_date).days)
    total_days = max(1, (fi.due_date - fi.issue_date).days)
    
    # IR Regressivo
    if days_elapsed <= 180:
        tax_rate = Decimal('22.5')
    elif days_elapsed <= 360:
        tax_rate = Decimal('20.0')
    elif days_elapsed <= 720:
        tax_rate = Decimal('17.5')
    else:
        tax_rate = Decimal('15.0')
        
    total_invested = Decimal(str(quantity)) * Decimal(str(average_price))
    
    # CDI de referência aproximado (ex: 10.40% a.a.)
    cdi_ref = Decimal('0.1040')
    
    interest_rate_dec = Decimal(str(fi.interest_rate)) / Decimal('100.0')
    
    # Rentabilidade bruta acumulada estimada
    if fi.index_type == 'PRE':
        rate_acrued = (Decimal('1.0') + interest_rate_dec) ** (Decimal(str(days_elapsed)) / Decimal('365.0'))
    elif fi.index_type == 'CDI':
        # ex: 110% do CDI -> interest_rate = 110
        cdi_interest = (interest_rate_dec * Decimal('100.0')) * cdi_ref / Decimal('100.0')
        rate_acrued = (Decimal('1.0') + cdi_interest) ** (Decimal(str(days_elapsed)) / Decimal('365.0'))
    elif fi.index_type == 'IPCA':
        # IPCA médio aproximado (ex: 4.5% a.a.) + taxa adicional
        ipca_ref = Decimal('0.0450')
        total_rate = ipca_ref + interest_rate_dec
        rate_acrued = (Decimal('1.0') + total_rate) ** (Decimal(str(days_elapsed)) / Decimal('365.0'))
    else:
        rate_acrued = Decimal('1.0')
        
    gross_value = total_invested * rate_acrued
    gross_profit = max(Decimal('0.0'), gross_value - total_invested)
    tax_value = gross_profit * (tax_rate / Decimal('100.0'))
    net_value = gross_value - tax_value
    net_profit = net_value - total_invested
    
    return {
        "days_elapsed": days_elapsed,
        "total_days": total_days,
        "tax_rate": float(tax_rate),
        "total_invested": float(total_invested),
        "gross_value": float(gross_value),
        "gross_profit": float(gross_profit),
        "tax_value": float(tax_value),
        "net_value": float(net_value),
        "net_profit": float(net_profit)
    }

@fixed_income_bp.route('/api/fixed-income', methods=['GET', 'POST'])
def handle_fixed_income():
    with Session() as db:
        if request.method == 'POST':
            try:
                body = FixedIncomeCreate(**request.json or {})
            except Exception as e:
                return jsonify({"status": "Erro", "msg": str(e)}), 400

            ticker = body.ticker.strip().upper()
            name = body.name.strip()
            index_type = body.index_type.strip().upper()
            interest_rate = Decimal(str(body.interest_rate))
            quantity = Decimal(str(body.quantity))
            average_price = Decimal(str(body.average_price))
                
            # Verifica ou cria Categoria 'Renda Fixa'
            cat = db.query(Category).filter_by(name='Renda Fixa').first()
            if not cat:
                cat = Category(name='Renda Fixa', target_percent=Decimal('20.0'))
                db.add(cat)
                db.flush()
                
            # Verifica ou cria Asset
            asset = db.query(Asset).filter_by(ticker=ticker, user_id=g.user_id).first()
            if not asset:
                asset = Asset(ticker=ticker, name=name, category_id=cat.id, currency="BRL", user_id=g.user_id)
                db.add(asset)
                db.flush()
                
            # Verifica ou cria Position
            pos = db.query(Position).filter_by(asset_id=asset.id, user_id=g.user_id).first()
            if not pos:
                pos = Position(asset_id=asset.id, user_id=g.user_id)
                db.add(pos)
                
            pos.quantity = quantity
            pos.average_price = average_price
            
            # Cria ou atualiza FixedIncome
            fi = db.query(FixedIncome).filter_by(asset_id=asset.id, user_id=g.user_id).first()
            if not fi:
                fi = FixedIncome(asset_id=asset.id, user_id=g.user_id)
                db.add(fi)
                
            fi.index_type = index_type
            fi.interest_rate = interest_rate
            fi.issue_date = issue_date
            fi.due_date = due_date
            fi.is_deleted = False
            
            safe_commit(db)
            return jsonify({"msg": "Título de Renda Fixa cadastrado com sucesso!"}), 201
            
        # GET
        fixed_assets = (
            db.query(FixedIncome)
            .join(Asset)
            .join(Position)
            .options(joinedload(FixedIncome.asset).joinedload(Asset.position))
            .filter(FixedIncome.is_deleted == False, FixedIncome.user_id == g.user_id)
            .all()
        )
        
        res_list = []
        for fi in fixed_assets:
            pos = fi.asset.position
            qty = pos.quantity if pos else Decimal('0')
            pm = pos.average_price if pos else Decimal('0')
            metrics = calculate_fixed_income_metrics(fi, qty, pm)
            
            res_list.append({
                "id": fi.id,
                "ticker": fi.asset.ticker,
                "name": fi.asset.name,
                "index_type": fi.index_type,
                "interest_rate": float(fi.interest_rate),
                "issue_date": fi.issue_date.isoformat(),
                "due_date": fi.due_date.isoformat(),
                "quantity": float(qty),
                "average_price": float(pm),
                **metrics
            })
            
        return jsonify(res_list)

@fixed_income_bp.route('/api/fixed-income/<int:id>', methods=['PUT', 'DELETE'])
def handle_single_fixed_income(id):
    with Session() as db:
        fi = db.query(FixedIncome).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not fi:
            return jsonify({"status": "Erro", "msg": "Título de Renda Fixa não encontrado"}), 404
            
        if request.method == 'DELETE':
            fi.is_deleted = True
            # Também zera a posição vinculada
            pos = db.query(Position).filter_by(asset_id=fi.asset_id, user_id=g.user_id).first()
            if pos:
                pos.quantity = Decimal('0.0')
            safe_commit(db)
            return jsonify({"msg": "Título excluído com sucesso!"})
            
        # PUT
        data = request.json or {}
        fi.index_type = data.get('index_type', fi.index_type).strip().upper()
        try:
            fi.interest_rate = Decimal(str(data.get('interest_rate', fi.interest_rate)))
            fi.issue_date = datetime.fromisoformat(data.get('issue_date', fi.issue_date.isoformat()).replace('Z', ''))
            fi.due_date = datetime.fromisoformat(data.get('due_date', fi.due_date.isoformat()).replace('Z', ''))
            
            # Atualiza quantidade e preço médio na posição
            pos = db.query(Position).filter_by(asset_id=fi.asset_id, user_id=g.user_id).first()
            if pos:
                pos.quantity = Decimal(str(data.get('quantity', pos.quantity)))
                pos.average_price = Decimal(str(data.get('average_price', pos.average_price)))
        except Exception:
            return jsonify({"status": "Erro", "msg": "Valores numéricos ou datas inválidas"}), 400
            
        safe_commit(db)
        return jsonify({"msg": "Título atualizado com sucesso!"})
