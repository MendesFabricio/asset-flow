from flask import jsonify, request, g
from . import refunds_bp
from db.models import Session, Debtor, ReceivableLoan, LoanInstallment, safe_commit
from sqlalchemy.orm import joinedload
from datetime import datetime
from decimal import Decimal
from utils.date_helper import get_invoice_month_helper as get_fatura_mes_helper, get_due_date_helper as get_due_date_for_fatura_helper, add_months_helper as add_months
from .utils import get_config, log_audit

@refunds_bp.route('/loans', methods=['GET', 'POST'])
def handle_loans():
    with Session() as db:
        if request.method == 'POST':
            data = request.json or {}
            debtor_id = data.get('debtor_id')
            descricao = data.get('descricao', '').strip()
            categoria = data.get('categoria', 'Geral').strip()
            
            try:
                valor_total = Decimal(str(data.get('valor_total', 0)))
                is_parcelado = bool(data.get('is_parcelado', False))
                total_parcelas = int(data.get('total_parcelas', 1))
                if total_parcelas < 1:
                    total_parcelas = 1
            except Exception:
                return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos"}), 400
                
            if not debtor_id or not descricao or valor_total <= 0:
                return jsonify({"status": "Erro", "msg": "Campos obrigatórios inválidos ou ausentes"}), 400
                
            debtor = db.query(Debtor).filter_by(id=debtor_id, user_id=g.user_id, is_deleted=False).first()
            if not debtor:
                return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
                
            data_emp_str = data.get('data_emprestimo')
            if data_emp_str:
                from utils.date_helper import parse_iso_date
                data_emprestimo = parse_iso_date(data_emp_str)
                if not data_emprestimo:
                    return jsonify({"status": "Erro", "msg": "Data de empréstimo inválida"}), 400
            else:
                data_emprestimo = datetime.now()
                
            config = get_config(db)
            fatura_inicial = get_fatura_mes_helper(data_emprestimo, config.fechamento_dia)
            
            loan = ReceivableLoan(
                debtor_id=debtor_id,
                descricao=descricao,
                categoria=categoria,
                data_emprestimo=data_emprestimo,
                valor_total=valor_total,
                is_parcelado=is_parcelado,
                total_parcelas=total_parcelas,
                status="PENDENTE",
                user_id=g.user_id
            )
            db.add(loan)
            db.flush()
            log_audit(db, "receivable_loans", loan.id, "status", None, "PENDENTE")
            
            valor_parcela = valor_total / total_parcelas
            
            for i in range(total_parcelas):
                fatura_atual = add_months(fatura_inicial, i)
                vencimento_atual = get_due_date_for_fatura_helper(fatura_atual, config.vencimento_dia)
                
                inst = LoanInstallment(
                    loan_id=loan.id,
                    numero_parcela=i+1,
                    valor_parcela=valor_parcela,
                    data_vencimento=vencimento_atual,
                    status="ABERTA",
                    fatura_mes=fatura_atual,
                    user_id=g.user_id
                )
                db.add(inst)
                db.flush()
                log_audit(db, "loan_installments", inst.id, "status", None, "ABERTA")
                
            safe_commit(db)
            return jsonify({"msg": "Empréstimo criado com sucesso!"}), 201

        # GET
        q = request.args.get('q', '').strip()
        debtor_id = request.args.get('debtor_id')
        
        query = db.query(ReceivableLoan).options(
            joinedload(ReceivableLoan.debtor),
            joinedload(ReceivableLoan.installments).joinedload(LoanInstallment.transactions)
        ).filter(ReceivableLoan.user_id == g.user_id, ReceivableLoan.is_deleted == False)
        
        if debtor_id:
            query = query.filter(ReceivableLoan.debtor_id == debtor_id)
        if q:
            query = query.join(Debtor).filter(
                (Debtor.nome.ilike(f"%{q}%")) |
                (ReceivableLoan.descricao.ilike(f"%{q}%"))
            )
            
        loans = query.order_by(ReceivableLoan.data_emprestimo.desc()).all()
        
        result = []
        for l in loans:
            paid = sum(sum(t.valor_pago for t in i.transactions) for i in l.installments if not i.is_deleted)
            result.append({
                "id": l.id,
                "debtor_id": l.debtor_id,
                "debtor_nome": l.debtor.nome if l.debtor else "Desconhecido",
                "descricao": l.descricao,
                "categoria": l.categoria,
                "data_emprestimo": l.data_emprestimo.isoformat() if l.data_emprestimo else None,
                "valor_total": float(l.valor_total),
                "valor_pago": float(paid),
                "saldo_devedor": float(l.valor_total - paid),
                "is_parcelado": l.is_parcelado,
                "total_parcelas": l.total_parcelas,
                "status": l.status,
                "installments": [{
                    "id": i.id,
                    "numero_parcela": i.numero_parcela,
                    "valor_parcela": float(i.valor_parcela),
                    "data_vencimento": i.data_vencimento.isoformat() if i.data_vencimento else None,
                    "status": i.status,
                    "fatura_mes": i.fatura_mes,
                    "valor_pago": float(sum(t.valor_pago for t in i.transactions)),
                    "data_efetiva_pagamento": i.data_efetiva_pagamento.isoformat() if i.data_efetiva_pagamento else None
                } for i in sorted(l.installments, key=lambda x: x.numero_parcela) if not i.is_deleted]
            })
            
        return jsonify(result)

