# server/routes/refunds.py
from flask import Blueprint, jsonify, request
from database.models import Session, RefundConfig, Debtor, ReceivableLoan, LoanInstallment, PaymentTransaction, AuditLog, safe_commit
from sqlalchemy.orm import joinedload
from datetime import datetime, date
import calendar
from decimal import Decimal
import logging

refunds_bp = Blueprint('refunds', __name__)

def log_audit(session, table, reg_id, field, old_val, new_val):
    log = AuditLog(
        tabela_afetada=table,
        registro_id=reg_id,
        campo_alterado=field,
        valor_antigo=str(old_val) if old_val is not None else None,
        valor_novo=str(new_val) if new_val is not None else None,
        alterado_em=datetime.now()
    )
    session.add(log)

def get_config(session):
    from flask import g
    config = session.query(RefundConfig).filter_by(user_id=g.user_id).first()
    if not config:
        config = RefundConfig(user_id=g.user_id, fechamento_dia=15, vencimento_dia=20)
        session.add(config)
        safe_commit(session)
    return config

def get_fatura_mes_helper(data_ref, fechamento_dia):
    y = data_ref.year
    m = data_ref.month
    if data_ref.day > fechamento_dia:
        if m == 12:
            m = 1
            y += 1
        else:
            m += 1
    return f"{y}-{m:02d}"

def get_due_date_for_fatura_helper(fatura_mes, vencimento_dia):
    parts = fatura_mes.split('-')
    y = int(parts[0])
    m = int(parts[1])
    last_day = calendar.monthrange(y, m)[1]
    day = min(vencimento_dia, last_day)
    return datetime(y, m, day)

def add_months(sourcedate, months):
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

@refunds_bp.route('/config', methods=['GET', 'POST'])
def handle_config():
    with Session() as db:
        config = get_config(db)
        if request.method == 'POST':
            data = request.json or {}
            fechamento = int(data.get('fechamento_dia', config.fechamento_dia))
            vencimento = int(data.get('vencimento_dia', config.vencimento_dia))
            
            if not (1 <= fechamento <= 31) or not (1 <= vencimento <= 31):
                return jsonify({"status": "Erro", "msg": "Os dias devem estar entre 1 e 31"}), 400
                
            log_audit(db, "refund_configs", config.id, "fechamento_dia", config.fechamento_dia, fechamento)
            log_audit(db, "refund_configs", config.id, "vencimento_dia", config.vencimento_dia, vencimento)
            
            config.fechamento_dia = fechamento
            config.vencimento_dia = vencimento
            safe_commit(db)
            return jsonify({"msg": "Configurações salvas!"})
            
        return jsonify({
            "id": config.id,
            "fechamento_dia": config.fechamento_dia,
            "vencimento_dia": config.vencimento_dia
        })

@refunds_bp.route('/debtors', methods=['GET', 'POST'])
def handle_debtors():
    with Session() as db:
        if request.method == 'POST':
            data = request.json or {}
            nome = data.get('nome', '').strip()
            if not nome:
                return jsonify({"status": "Erro", "msg": "Nome é obrigatório"}), 400
                
            # Check if exists (soft deleted or active)
            existing = db.query(Debtor).filter_by(nome=nome).first()
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
        query = db.query(Debtor).options(
            joinedload(Debtor.loans)
            .joinedload(ReceivableLoan.installments)
            .joinedload(LoanInstallment.transactions)
        ).filter(Debtor.is_deleted == False)
        if q:
            query = query.filter(Debtor.nome.ilike(f"%{q}%"))
            
        debtors = query.all()
        return jsonify([{
            "id": d.id,
            "nome": d.nome,
            "foto_url": d.foto_url,
            "telefone": d.telefone,
            "observacoes": d.observacoes,
            "valor_total_emprestado": float(d.valor_total_emprestado),
            "valor_total_recebido": float(d.valor_total_recebido),
            "saldo_pendente": float(d.saldo_pendente),
            "data_ultimo_pagamento": d.data_ultimo_pagamento.isoformat() if d.data_ultimo_pagamento else None,
            "data_primeiro_emprestimo": d.data_primeiro_emprestimo.isoformat() if d.data_primeiro_emprestimo else None,
            "data_ultimo_contato": d.data_ultimo_contato.isoformat() if d.data_ultimo_contato else None
        } for d in debtors])

