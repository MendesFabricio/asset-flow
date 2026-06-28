# server/routes/decisions.py
import logging
from flask import Blueprint, jsonify, request
from database.models import Session, InvestorDecision, Asset, safe_commit
from datetime import datetime

decisions_bp = Blueprint('decisions', __name__)

@decisions_bp.route('/api/decisions', methods=['GET'])
def list_decisions():
    """Lista todas as anotações do diário de decisões, ordenadas por data decrescente."""
    asset_id_filter = request.args.get('asset_id')
    with Session() as session:
        try:
            query = session.query(InvestorDecision).join(Asset)
            if asset_id_filter:
                query = query.filter(InvestorDecision.asset_id == int(asset_id_filter))
            
            decisions = query.order_by(InvestorDecision.date.desc()).all()
            
            data = [{
                "id": d.id,
                "asset_id": d.asset_id,
                "ticker": d.asset.ticker if d.asset else "",
                "date": d.date.isoformat(),
                "decision_type": d.decision_type,
                "title": d.title,
                "content": d.content,
                "target_price": float(d.target_price) if d.target_price is not None else None
            } for d in decisions]
            
            return jsonify(data)
        except Exception as e:
            logging.error(f"❌ Erro ao listar decisões do investidor: {e}", exc_info=True)
            return jsonify([]), 500

@decisions_bp.route('/api/decisions', methods=['POST'])
def create_decision():
    """Cria uma nova anotação no diário de decisões."""
    data = request.json or {}
    
    ticker = data.get('ticker', '').strip().upper()
    decision_type = data.get('decision_type', 'ESTUDO').strip().upper()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    target_price = data.get('target_price')

    if not ticker or not title or not content:
        return jsonify({"status": "Erro", "msg": "Campos obrigatórios ausentes: ticker, title, content."}), 400

    if decision_type not in ["COMPRA", "VENDA", "MANTER", "ESTUDO"]:
        return jsonify({"status": "Erro", "msg": "Tipo de decisão inválido."}), 400

    with Session() as session:
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset:
                return jsonify({"status": "Erro", "msg": f"Ativo {ticker} não cadastrado na carteira."}), 400

            new_decision = InvestorDecision(
                asset_id=asset.id,
                date=datetime.now(),
                decision_type=decision_type,
                title=title,
                content=content,
                target_price=float(target_price) if target_price is not None and str(target_price).strip() != "" else None
            )
            session.add(new_decision)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "msg": "Decisão registrada com sucesso!", "id": new_decision.id}), 201
        except Exception as e:
            logging.error(f"❌ Erro ao registrar decisão do investidor: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Erro interno ao salvar diário de decisão."}), 500

@decisions_bp.route('/api/decisions/<int:decision_id>', methods=['PUT'])
def update_decision(decision_id):
    """Atualiza uma anotação existente no diário de decisões."""
    data = request.json or {}
    
    decision_type = data.get('decision_type')
    title = data.get('title')
    content = data.get('content')
    target_price = data.get('target_price')

    with Session() as session:
        try:
            decision = session.query(InvestorDecision).filter_by(id=decision_id).first()
            if not decision:
                return jsonify({"status": "Erro", "msg": "Anotação não localizada."}), 404

            if decision_type:
                decision_type_upper = decision_type.strip().upper()
                if decision_type_upper in ["COMPRA", "VENDA", "MANTER", "ESTUDO"]:
                    decision.decision_type = decision_type_upper
            if title is not None:
                decision.title = title.strip()
            if content is not None:
                decision.content = content.strip()
            if target_price is not None:
                decision.target_price = float(target_price) if str(target_price).strip() != "" else None

            safe_commit(session)
            return jsonify({"status": "Sucesso", "msg": "Decisão atualizada com sucesso!"})
        except Exception as e:
            logging.error(f"❌ Erro ao atualizar decisão {decision_id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Erro interno ao atualizar diário de decisão."}), 500

@decisions_bp.route('/api/decisions/<int:decision_id>', methods=['DELETE'])
def delete_decision(decision_id):
    """Remove uma anotação existente no diário de decisões."""
    with Session() as session:
        try:
            decision = session.query(InvestorDecision).filter_by(id=decision_id).first()
            if not decision:
                return jsonify({"status": "Erro", "msg": "Anotação não localizada."}), 404

            session.delete(decision)
            safe_commit(session)
            return jsonify({"status": "Sucesso", "msg": "Decisão removida com sucesso!"})
        except Exception as e:
            logging.error(f"❌ Erro ao remover decisão {decision_id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": "Erro interno ao remover diário de decisão."}), 500
