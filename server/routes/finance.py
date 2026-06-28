# server/routes/finance.py
from flask import Blueprint, jsonify, request
from database.models import Session, Receivable, safe_commit 
import threading
import logging

finance_bp = Blueprint('finance', __name__)

# ⚡ BLINDAGEM DE CONCORRÊNCIA: Lock de exclusão mútua para tornar as mutações de parcelas atômicas
finance_lock = threading.Lock()

@finance_bp.route('/receivables', methods=['GET'])
def list_receivables():
    with Session() as db:
        try:
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
        except Exception as e:
            logging.error(f"❌ Erro ao listar fluxo de recebíveis: {e}", exc_info=True)
            return jsonify([]), 500

@finance_bp.route('/receivables', methods=['POST'])
def add_receivable():
    data = request.json or {}
    
    if not data.get('descricao') or not data.get('devedor'):
        return jsonify({"status": "Erro", "msg": "Campos obrigatórios ausentes"}), 400
        
    try:
        valor_total = float(data.get('valor', 0) or 0)
        qtd_parcelas = int(data.get('parcelas', 1) or 1)
        if qtd_parcelas < 1: 
            qtd_parcelas = 1
            
        # 🛡️ SANITIZAÇÃO DE RANGE: Impede dias inválidos de quebrarem a projeção do calendário
        vencimento_dia = int(data.get('dia', 10) or 10)
        if not (1 <= vencimento_dia <= 31):
            return jsonify({"status": "Erro", "msg": "O dia de vencimento deve estar entre 1 and 31"}), 400
            
    except (ValueError, TypeError):
        return jsonify({"status": "Erro", "msg": "Formatos numéricos inválidos ou corrompidos"}), 400
    
    with Session() as db:
        try:
            new_item = Receivable(
                descricao=data['descricao'].strip(),
                devedor=data['devedor'].strip(),
                valor_parcela=valor_total / qtd_parcelas,
                parcela_atual=1,
                total_parcelas=qtd_parcelas,
                vencimento_dia=vencimento_dia,
                status='Pendente'
            )
            db.add(new_item)
            safe_commit(db)
            return jsonify({"msg": "Adicionado com sucesso!"}), 201
        except Exception as e:
            logging.error(f"❌ Falha ao persistir novo recebível: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Erro interno ao salvar registro"}), 500

@finance_bp.route('/receivables/<int:id>', methods=['PUT'])
def update_receivable(id):
    data = request.json or {}
    
    with Session() as db:
        try:
            item = db.query(Receivable).filter(Receivable.id == id).first()
            if not item:
                return jsonify({"msg": "Recebível não localizado"}), 404

            item.descricao = data.get('descricao', item.descricao).strip()
            item.devedor = data.get('devedor', item.devedor).strip()
            
            # Validação e higienização das alterações numéricas
            dia_input = data.get('dia')
            if dia_input is not None:
                vencimento_dia = int(dia_input)
                if not (1 <= vencimento_dia <= 31):
                    return jsonify({"status": "Erro", "msg": "O dia de vencimento deve estar entre 1 e 31"}), 400
                item.vencimento_dia = vencimento_dia
            
            val_total = float(data.get('valor', 0))
            qtd_parc = int(data.get('parcelas', item.total_parcelas))
            
            if val_total > 0 and qtd_parc > 0:
                item.valor_parcela = val_total / qtd_parc
                item.total_parcelas = qtd_parc
                
            safe_commit(db)
            return jsonify({"msg": "Atualizado!"})
        except (ValueError, TypeError):
            return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos recebidos na mutação"}), 400
        except Exception as e:
            logging.error(f"❌ Erro na atualização do recebível {id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Falha interna ao atualizar"}), 500

@finance_bp.route('/receivables/<int:id>', methods=['DELETE'])
def delete_receivable(id):
    with Session() as db:
        try:
            item = db.query(Receivable).filter(Receivable.id == id).first()
            if item:
                db.delete(item)
                safe_commit(db)
            return jsonify({"msg": "Removido!"})
        except Exception as e:
            logging.error(f"❌ Falha ao expurgar recebível {id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Erro interno ao remover"}), 500

@finance_bp.route('/receivables/<int:id>/pay', methods=['POST'])
def pay_receivable(id):
    # ⚡ SEGREDO DA OPERAÇÃO ATÔMICA: Lock intercepta a thread concorrente na entrada da rota
    with finance_lock:
        with Session() as db:
            try:
                item = db.query(Receivable).filter(Receivable.id == id).first()
                if not item:
                    return jsonify({"msg": "Recebível não localizado"}), 404
                    
                if item.status == 'Concluido':
                    return jsonify({"msg": "Este recebível já se encontra totalmente quitado"}), 400
                
                item.parcela_atual += 1 
                if item.parcela_atual > item.total_parcelas:
                    item.status = 'Concluido'
                    item.parcela_atual = item.total_parcelas # Cobre estouros matemáticos
                    
                safe_commit(db)
                return jsonify({"msg": "Recebido!"})
            except Exception as e:
                logging.error(f"❌ Falha operacional ao processar liquidação individual {id}: {e}", exc_info=True)
                return jsonify({"status": "Erro", "msg": "Falha na baixa da parcela"}), 500

@finance_bp.route('/receivables/pay-batch', methods=['POST'])
def pay_batch():
    data = request.json or {}
    raw_ids = data.get('ids', [])
    
    # 🛡️ SANITIZAÇÃO DE PAYLOAD: Coleta apenas inteiros legítimos para blindar o in_() contra StatementError
    try:
        ids = [int(x) for x in raw_ids if str(x).replace('-', '').isdigit()]
    except (ValueError, TypeError):
        return jsonify({"status": "Erro", "msg": "Estrutura de IDs corrompida"}), 400
        
    if not ids:
        return jsonify({"msg": "Nenhum ID válido enviado para processamento"}), 400

    with finance_lock:
        with Session() as db:
            try:
                items = db.query(Receivable).filter(Receivable.id.in_(ids)).all()
                count = 0
                for item in items:
                    if item.status == 'Concluido':
                        continue
                    item.parcela_atual += 1
                    if item.parcela_atual > item.total_parcelas:
                        item.status = 'Concluido'
                        item.parcela_atual = item.total_parcelas
                    count += 1
                    
                safe_commit(db)
                return jsonify({"msg": f"{count} parcelas recebidas!"})
            except Exception as e:
                logging.error(f"❌ Falha ao processar baixa em lote dos IDs {ids}: {e}", exc_info=True)
                return jsonify({"status": "Erro", "msg": "Erro interno ao processar lote"}), 500