@refunds_bp.route('/debtors/<int:id>', methods=['DELETE'])
def delete_debtor(id):
    with Session() as db:
        debtor = db.query(Debtor).filter_by(id=id, is_deleted=False).first()
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
                
            debtor = db.query(Debtor).filter_by(id=debtor_id, is_deleted=False).first()
            if not debtor:
                return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
                
            data_emp_str = data.get('data_emprestimo')
            if data_emp_str:
                try:
                    data_emprestimo = datetime.fromisoformat(data_emp_str.replace('Z', ''))
                except ValueError:
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
                fatura_mes=fatura_inicial,
                status="PENDENTE"
            )
            db.add(loan)
            db.flush()
            
            log_audit(db, "receivable_loans", loan.id, "valor_total", None, float(valor_total))
            
            # Geração de parcelas
            base_val = valor_total // total_parcelas
            remainder = valor_total - (base_val * total_parcelas)
            
            parts = fatura_inicial.split('-')
            base_year = int(parts[0])
            base_month = int(parts[1])
            base_date = date(base_year, base_month, 1)
            
            for idx in range(1, total_parcelas + 1):
                val_parcela = base_val + (remainder if idx == total_parcelas else 0)
                
                shift_date = add_months(base_date, idx - 1)
                fatura_parcela = f"{shift_date.year}-{shift_date.month:02d}"
                vencimento_parcela = get_due_date_for_fatura_helper(fatura_parcela, config.vencimento_dia)
                
                inst = LoanInstallment(
                    loan_id=loan.id,
                    numero_parcela=idx,
                    valor_parcela=val_parcela,
                    data_vencimento=vencimento_parcela,
                    status="ABERTA",
                    fatura_mes=fatura_parcela
                )
                db.add(inst)
                
            safe_commit(db)
            return jsonify({"msg": "Empréstimo cadastrado com sucesso!"}), 201
            
        # GET
        debtor_id = request.args.get('debtor_id')
        query = db.query(ReceivableLoan).options(
            joinedload(ReceivableLoan.debtor),
            joinedload(ReceivableLoan.installments).joinedload(LoanInstallment.transactions)
        ).filter(ReceivableLoan.is_deleted == False)
        if debtor_id:
            query = query.filter(ReceivableLoan.debtor_id == debtor_id)
            
        loans = query.order_by(ReceivableLoan.id.desc()).all()
        
        return jsonify([{
            "id": l.id,
            "debtor_id": l.debtor_id,
            "debtor_nome": l.debtor.nome if l.debtor else "Desconhecido",
            "descricao": l.descricao,
            "categoria": l.categoria,
            "data_emprestimo": l.data_emprestimo.isoformat() if l.data_emprestimo else None,
            "valor_total": float(l.valor_total),
            "is_parcelado": l.is_parcelado,
            "total_parcelas": l.total_parcelas,
            "status": l.status,
            "fatura_mes": l.fatura_mes,
            "observacoes": l.observacoes,
            "parcelas": [{
                "id": inst.id,
                "numero_parcela": inst.numero_parcela,
                "valor_parcela": float(inst.valor_parcela),
                "data_vencimento": inst.data_vencimento.isoformat() if inst.data_vencimento else None,
                "status": inst.status,
                "data_efetiva_pagamento": inst.data_efetiva_pagamento.isoformat() if inst.data_efetiva_pagamento else None,
                "observacoes": inst.observacoes,
                "fatura_mes": inst.fatura_mes,
                "valor_pago": float(sum(Decimal(str(t.valor_pago)) for t in inst.transactions))
            } for inst in l.installments if not inst.is_deleted]
        } for l in loans])

@refunds_bp.route('/loans/<int:id>', methods=['DELETE'])
def delete_loan(id):
    with Session() as db:
        loan = db.query(ReceivableLoan).filter_by(id=id, is_deleted=False).first()
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

