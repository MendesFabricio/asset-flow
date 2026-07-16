from flask import jsonify, request, g
from . import refunds_bp
from database.models import Session, Debtor, ReceivableLoan, LoanInstallment, PaymentTransaction, safe_commit
from datetime import datetime
from decimal import Decimal
from .utils import log_audit

def apply_payment_to_installments(session, installments, amount, forma_pagamento):
    """
    Máquina de pagamento unificada.
    Distribui 'amount' sobre as parcelas passadas (que devem estar ordenadas).
    Retorna o valor do excesso (se houver).
    """
    if amount <= 0 or not installments:
        return amount
        
    remaining_payment = Decimal(str(amount))
    installments_affected = 0
    
    for inst in installments:
        if remaining_payment <= 0:
            break
            
        already_paid = sum(Decimal(str(t.valor_pago)) for t in inst.transactions)
        due_amount = Decimal(str(inst.valor_parcela)) - already_paid
        
        if remaining_payment < due_amount:
            tx = PaymentTransaction(
                installment_id=inst.id,
                valor_pago=remaining_payment,
                data_movimentacao=datetime.now(),
                tipo_movimentacao="PARCIAL",
                forma_pagamento=forma_pagamento
            )
            session.add(tx)
            inst.status = "ABERTA"
            log_audit(session, "loan_installments", inst.id, "status", "ABERTA", "ABERTA")
            remaining_payment = Decimal('0.0')
            installments_affected += 1
        else:
            tx_type = "ANTECIPADO" if datetime.now() < inst.data_vencimento else "ATRASADO"
            tx = PaymentTransaction(
                installment_id=inst.id,
                valor_pago=due_amount,
                data_movimentacao=datetime.now(),
                tipo_movimentacao=tx_type,
                forma_pagamento=forma_pagamento
            )
            session.add(tx)
            inst.status = "PAGA"
            inst.data_efetiva_pagamento = datetime.now()
            log_audit(session, "loan_installments", inst.id, "status", "ABERTA", "PAGA")
            remaining_payment -= due_amount
            installments_affected += 1
            
    if remaining_payment > 0 and installments:
        last_inst = installments[-1]
        tx_excess = PaymentTransaction(
            installment_id=last_inst.id,
            valor_pago=remaining_payment,
            data_movimentacao=datetime.now(),
            tipo_movimentacao="EXCESSO",
            forma_pagamento=forma_pagamento
        )
        session.add(tx_excess)
        
    return remaining_payment

def process_single_payment(session, installment, amount, forma_pagamento):
    loan = installment.loan
    other_insts = (
        session.query(LoanInstallment)
        .filter(
            LoanInstallment.loan_id == loan.id,
            LoanInstallment.status == "ABERTA",
            LoanInstallment.id != installment.id,
            LoanInstallment.is_deleted == False
        )
        .order_by(LoanInstallment.numero_parcela.asc())
        .all()
    )
    # Colocamos a parcela atual como a primeira da fila, e o resto depois
    target_installments = [installment] + other_insts
    remaining_excess = apply_payment_to_installments(session, target_installments, amount, forma_pagamento)

    total_loan_paid = sum(
        sum(Decimal(str(t.valor_pago)) for t in inst.transactions)
        for inst in loan.installments if not inst.is_deleted
    )
    if total_loan_paid >= loan.valor_total:
        loan.status = "LIQUIDADO"
    elif total_loan_paid > 0:
        loan.status = "PARCIAL"
    else:
        loan.status = "PENDENTE"
        
    return remaining_excess

