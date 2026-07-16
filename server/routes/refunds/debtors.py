from flask import jsonify, request, g
from . import refunds_bp
from db.models import Session, Debtor, ReceivableLoan, LoanInstallment, PaymentTransaction, safe_commit
from sqlalchemy import func
from datetime import datetime, date
from decimal import Decimal
from .utils import log_audit

@refunds_bp.route('/debtors', methods=['GET', 'POST'])
def handle_debtors():
    with Session() as db:
        if request.method == 'POST':
            data = request.json or {}
            nome = data.get('nome', '').strip()
            if not nome:
                return jsonify({"status": "Erro", "msg": "Nome é obrigatório"}), 400
                
            # Check if exists (soft deleted or active)
            existing = db.query(Debtor).filter_by(nome=nome, user_id=g.user_id).first()
            if existing:
                if existing.is_deleted:
                    existing.is_deleted = False
                    existing.foto_url = data.get('foto_url', existing.foto_url)
                    existing.telefone = data.get('telefone', existing.telefone)
                    existing.observacoes = data.get('observacoes', existing.observacoes)
                    log_audit(db, "debtors", existing.id, "is_deleted", "True", "False")
                    safe_commit(db)
                    return jsonify({"msg": "Devedor reativado com sucesso!"}), 200
                else:
                    return jsonify({"status": "Erro", "msg": "Devedor com este nome já existe"}), 400
                    
            debtor = Debtor(
                nome=nome,
                foto_url=data.get('foto_url'),
                telefone=data.get('telefone'),
                observacoes=data.get('observacoes')
            )
            db.add(debtor)
            db.flush()
            log_audit(db, "debtors", debtor.id, "nome", None, nome)
            safe_commit(db)
            return jsonify({"msg": "Devedor criado com sucesso!"}), 201
            
        # GET
        q = request.args.get('q', '').strip()
        
        loan_sub = db.query(func.coalesce(func.sum(ReceivableLoan.valor_total), 0.0)).filter(
            ReceivableLoan.debtor_id == Debtor.id,
            ReceivableLoan.is_deleted == False
        ).correlate(Debtor).as_scalar()

        # Subquery para valor_total_recebido
        rec_sub = db.query(func.coalesce(func.sum(PaymentTransaction.valor_pago), 0.0)).select_from(PaymentTransaction)\
            .join(LoanInstallment, PaymentTransaction.installment_id == LoanInstallment.id)\
            .join(ReceivableLoan, LoanInstallment.loan_id == ReceivableLoan.id)\
            .filter(
                ReceivableLoan.debtor_id == Debtor.id,
                ReceivableLoan.is_deleted == False,
                LoanInstallment.is_deleted == False
            ).correlate(Debtor).as_scalar()

        # Subquery para data_primeiro_emprestimo
        first_loan_sub = db.query(func.min(ReceivableLoan.data_emprestimo)).filter(
            ReceivableLoan.debtor_id == Debtor.id,
            ReceivableLoan.is_deleted == False
        ).correlate(Debtor).as_scalar()

        # Subquery para data_ultimo_pagamento
        last_pay_sub = db.query(func.max(PaymentTransaction.data_movimentacao)).select_from(PaymentTransaction)\
            .join(LoanInstallment, PaymentTransaction.installment_id == LoanInstallment.id)\
            .join(ReceivableLoan, LoanInstallment.loan_id == ReceivableLoan.id)\
            .filter(
                ReceivableLoan.debtor_id == Debtor.id,
                ReceivableLoan.is_deleted == False,
                LoanInstallment.is_deleted == False
            ).correlate(Debtor).as_scalar()

        # Subquery para data_ultimo_emprestimo
        last_loan_sub = db.query(func.max(ReceivableLoan.data_emprestimo)).filter(
            ReceivableLoan.debtor_id == Debtor.id,
            ReceivableLoan.is_deleted == False
        ).correlate(Debtor).as_scalar()

        query = db.query(
            Debtor,
            loan_sub.label('emprestado'),
            rec_sub.label('recebido'),
            first_loan_sub.label('first_loan'),
            last_pay_sub.label('last_pay'),
            last_loan_sub.label('last_loan')
        ).filter(Debtor.user_id == g.user_id, Debtor.is_deleted == False)

        if q:
            query = query.filter(Debtor.nome.ilike(f"%{q}%"))
            
        results = query.all()
        
        debtor_list = []
        for d, emprestado, recebido, first_loan, last_pay, last_loan in results:
            def safe_isoformat(val):
                if not val:
                    return None
                if isinstance(val, (datetime, date)):
                    return val.isoformat()
                return str(val)

            dates_list = []
            if last_loan:
                dates_list.append(last_loan)
            if last_pay:
                dates_list.append(last_pay)
            last_contact = max(dates_list) if dates_list else None

            debtor_list.append({
                "id": d.id,
                "nome": d.nome,
                "foto_url": d.foto_url,
                "telefone": d.telefone,
                "observacoes": d.observacoes,
                "valor_total_emprestado": float(emprestado),
                "valor_total_recebido": float(recebido),
                "saldo_pendente": float(Decimal(str(emprestado)) - Decimal(str(recebido))),
                "data_ultimo_pagamento": safe_isoformat(last_pay),
                "data_primeiro_emprestimo": safe_isoformat(first_loan),
                "data_ultimo_contato": safe_isoformat(last_contact)
            })
            
        return jsonify(debtor_list)

@refunds_bp.route('/debtors/<int:id>', methods=['DELETE'])
def delete_debtor(id):
    with Session() as db:
        debtor = db.query(Debtor).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not debtor:
            return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
            
        debtor.is_deleted = True
        log_audit(db, "debtors", debtor.id, "is_deleted", "False", "True")
        
        # Soft delete their loans and installments
        for loan in debtor.loans:
            if not loan.is_deleted:
                loan.is_deleted = True
                log_audit(db, "receivable_loans", loan.id, "is_deleted", "False", "True")
                for inst in loan.installments:
                    if not inst.is_deleted:
                        inst.is_deleted = True
                        log_audit(db, "loan_installments", inst.id, "is_deleted", "False", "True")
                        
        safe_commit(db)
        return jsonify({"msg": "Devedor excluído com sucesso!"})

@refunds_bp.route('/debtors/<int:id>', methods=['PUT'])
def update_debtor(id):
    data = request.json or {}
    with Session() as db:
        debtor = db.query(Debtor).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not debtor:
            return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
            
        nome = data.get('nome', debtor.nome).strip()
        if not nome:
            return jsonify({"status": "Erro", "msg": "Nome não pode ser vazio"}), 400
            
        if nome != debtor.nome:
            log_audit(db, "debtors", debtor.id, "nome", debtor.nome, nome)
            debtor.nome = nome
            
        if 'foto_url' in data and data['foto_url'] != debtor.foto_url:
            log_audit(db, "debtors", debtor.id, "foto_url", debtor.foto_url, data['foto_url'])
            debtor.foto_url = data['foto_url']
            
        if 'telefone' in data and data['telefone'] != debtor.telefone:
            log_audit(db, "debtors", debtor.id, "telefone", debtor.telefone, data['telefone'])
            debtor.telefone = data['telefone']
            
        if 'observacoes' in data and data['observacoes'] != debtor.observacoes:
            log_audit(db, "debtors", debtor.id, "observacoes", debtor.observacoes, data['observacoes'])
            debtor.observacoes = data['observacoes']
            
        safe_commit(db)
        return jsonify({"msg": "Devedor atualizado com sucesso!"})