def process_single_payment(session, installment, amount, forma_pagamento):
    loan = installment.loan
    already_paid = sum(Decimal(str(t.valor_pago)) for t in installment.transactions)
    due_amount = Decimal(str(installment.valor_parcela)) - already_paid
    
    if amount <= 0:
        return Decimal('0.0')
        
    if amount < due_amount:
        tx = PaymentTransaction(
            installment_id=installment.id,
            valor_pago=amount,
            data_movimentacao=datetime.now(),
            tipo_movimentacao="PARCIAL",
            forma_pagamento=forma_pagamento
        )
        session.add(tx)
        installment.status = "ABERTA"
        log_audit(session, "loan_installments", installment.id, "status", "ABERTA", "ABERTA")
        remaining_excess = Decimal('0.0')
    else:
        excess = amount - due_amount
        tx_type = "ANTECIPADO" if datetime.now() < installment.data_vencimento else "ATRASADO"
        tx = PaymentTransaction(
            installment_id=installment.id,
            valor_pago=due_amount,
            data_movimentacao=datetime.now(),
            tipo_movimentacao=tx_type,
            forma_pagamento=forma_pagamento
        )
        session.add(tx)
        installment.status = "PAGA"
        installment.data_efetiva_pagamento = datetime.now()
        log_audit(session, "loan_installments", installment.id, "status", "ABERTA", "PAGA")
        remaining_excess = excess
        
        if remaining_excess > 0:
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
            for next_inst in other_insts:
                if remaining_excess <= 0:
                    break
                next_already_paid = sum(Decimal(str(t.valor_pago)) for t in next_inst.transactions)
                next_due = Decimal(str(next_inst.valor_parcela)) - next_already_paid
                
                if remaining_excess < next_due:
                    tx_next = PaymentTransaction(
                        installment_id=next_inst.id,
                        valor_pago=remaining_excess,
                        data_movimentacao=datetime.now(),
                        tipo_movimentacao="EXCESSO",
                        forma_pagamento=forma_pagamento
                    )
                    session.add(tx_next)
                    next_inst.status = "ABERTA"
                    remaining_excess = Decimal('0.0')
                else:
                    tx_next = PaymentTransaction(
                        installment_id=next_inst.id,
                        valor_pago=next_due,
                        data_movimentacao=datetime.now(),
                        tipo_movimentacao="EXCESSO",
                        forma_pagamento=forma_pagamento
                    )
                    session.add(tx_next)
                    next_inst.status = "PAGA"
                    next_inst.data_efetiva_pagamento = datetime.now()
                    remaining_excess -= next_due
                    log_audit(session, "loan_installments", next_inst.id, "status", "ABERTA", "PAGA")
                    
            if remaining_excess > 0:
                tx_excess = PaymentTransaction(
                    installment_id=installment.id,
                    valor_pago=remaining_excess,
                    data_movimentacao=datetime.now(),
                    tipo_movimentacao="EXCESSO",
                    forma_pagamento=forma_pagamento
                )
                session.add(tx_excess)
                remaining_excess = Decimal('0.0')
                
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
        return jsonify({"status": "Erro", "msg": "Valor pago inválido"}), 400
        
    if valor_pago <= 0:
        return jsonify({"status": "Erro", "msg": "Valor deve ser maior que zero"}), 400
        
    with Session() as db:
        inst = db.query(LoanInstallment).filter_by(id=id, is_deleted=False).first()
        if not inst:
            return jsonify({"status": "Erro", "msg": "Parcela não encontrada"}), 404
            
        if inst.status == 'PAGA':
            return jsonify({"status": "Erro", "msg": "Esta parcela já está totalmente paga"}), 400
            
        process_single_payment(db, inst, valor_pago, forma_pagamento)
        safe_commit(db)
        return jsonify({"msg": "Pagamento efetuado com sucesso!"})

@refunds_bp.route('/installments/pay-batch', methods=['POST'])
def pay_batch():
    data = request.json or {}
    ids = data.get('ids', [])
    forma_pagamento = data.get('forma_pagamento', 'Pix')
    
    if not ids:
        return jsonify({"status": "Erro", "msg": "Nenhuma parcela enviada"}), 400
        
    with Session() as db:
        count = 0
        installments = db.query(LoanInstallment).filter(LoanInstallment.id.in_(ids), LoanInstallment.is_deleted == False).all()
        
        for inst in installments:
            if inst.status == 'PAGA':
                continue
            paid_so_far = sum(Decimal(str(t.valor_pago)) for t in inst.transactions)
            due_amount = inst.valor_parcela - paid_so_far
            
            process_single_payment(db, inst, due_amount, forma_pagamento)
            count += 1
            
        safe_commit(db)
        return jsonify({"msg": f"{count} parcelas quitadas com sucesso!"})

