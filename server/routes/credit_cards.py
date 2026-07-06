# server/routes/credit_cards.py
from flask import Blueprint, jsonify, request, g
from database.models import Session, CreditCard, CardExpense, CardInstallment, safe_commit
from datetime import datetime, date
import calendar
from decimal import Decimal
import logging
from sqlalchemy.orm import joinedload

cards_bp = Blueprint('credit_cards', __name__)

def get_invoice_month_helper(purchase_date, closing_day):
    y = purchase_date.year
    m = purchase_date.month
    if purchase_date.day > closing_day:
        if m == 12:
            m = 1
            y += 1
        else:
            m += 1
    return f"{y}-{m:02d}"

def get_due_date_helper(invoice_month, due_day):
    parts = invoice_month.split('-')
    y = int(parts[0])
    m = int(parts[1])
    last_day = calendar.monthrange(y, m)[1]
    day = min(due_day, last_day)
    return datetime(y, m, day)

def add_months_helper(sourcedate, months):
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

@cards_bp.route('/api/credit-cards', methods=['GET', 'POST'])
def handle_cards():
    with Session() as db:
        if request.method == 'POST':
            data = request.json or {}
            name = data.get('name', '').strip()
            try:
                limit = Decimal(str(data.get('limit', 0)))
                closing_day = int(data.get('closing_day', 5))
                due_day = int(data.get('due_day', 15))
            except Exception:
                return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos"}), 400
                
            if not name or limit <= 0 or not (1 <= closing_day <= 31) or not (1 <= due_day <= 31):
                return jsonify({"status": "Erro", "msg": "Campos obrigatórios inválidos"}), 400
                
            card = CreditCard(
                name=name,
                limit=limit,
                closing_day=closing_day,
                due_day=due_day
            )
            db.add(card)
            safe_commit(db)
            return jsonify({"msg": "Cartão de crédito criado com sucesso!"}), 201
            
        # GET
        cards = db.query(CreditCard).filter_by(user_id=g.user_id, is_deleted=False).all()
        return jsonify([{
            "id": c.id,
            "name": c.name,
            "limit": float(c.limit),
            "closing_day": c.closing_day,
            "due_day": c.due_day
        } for c in cards])

@cards_bp.route('/api/credit-cards/<int:id>', methods=['PUT', 'DELETE'])
def handle_single_card(id):
    with Session() as db:
        card = db.query(CreditCard).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not card:
            return jsonify({"status": "Erro", "msg": "Cartão não encontrado"}), 404
            
        if request.method == 'DELETE':
            card.is_deleted = True
            # Soft delete expenses and installments
            for exp in card.expenses:
                if not exp.is_deleted:
                    exp.is_deleted = True
                    for inst in exp.installments:
                        inst.is_deleted = True
            safe_commit(db)
            return jsonify({"msg": "Cartão excluído com sucesso!"})
            
        # PUT
        data = request.json or {}
        card.name = data.get('name', card.name).strip()
        try:
            card.limit = Decimal(str(data.get('limit', card.limit)))
            card.closing_day = int(data.get('closing_day', card.closing_day))
            card.due_day = int(data.get('due_day', card.due_day))
        except Exception:
            return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos"}), 400
            
        safe_commit(db)
        return jsonify({"msg": "Cartão atualizado com sucesso!"})

