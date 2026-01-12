# server/routes/finance.py
from flask import Blueprint, jsonify, request
from database.models import Session, Receivable 

finance_bp = Blueprint('finance', __name__)

@finance_bp.route('/receivables', methods=['GET'])
def list_receivables():
    db = Session() 
    items = db.query(Receivable).filter(Receivable.parcela_atual <= Receivable.total_parcelas).all()
    
    data = [{
        "id": i.id,
        "descricao": i.descricao,
        "devedor": i.devedor,
        "valor_parcela": i.valor_parcela,     # Valor unitário da parcela
        "valor_total": i.valor_parcela * i.total_parcelas, # Valor total original (estimado)
        "parcela_atual": i.parcela_atual,
        "total_parcelas": i.total_parcelas,
        "dia": i.vencimento_dia,
        "status": i.status
    } for i in items]
    
    db.close()
    return jsonify(data)

@finance_bp.route('/receivables', methods=['POST'])
def add_receivable():
    data = request.json
    valor_total = float(data.get('valor', 0) or 0)
    qtd_parcelas = int(data.get('parcelas', 1) or 1)
    
    db = Session()
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
    db.close()
    return jsonify({"msg": "Adicionado!"})

@finance_bp.route('/receivables/<int:id>', methods=['PUT'])
def update_receivable(id):
    data = request.json
    db = Session()
    item = db.query(Receivable).filter(Receivable.id == id).first()
    
    if not item:
        db.close()
        return jsonify({"msg": "Não encontrado"}), 404

    # Atualiza dados básicos
    item.descricao = data.get('descricao', item.descricao)
    item.devedor = data.get('devedor', item.devedor)
    item.vencimento_dia = int(data.get('dia', item.vencimento_dia))
    
    # Recalcula valor da parcela se o total mudou
    val_total = float(data.get('valor', 0))
    qtd_parc = int(data.get('parcelas', item.total_parcelas))
    
    if val_total > 0 and qtd_parc > 0:
        item.valor_parcela = val_total / qtd_parc
        item.total_parcelas = qtd_parc
        
    db.commit()
    db.close()
    return jsonify({"msg": "Atualizado!"})

@finance_bp.route('/receivables/<int:id>', methods=['DELETE'])
def delete_receivable(id):
    db = Session()
    item = db.query(Receivable).filter(Receivable.id == id).first()
    if item:
        db.delete(item)
        db.commit()
    db.close()
    return jsonify({"msg": "Removido!"})

@finance_bp.route('/receivables/<int:id>/pay', methods=['POST'])
def pay_receivable(id):
    db = Session()
    item = db.query(Receivable).filter(Receivable.id == id).first()
    if item:
        item.parcela_atual += 1 
        db.commit()
    db.close()
    return jsonify({"msg": "Recebido!"})

@finance_bp.route('/receivables/pay-batch', methods=['POST'])
def pay_batch():
    ids = request.json.get('ids', [])
    db = Session()
    items = db.query(Receivable).filter(Receivable.id.in_(ids)).all()
    count = 0
    for item in items:
        item.parcela_atual += 1
        count += 1
    db.commit()
    db.close()
    return jsonify({"msg": f"{count} parcelas recebidas!"})