@refunds_bp.route('/dashboard', methods=['GET'])
def get_dashboard_data():
    with Session() as db:
        loans = db.query(ReceivableLoan).options(
            joinedload(ReceivableLoan.debtor)
        ).filter(ReceivableLoan.is_deleted == False).all()
        
        installments = db.query(LoanInstallment).options(
            joinedload(LoanInstallment.transactions),
            joinedload(LoanInstallment.loan).joinedload(ReceivableLoan.debtor)
        ).filter(LoanInstallment.is_deleted == False).all()
        
        total_emprestado = sum(l.valor_total for l in loans)
        
        total_recebido = Decimal('0.0')
        for inst in installments:
            for t in inst.transactions:
                total_recebido += t.valor_pago
                
        total_pendente = total_emprestado - total_recebido
        
        total_atrasado = Decimal('0.0')
        now_dt = datetime.now()
        for inst in installments:
            if inst.status == 'ABERTA' and inst.data_vencimento < now_dt:
                paid_so_far = sum(t.valor_pago for t in inst.transactions)
                total_atrasado += (inst.valor_parcela - paid_so_far)
                
        debtors = db.query(Debtor).options(
            joinedload(Debtor.loans)
            .joinedload(ReceivableLoan.installments)
            .joinedload(LoanInstallment.transactions)
        ).filter(Debtor.is_deleted == False).all()
        maior_devedor_nome = "Nenhum"
        maior_devedor_saldo = Decimal('0.0')
        for d in debtors:
            saldo = d.saldo_pendente
            if saldo > maior_devedor_saldo:
                maior_devedor_saldo = saldo
                maior_devedor_nome = d.nome
                
        parcelas_abertas = sum(1 for inst in installments if inst.status == 'ABERTA')
        
        config = get_config(db)
        current_fatura = get_fatura_mes_helper(datetime.now(), config.fechamento_dia)
        
        faturas_map = {}
        faturas_installments = {}
        for inst in installments:
            f = inst.fatura_mes or "Geral"
            if f not in faturas_map:
                faturas_map[f] = {"fatura": f, "total": Decimal('0.0'), "recebido": Decimal('0.0'), "pendente": Decimal('0.0'), "items_count": 0, "status": "ABERTA"}
                faturas_installments[f] = []
            
            faturas_map[f]["total"] += inst.valor_parcela
            faturas_map[f]["items_count"] += 1
            faturas_installments[f].append(inst)
            for t in inst.transactions:
                faturas_map[f]["recebido"] += t.valor_pago
                
        for f, details in faturas_map.items():
            details["pendente"] = details["total"] - details["recebido"]
            
            insts = faturas_installments[f]
            all_paid = all(inst.status == 'PAGA' for inst in insts) if insts else False
            if all_paid:
                details["status"] = "RECEBIDA"
            elif details["recebido"] > 0:
                details["status"] = "RECEBIDA_PARCIALMENTE"
            elif f < current_fatura:
                details["status"] = "FECHADA"
            else:
                details["status"] = "ABERTA"

            details["total"] = float(details["total"])
            details["recebido"] = float(details["recebido"])
            details["pendente"] = float(details["pendente"])
            
        faturas_list = sorted(faturas_map.values(), key=lambda x: x["fatura"])
        
        categorias_map = {}
        for l in loans:
            cat = l.categoria or "Geral"
            if cat not in categorias_map:
                categorias_map[cat] = Decimal('0.0')
            categorias_map[cat] += l.valor_total
            
        categorias_list = [{"categoria": k, "valor": float(v)} for k, v in categorias_map.items()]
        
        devedores_list = []
        for d in debtors:
            if d.saldo_pendente > 0:
                devedores_list.append({
                    "devedor": d.nome,
                    "saldo": float(d.saldo_pendente)
                })
        devedores_list = sorted(devedores_list, key=lambda x: x["saldo"], reverse=True)[:5]
        
        return jsonify({
            "total_emprestado": float(total_emprestado),
            "total_recebido": float(total_recebido),
            "total_pendente": float(total_pendente),
            "total_atrasado": float(total_atrasado),
            "maior_devedor": maior_devedor_nome,
            "maior_devedor_saldo": float(maior_devedor_saldo),
            "parcelas_abertas": parcelas_abertas,
            "faturas": faturas_list,
            "categorias": categorias_list,
            "distribuicao_devedores": devedores_list
        })

