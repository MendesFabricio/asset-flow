# server/routes/fixed_income.py
from flask import Blueprint, jsonify, request, g
from db.models import Session, Asset, Position, Category, FixedIncome, safe_commit
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import joinedload
from schemas import FixedIncomeCreate
from domain.portfolio.xirr import CDI_FALLBACK_ANNUAL, get_cdi_period_return
from domain.portfolio.attribution import FALLBACK_MONTHLY_IPCA, get_monthly_ipca_series

fixed_income_bp = Blueprint('fixed_income', __name__)


def _compound_ipca_factor(ipca_map: dict, start_dt: date, end_dt: date) -> Decimal:
    """Compõe a série mensal do IPCA pro-rata por dias corridos entre start_dt e end_dt."""
    factor = Decimal('1.0')
    y, m = start_dt.year, start_dt.month
    while (y, m) <= (end_dt.year, end_dt.month):
        month_start = date(y, m, 1)
        next_month = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
        active_days = max(0, (min(end_dt, next_month) - max(start_dt, month_start)).days)
        if active_days > 0:
            month_days = (next_month - month_start).days
            frac = Decimal(active_days) / Decimal(month_days)
            monthly_rate = Decimal(str(ipca_map.get((y, m), FALLBACK_MONTHLY_IPCA)))
            factor *= (Decimal('1.0') + monthly_rate) ** frac
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return factor


def calculate_fixed_income_metrics(fi, quantity, average_price, db=None):
    today = datetime.now().date()
    issue_dt = fi.issue_date.date() if callable(getattr(fi.issue_date, "date", None)) else fi.issue_date
    due_dt = fi.due_date.date() if callable(getattr(fi.due_date, "date", None)) else fi.due_date
    days_elapsed = max(0, (today - issue_dt).days)
    total_days = max(1, (due_dt - issue_dt).days)
    
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
    interest_rate_dec = Decimal(str(fi.interest_rate)) / Decimal('100.0')
    
    # Rentabilidade bruta acumulada
    if days_elapsed == 0:
        rate_acrued = Decimal('1.0')
    elif fi.index_type == 'PRE':
        rate_acrued = (Decimal('1.0') + interest_rate_dec) ** (Decimal(str(days_elapsed)) / Decimal('365.0'))
    elif fi.index_type == 'CDI':
        # ex: 110% do CDI -> interest_rate_dec = 1.10; BCB SGS 12 retorna % acumulado no período
        if db is not None:
            cdi_pct, _ = get_cdi_period_return(db, issue_dt, today)
            cdi_period = Decimal(str(cdi_pct)) / Decimal('100.0')
        else:
            cdi_period = (Decimal('1.0') + Decimal(str(CDI_FALLBACK_ANNUAL))) ** (
                Decimal(str(days_elapsed)) / Decimal('365.0')
            ) - Decimal('1.0')
        rate_acrued = (Decimal('1.0') + cdi_period) ** interest_rate_dec
    elif fi.index_type == 'IPCA':
        # Compõe IPCA acumulado (BCB SGS 433) com a taxa prefixada anual: (1 + IPCA) * (1 + taxa) - 1
        ipca_map, _ = get_monthly_ipca_series(db) if db is not None else ({}, "fallback")
        ipca_factor = _compound_ipca_factor(ipca_map, issue_dt, today)
        fixed_factor = (Decimal('1.0') + interest_rate_dec) ** (Decimal(str(days_elapsed)) / Decimal('365.0'))
        rate_acrued = ipca_factor * fixed_factor
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
            
            issue_date = datetime.strptime(body.issue_date, '%Y-%m-%d').date() if body.issue_date else datetime.now().date()
            due_date = datetime.strptime(body.due_date, '%Y-%m-%d').date() if body.due_date else datetime.now().date()
                
            # Verifica ou cria Categoria 'Renda Fixa'
            cat = db.query(Category).filter_by(name='Renda Fixa').first()
            if not cat:
                cat = Category(name='Renda Fixa', target_percent=Decimal('20.0'))
                db.add(cat)
                db.flush()
                
            # Verifica ou cria Asset
            asset = db.query(Asset).filter_by(ticker=ticker).first()
            if not asset:
                asset = Asset(ticker=ticker, name=name, category_id=cat.id, currency="BRL")
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
        from sqlalchemy import and_
        results = (
            db.query(FixedIncome, Position)
            .join(Asset, FixedIncome.asset_id == Asset.id)
            .outerjoin(Position, and_(Position.asset_id == Asset.id, Position.user_id == g.user_id))
            .options(joinedload(FixedIncome.asset))
            .filter(FixedIncome.is_deleted == False, FixedIncome.user_id == g.user_id)
            .all()
        )
        
        res_list = []
        for fi, pos in results:
            qty = pos.quantity if pos else Decimal('0')
            pm = pos.average_price if pos else Decimal('0')
            metrics = calculate_fixed_income_metrics(fi, qty, pm, db=db)
            
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
            from utils.date_helper import parse_iso_date
            if data.get('issue_date'):
                fi.issue_date = parse_iso_date(data.get('issue_date')) or fi.issue_date
            if data.get('due_date'):
                fi.due_date = parse_iso_date(data.get('due_date')) or fi.due_date
            
            # Atualiza quantidade e preço médio na posição
            pos = db.query(Position).filter_by(asset_id=fi.asset_id, user_id=g.user_id).first()
            if pos:
                pos.quantity = Decimal(str(data.get('quantity', pos.quantity)))
                pos.average_price = Decimal(str(data.get('average_price', pos.average_price)))
        except Exception:
            return jsonify({"status": "Erro", "msg": "Valores numéricos ou datas inválidas"}), 400
            
        safe_commit(db)
        return jsonify({"msg": "Título atualizado com sucesso!"})