@cards_bp.route('/api/credit-cards/<int:card_id>/expenses', methods=['GET', 'POST'])
def handle_expenses(card_id):
    with Session() as db:
        card = db.query(CreditCard).filter_by(id=card_id, user_id=g.user_id, is_deleted=False).first()
        if not card:
            return jsonify({"status": "Erro", "msg": "Cartão não encontrado"}), 404
            
        if request.method == 'POST':
            data = request.json or {}
            description = data.get('description', '').strip()
            try:
                total_value = Decimal(str(data.get('total_value', 0)))
                installments_count = int(data.get('installments_count', 1))
            except Exception:
                return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos"}), 400
                
            if not description or total_value <= 0 or installments_count < 1:
                return jsonify({"status": "Erro", "msg": "Campos obrigatórios inválidos"}), 400
                
            date_str = data.get('date')
            if date_str:
                try:
                    expense_date = datetime.fromisoformat(date_str.replace('Z', ''))
                except ValueError:
                    return jsonify({"status": "Erro", "msg": "Data inválida"}), 400
            else:
                expense_date = datetime.now()
                
            expense = CardExpense(
                card_id=card_id,
                description=description,
                total_value=total_value,
                installments_count=installments_count,
                date=expense_date
            )
            db.add(expense)
            db.flush()
            
            # Geração de parcelas da fatura
            base_val = total_value // installments_count
            remainder = total_value - (base_val * installments_count)
            
            initial_invoice_month = get_invoice_month_helper(expense_date, card.closing_day)
            parts = initial_invoice_month.split('-')
            base_date = date(int(parts[0]), int(parts[1]), 1)
            
            for idx in range(1, installments_count + 1):
                val_parcela = base_val + (remainder if idx == installments_count else 0)
                shift_date = add_months_helper(base_date, idx - 1)
                fatura_mes = f"{shift_date.year}-{shift_date.month:02d}"
                vencimento_parcela = get_due_date_helper(fatura_mes, card.due_day)
                
                inst = CardInstallment(
                    expense_id=expense.id,
                    installment_number=idx,
                    value=val_parcela,
                    due_date=vencimento_parcela,
                    invoice_month=fatura_mes,
                    status="PENDING"
                )
                db.add(inst)
                
            safe_commit(db)
            return jsonify({"msg": "Despesa de cartão registrada com sucesso!"}), 201
            
        # GET
        expenses = (
            db.query(CardExpense)
            .options(joinedload(CardExpense.installments))
            .filter_by(card_id=card_id, user_id=g.user_id, is_deleted=False)
            .order_by(CardExpense.id.desc())
            .all()
        )
        
        return jsonify([{
            "id": e.id,
            "description": e.description,
            "total_value": float(e.total_value),
            "installments_count": e.installments_count,
            "date": e.date.isoformat(),
            "installments": [{
                "id": inst.id,
                "installment_number": inst.installment_number,
                "value": float(inst.value),
                "due_date": inst.due_date.isoformat(),
                "status": inst.status,
                "invoice_month": inst.invoice_month
            } for inst in e.installments if not inst.is_deleted]
        } for e in expenses])

@cards_bp.route('/api/credit-cards/installments/<int:id>/pay', methods=['POST'])
def pay_installment(id):
    with Session() as db:
        inst = db.query(CardInstallment).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not inst:
            return jsonify({"status": "Erro", "msg": "Parcela não encontrada"}), 404
            
        data = request.json or {}
        status = data.get('status', 'PAID').upper()
        if status not in ['PENDING', 'PAID']:
            status = 'PAID'
            
        inst.status = status
        safe_commit(db)
        return jsonify({"msg": f"Status da parcela alterado para {status}!"})

@cards_bp.route('/api/credit-cards/dashboard', methods=['GET'])
def get_dashboard():
    with Session() as db:
        cards = db.query(CreditCard).filter_by(user_id=g.user_id, is_deleted=False).all()
        installments = (
            db.query(CardInstallment)
            .join(CardExpense)
            .join(CreditCard)
            .filter(
                CardInstallment.is_deleted == False,
                CreditCard.is_deleted == False,
                CreditCard.user_id == g.user_id
            )
            .all()
        )
        
        total_limit = sum(c.limit for c in cards)
        total_spent = Decimal('0.0')
        total_pending = Decimal('0.0')
        
        for inst in installments:
            total_spent += inst.value
            if inst.status == 'PENDING':
                total_pending += inst.value
                
        # Consolidar faturas por mês
        faturas_map = {}
        for inst in installments:
            mes = inst.invoice_month
            if mes not in faturas_map:
                faturas_map[mes] = {"invoice_month": mes, "total": Decimal('0.0'), "pending": Decimal('0.0'), "paid": Decimal('0.0')}
            
            faturas_map[mes]["total"] += inst.value
            if inst.status == 'PENDING':
                faturas_map[mes]["pending"] += inst.value
            else:
                faturas_map[mes]["paid"] += inst.value
                
        faturas_list = sorted([
            {
                "invoice_month": k,
                "total": float(v["total"]),
                "pending": float(v["pending"]),
                "paid": float(v["paid"]),
                "status": "PAID" if v["pending"] == 0 else ("PARTIAL" if v["paid"] > 0 else "PENDING")
            } for k, v in faturas_map.items()
        ], key=lambda x: x["invoice_month"])
        
        return jsonify({
            "total_limit": float(total_limit),
            "total_spent": float(total_spent),
            "total_pending": float(total_pending),
            "faturas": faturas_list
        })