@refunds_bp.route('/debtors/<int:id>', methods=['PUT'])
def update_debtor(id):
    data = request.json or {}
    nome = data.get('nome', '').strip()
    telefone = data.get('telefone', '')
    observacoes = data.get('observacoes', '')
    
    if not nome:
        return jsonify({"status": "Erro", "msg": "Nome é obrigatório"}), 400
        
    with Session() as db:
        debtor = db.query(Debtor).filter_by(id=id, is_deleted=False).first()
        if not debtor:
            return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
            
        if nome != debtor.nome:
            duplicate = db.query(Debtor).filter_by(nome=nome).first()
            if duplicate and not duplicate.is_deleted:
                return jsonify({"status": "Erro", "msg": "Já existe outro devedor ativo com este nome"}), 400
                
        if debtor.nome != nome:
            log_audit(db, "debtors", debtor.id, "nome", debtor.nome, nome)
            debtor.nome = nome
            
        if debtor.telefone != telefone:
            log_audit(db, "debtors", debtor.id, "telefone", debtor.telefone, telefone)
            debtor.telefone = telefone
            
        if debtor.observacoes != observacoes:
            log_audit(db, "debtors", debtor.id, "observacoes", debtor.observacoes, observacoes)
            debtor.observacoes = observacoes
            
        safe_commit(db)
        return jsonify({"msg": "Cadastro de devedor atualizado!"})

@refunds_bp.route('/loans/<int:id>', methods=['PUT'])
def update_loan(id):
    data = request.json or {}
    descricao = data.get('descricao', '').strip()
    categoria = data.get('categoria', 'Geral').strip()
    observacoes = data.get('observacoes', '')
    
    if not descricao:
        return jsonify({"status": "Erro", "msg": "Descrição é obrigatória"}), 400
        
    with Session() as db:
        loan = db.query(ReceivableLoan).filter_by(id=id, is_deleted=False).first()
        if not loan:
            return jsonify({"status": "Erro", "msg": "Empréstimo não encontrado"}), 404
            
        if loan.descricao != descricao:
            log_audit(db, "receivable_loans", loan.id, "descricao", loan.descricao, descricao)
            loan.descricao = descricao
            
        if loan.categoria != categoria:
            log_audit(db, "receivable_loans", loan.id, "categoria", loan.categoria, categoria)
            loan.categoria = categoria
            
        if loan.observacoes != observacoes:
            log_audit(db, "receivable_loans", loan.id, "observacoes", loan.observacoes, observacoes)
            loan.observacoes = observacoes
            
        safe_commit(db)
        return jsonify({"msg": "Empréstimo atualizado!"})

@refunds_bp.route('/debtors/<int:id>/pay-global', methods=['POST'])
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
        debtor = db.query(Debtor).filter_by(id=id, is_deleted=False).first()
        if not debtor:
            return jsonify({"status": "Erro", "msg": "Devedor não encontrado"}), 404
            
        active_loan_ids = [l.id for l in debtor.loans if not l.is_deleted]
        if not active_loan_ids:
            return jsonify({"status": "Erro", "msg": "Este devedor não possui empréstimos ativos"}), 400
            
        installments = (
            db.query(LoanInstallment)
            .filter(
                LoanInstallment.loan_id.in_(active_loan_ids),
                LoanInstallment.status.in_(["ABERTA", "ATRASADA"]),
                LoanInstallment.is_deleted == False
            )
            .order_by(LoanInstallment.data_vencimento.asc(), LoanInstallment.numero_parcela.asc())
            .all()
        )
        
        if not installments:
            return jsonify({"status": "Erro", "msg": "Nenhuma parcela em aberto para este devedor"}), 400
            
        remaining_payment = valor_pago
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
                db.add(tx)
                inst.status = "ABERTA"
                log_audit(db, "loan_installments", inst.id, "status", "ABERTA", "ABERTA")
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
                db.add(tx)
                inst.status = "PAGA"
                inst.data_efetiva_pagamento = datetime.now()
                log_audit(db, "loan_installments", inst.id, "status", "ABERTA", "PAGA")
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
            db.add(tx_excess)
            
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
        return jsonify({"msg": f"Pagamento de {float(valor_pago)} processado! {installments_affected} parcelas afetadas."})