@refunds_bp.route('/loans/<int:id>', methods=['DELETE'])
def delete_loan(id):
    with Session() as db:
        loan = db.query(ReceivableLoan).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not loan:
            return jsonify({"status": "Erro", "msg": "Empréstimo não encontrado"}), 404
            
        loan.is_deleted = True
        log_audit(db, "receivable_loans", loan.id, "is_deleted", "False", "True")
        for inst in loan.installments:
            if not inst.is_deleted:
                inst.is_deleted = True
                log_audit(db, "loan_installments", inst.id, "is_deleted", "False", "True")
                
        safe_commit(db)
        return jsonify({"msg": "Empréstimo excluído com sucesso!"})

@refunds_bp.route('/loans/<int:id>', methods=['PUT'])
def update_loan(id):
    data = request.json or {}
    with Session() as db:
        loan = db.query(ReceivableLoan).filter_by(id=id, user_id=g.user_id, is_deleted=False).first()
        if not loan:
            return jsonify({"status": "Erro", "msg": "Empréstimo não encontrado"}), 404
            
        if 'descricao' in data and data['descricao'].strip() != loan.descricao:
            log_audit(db, "receivable_loans", loan.id, "descricao", loan.descricao, data['descricao'].strip())
            loan.descricao = data['descricao'].strip()
            
        if 'categoria' in data and data['categoria'].strip() != loan.categoria:
            log_audit(db, "receivable_loans", loan.id, "categoria", loan.categoria, data['categoria'].strip())
            loan.categoria = data['categoria'].strip()
            
        if 'data_emprestimo' in data:
            from utils.date_helper import parse_iso_date
            dt = parse_iso_date(data['data_emprestimo'])
            if dt and dt.date() != (loan.data_emprestimo.date() if loan.data_emprestimo else None):
                log_audit(db, "receivable_loans", loan.id, "data_emprestimo", loan.data_emprestimo, dt)
                loan.data_emprestimo = dt
                
                # Se for empréstimo não parcelado (1 parcela), tenta ajustar a data da parcela única também
                if loan.total_parcelas == 1 and len(loan.installments) == 1:
                    inst = loan.installments[0]
                    config = get_config(db)
                    fatura_nova = get_fatura_mes_helper(dt, config.fechamento_dia)
                    vencimento_novo = get_due_date_for_fatura_helper(fatura_nova, config.vencimento_dia)
                    log_audit(db, "loan_installments", inst.id, "fatura_mes", inst.fatura_mes, fatura_nova)
                    inst.fatura_mes = fatura_nova
                    log_audit(db, "loan_installments", inst.id, "data_vencimento", inst.data_vencimento, vencimento_novo)
                    inst.data_vencimento = vencimento_novo
                    
        safe_commit(db)
        return jsonify({"msg": "Empréstimo atualizado com sucesso!"})