@refunds_bp.route('/installments/<int:id>/pay', methods=['POST'])
def pay_installment(id):
    data = request.json or {}
    forma_pagamento = data.get('forma_pagamento', 'Pix')
    try:
        valor_pago = Decimal(str(data.get('valor_pago', 0)))
    except Exception:
        return jsonify({"status": "Erro", "msg": "Valor de pagamento inválido"}), 400
        
    if valor_pago <= 0:
        return jsonify({"status": "Erro", "msg": "Valor de pagamento deve ser maior que zero"}), 400
        
    with Session() as db:
        inst = db.query(LoanInstallment).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not inst:
            return jsonify({"status": "Erro", "msg": "Parcela não encontrada"}), 404
            
        if inst.status == 'PAGA':
            return jsonify({"status": "Erro", "msg": "Parcela já está paga"}), 400
            
        process_single_payment(db, inst, valor_pago, forma_pagamento)
        safe_commit(db)
        return jsonify({"msg": "Pagamento registrado com sucesso!"})

@refunds_bp.route('/installments/batch-pay', methods=['POST'])
def pay_batch():
    data = request.json or {}
    ids = data.get('installment_ids', [])
    forma_pagamento = data.get('forma_pagamento', 'Pix')
    
    if not ids or not isinstance(ids, list):
        return jsonify({"status": "Erro", "msg": "Nenhuma parcela selecionada"}), 400
        
    with Session() as db:
        installments = db.query(LoanInstallment).filter(
            LoanInstallment.id.in_(ids),
            LoanInstallment.user_id == g.user_id,
            LoanInstallment.is_deleted == False
        ).all()
        
        count = 0
        for inst in installments:
            if inst.status == 'PAGA':
                continue
            paid_so_far = sum(Decimal(str(t.valor_pago)) for t in inst.transactions)
            due_amount = inst.valor_parcela - paid_so_far
            
            process_single_payment(db, inst, due_amount, forma_pagamento)
            count += 1
            
        safe_commit(db)
        return jsonify({"msg": f"{count} parcelas quitadas com sucesso!"})

@refunds_bp.route('/debtors/<int:id>/pay', methods=['POST'])
def pay_global_debtor(id):
    data = request.json or {}
    forma_pagamento = data.get('forma_pagamento', 'Pix')
    try:
        valor_pago = Decimal(str(data.get('valor_pago', 0)))
    except Exception:
        return jsonify({"status": "Erro", "msg": "Valor de pagamento inválido"}), 400
        
    if valor_pago <= 0:
        return jsonify({"status": "Erro", "msg": "Valor de pagamento deve ser maior que zero"}), 400
        
    with Session() as db:
        debtor = db.query(Debtor).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not debtor:
            return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
            
        active_loan_ids = [l.id for l in debtor.loans if not l.is_deleted]
        if not active_loan_ids:
            return jsonify({"status": "Erro", "msg": "Este devedor não possui empréstimos ativos"}), 400
            
        installments = (
            db.query(LoanInstallment)
            .filter(
                LoanInstallment.loan_id.in_(active_loan_ids),
                LoanInstallment.user_id == g.user_id,
                LoanInstallment.status.in_(["ABERTA", "ATRASADA"]),
                LoanInstallment.is_deleted == False
            )
            .order_by(LoanInstallment.data_vencimento.asc(), LoanInstallment.numero_parcela.asc())
            .all()
        )
        
        if not installments:
            return jsonify({"status": "Erro", "msg": "Nenhuma parcela em aberto para este devedor"}), 400
            
        remaining_payment = apply_payment_to_installments(db, installments, valor_pago, forma_pagamento)
            
        for loan in debtor.loans:
            if loan.is_deleted:
                continue
            total_loan_paid = sum(
                sum(Decimal(str(t.valor_pago)) for t in inst.transactions)
                for inst in loan.installments if not inst.is_deleted
            )
            if total_loan_paid >= loan.valor_total:
                loan.status = "LIQUIDADO"
            elif total_loan_paid > 0:
                loan.status = "PARCIAL"
            else:
                loan.status = "PENDENTE"
                
        safe_commit(db)
        
        msg = "Pagamento global distribuído com sucesso!"
        if remaining_payment > 0:
            msg += f" Houve um excesso de R$ {remaining_payment:.2f} alocado na última parcela em aberto."
            
        return jsonify({"msg": msg})
