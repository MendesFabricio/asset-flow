from flask import jsonify, request, g
from . import refunds_bp
from database.models import Session, Debtor, ReceivableLoan, LoanInstallment, safe_commit
from sqlalchemy.orm import joinedload
from datetime import datetime
from decimal import Decimal
from .utils import get_config
from utils.date_helper import get_invoice_month_helper as get_fatura_mes_helper

@refunds_bp.route('/dashboard', methods=['GET'])
def get_dashboard_data():
    with Session() as db:
        loans = db.query(ReceivableLoan).options(
            joinedload(ReceivableLoan.debtor)
        ).filter(ReceivableLoan.user_id == g.user_id, ReceivableLoan.is_deleted == False).all()
        
        installments = db.query(LoanInstallment).options(
            joinedload(LoanInstallment.transactions),
            joinedload(LoanInstallment.loan).joinedload(ReceivableLoan.debtor)
        ).filter(LoanInstallment.user_id == g.user_id, LoanInstallment.is_deleted == False).all()
        
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
        ).filter(Debtor.user_id == g.user_id, Debtor.is_deleted == False).all()
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
