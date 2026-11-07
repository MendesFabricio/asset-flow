# server/routes/categorize.py
from flask import Blueprint, request, jsonify
from utils.categorizer_engine import categorizer_engine
from pydantic import BaseModel, Field
from typing import List, Optional

categorize_bp = Blueprint('categorize', __name__)

class CategorizeRequest(BaseModel):
    description: str = Field(..., min_length=1)

class FeedbackRequest(BaseModel):
    description: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)

@categorize_bp.route('/api/categorize', methods=['POST'])
def categorize_transaction_endpoint():
    """
    Endpoint para classificar uma ou múltiplas descrições usando o modelo ML.
    """
    data = request.get_json() or {}
    
    # Caso 1: Lote de descrições
    if "descriptions" in data and isinstance(data["descriptions"], list):
        results = []
        for desc in data["descriptions"]:
            cat, conf, method = categorizer_engine.classify(str(desc))
            results.append({
                "description": desc,
                "category": cat,
                "confidence": conf,
                "method": method
            })
        return jsonify({"status": "Sucesso", "results": results})
        
    # Caso 2: Descrição única
    description = data.get("description", "").strip()
    if not description:
        return jsonify({"status": "Erro", "msg": "Descrição é obrigatória."}), 400
        
    category, confidence, method = categorizer_engine.classify(description)
    return jsonify({
        "status": "Sucesso",
        "description": description,
        "category": category,
        "confidence": confidence,
        "method": method
    })

@categorize_bp.route('/api/categorize/feedback', methods=['POST'])
def categorize_feedback_endpoint():
    """
    Permite ao usuário ensinar/corrigir a categorização do modelo em tempo de execução.
    """
    try:
        body = FeedbackRequest(**request.get_json() or {})
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
        
    categorizer_engine.train_example(body.description, body.category)
    return jsonify({
        "status": "Sucesso",
        "msg": f"Aprendizado registrado com sucesso para '{body.description}' -> '{body.category}'"
    })
