import os
from tempfile import NamedTemporaryFile
from flask import Blueprint, jsonify, request, g
from decimal import Decimal
from datetime import datetime, date
from db.models import Session, CreditCard, CardExpense, CardInstallment, safe_commit
from utils.statement_parser import parse_statement
from utils.date_helper import get_invoice_month_helper, get_due_date_helper, add_months_helper, parse_iso_date

statement_import_bp = Blueprint('statement_import', __name__)

@statement_import_bp.route('/api/statements/parse', methods=['POST'])
def handle_parse_statement():
    if 'file' not in request.files:
        return jsonify({"status": "Erro", "msg": "Nenhum arquivo enviado"}), 400
        
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({"status": "Erro", "msg": "Arquivo inválido"}), 400
        
    ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = ['.pdf', '.xlsx', '.xls', '.csv', '.docx']
    if ext not in allowed_exts:
        return jsonify({"status": "Erro", "msg": f"Extensão '{ext}' não suportada. Use PDF, Excel ou Word."}), 400
        
    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix=ext) as f:
            file.save(f.name)
            temp_path = f.name
            
        parsed_data = parse_statement(temp_path, file.filename)
        return jsonify({"status": "Sucesso", "data": parsed_data}), 200
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

@statement_import_bp.route('/api/statements/import-batch', methods=['POST'])
def handle_import_batch():
    data = request.json or {}
    card_id = data.get('card_id')
    transactions = data.get('transactions', [])
    reference_month = data.get('reference_month')
    
    target_invoice_month = None
    if reference_month and isinstance(reference_month, str):
        rm_clean = reference_month.strip()
        if '/' in rm_clean:
            p = rm_clean.split('/')
            if len(p) == 2 and len(p[1]) == 4:
                target_invoice_month = f"{p[1]}-{int(p[0]):02d}"
        elif '-' in rm_clean:
            p = rm_clean.split('-')
            if len(p) == 2:
                target_invoice_month = f"{p[0]}-{int(p[1]):02d}"
                
    if not card_id or not isinstance(transactions, list) or len(transactions) == 0:
        return jsonify({"status": "Erro", "msg": "Dados de importação incompletos"}), 400
        
    with Session() as db:
        card = db.query(CreditCard).filter_by(id=card_id, user_id=g.user_id, is_deleted=False).first()
        if not card:
            return jsonify({"status": "Erro", "msg": "Cartão selecionado não encontrado ou sem permissão"}), 404
            
        imported_count = 0
        for tx in transactions:
            description = tx.get('description', '').strip()
            if not description:
                continue
            try:
                total_value = Decimal(str(tx.get('value', 0)))
                if total_value <= 0:
                    continue
            except Exception:
                continue
                
            installments_count = int(tx.get('installments_count', 1))
            if installments_count < 1:
                installments_count = 1
                
            date_str = tx.get('date')
            if date_str:
                expense_date = parse_iso_date(date_str)
                if not expense_date:
                    expense_date = try_parse_pt_br_date(date_str)
            else:
                expense_date = datetime.now()
                
            if not expense_date:
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
            
            base_val = total_value // installments_count
            remainder = total_value - (base_val * installments_count)
            
            if target_invoice_month:
                initial_invoice_month = target_invoice_month
            else:
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
            imported_count += 1
            
        safe_commit(db)
        return jsonify({"status": "Sucesso", "msg": f"{imported_count} transações importadas com sucesso!"}), 201

def try_parse_pt_br_date(date_str: str):
    try:
        # Mapeamento meses pt-br para números
        months = {
            "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
            "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12
        }
        parts = date_str.upper().strip().split()
        if len(parts) == 3 and parts[0].isdigit() and parts[1] in months and parts[2].isdigit():
            day = int(parts[0])
            month = months[parts[1]]
            year = int(parts[2])
            return datetime(year, month, day)
    except Exception:
        pass
    return datetime.now()
