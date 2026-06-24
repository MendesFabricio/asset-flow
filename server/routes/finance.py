from flask import Blueprint, jsonify, request
from database.models import Session, Receivable 
import logging

finance_bp = Blueprint('finance', __name__)

@finance_bp.route('/receivables', methods=['GET'])
def list_receivables():
    # ⚡ Injetado Context Manager: Fecha o banco automaticamente mesmo se houver erro de tipo
    with Session() as db:
        items = db.query(Receivable).order_by(Receivable.status.desc(), Receivable.id.desc()).all()
        
        data = [{
            "id": i.id,
            "descricao": i.descricao,
            "devedor": i.devedor,
            "valor_parcela": i.valor_parcela,
            "valor_total": i.valor_parcela * i.total_parcelas,
            "parcela_atual": i.parcela_atual,
            "total_parcelas": i.total_parcelas,
            "dia": i.vencimento_dia,
            "status": i.status 
        } for i in items]
        
        return jsonify(data)

@finance_bp.route('/receivables', methods=['POST'])
def add_receivable():
    data = request.json or {}
    
    # Validação e Sanitização preventiva de payload
    if not data.get('descricao') or not data.get('devedor'):
        return jsonify({"status": "Erro", "msg": "Campos obrigatórios ausentes"}), 400
        
    try:
        valor_total = float(data.get('valor', 0) or 0)
        qtd_parcelas = int(data.get('parcelas', 1) or 1)
        if qtd_parcelas < 1: qtd_parcelas = 1
    except (ValueError, TypeError):
        return jsonify({"status": "Erro", "msg": "Formatos numéricos inválidos"}), 400
    
    with Session() as db:
        new_item = Receivable(
            descricao=data['descricao'],
            devedor=data['devedor'],
            valor_parcela=valor_total / qtd_parcelas,
            parcela_atual=1,
            total_parcelas=qtd_parcelas,
            vencimento_dia=int(data.get('dia', 10)),
            status='Pendente'
        )
        db.add(new_item)
        db.commit()
        return jsonify({"msg": "Adicionado com sucesso!"})

@finance_bp.route('/receivables/<int:id>', methods=['PUT'])
def update_receivable(id):
    data = request.json or {}
    
    with Session() as db:
        item = db.query(Receivable).filter(Receivable.id == id).first()
        if not item:
            return jsonify({"msg": "Recebível não localizado"}), 404

        item.descricao = data.get('descricao', item.descricao)
        item.devedor = data.get('devedor', item.devedor)
        
        try:
            item.vencimento_dia = int(data.get('dia', item.vencimento_dia))
            val_total = float(data.get('valor', 0))
            qtd_parc = int(data.get('parcelas', item.total_parcelas))
            
            if val_total > 0 and qtd_parc > 0:
                item.valor_parcela = val_total / qtd_parc
                item.total_parcelas = qtd_parc
        except (ValueError, TypeError):
            return jsonify({"status": "Erro", "msg": "Valores numéricos corrompidos recebidos"}), 400
            
        db.commit()
        return jsonify({"msg": "Atualizado!"})

@finance_bp.route('/receivables/<int:id>', methods=['DELETE'])
def delete_receivable(id):
    with Session() as db:
        item = db.query(Receivable).filter(Receivable.id == id).first()
        if item:
            db.delete(item)
            db.commit()
        return jsonify({"msg": "Removido!"})

@finance_bp.route('/receivables/<int:id>/pay', methods=['POST'])
def pay_receivable(id):
    with Session() as db:
        item = db.query(Receivable).filter(Receivable.id == id).first()
        if item:
            item.parcela_atual += 1 
            if item.parcela_atual > item.total_parcelas:
                item.status = 'Concluido'
            db.commit()
        return jsonify({"msg": "Recebido!"})

@finance_bp.route('/receivables/pay-batch', methods=['POST'])
def pay_batch():
    data = request.json or {}
    ids = data.get('ids', [])
    
    with Session() as db:
        items = db.query(Receivable).filter(Receivable.id.in_(ids)).all()
        count = 0
        for item in items:
            item.parcela_atual += 1
            if item.parcela_atual > item.total_parcelas:
                item.status = 'Concluido'
            count += 1
        db.commit()
        return jsonify({"msg": f"{count} parcelas recebidas!"})
