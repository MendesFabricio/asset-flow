import logging
import os
from tempfile import NamedTemporaryFile

from flask import Blueprint, jsonify, request

from utils.b3_parser import extract_b3_extract_transactions
from utils.brokerage_note_parser import extract_brokerage_note_transactions
from utils.db_utils import get_current_user_id
from utils.dedup import match_b3_to_db

ocr_import_bp = Blueprint('ocr_import', __name__)

@ocr_import_bp.route('/api/ocr/parse-brokerage-note', methods=['POST'])
def parse_brokerage_note():
    if 'file' not in request.files:
        return jsonify({"status": "Erro", "msg": "Nenhum arquivo enviado"}), 400
        
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({"status": "Erro", "msg": "Arquivo inválido"}), 400
        
    ext = os.path.splitext(file.filename)[1].lower()
    if ext != '.pdf':
        return jsonify({"status": "Erro", "msg": f"Extensão '{ext}' não suportada. Use apenas PDF."}), 400
        
    user_id = get_current_user_id()
    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix='.pdf') as f:
            file.save(f.name)
            temp_path = f.name
            
        password = request.form.get("password") or None
        parsed_data = extract_brokerage_note_transactions(temp_path, password=password)
        logging.warning(f"[OCR] Resultado do parse: status={parsed_data.get('status')}, txs={len(parsed_data.get('transactions', []))}")
        
        if parsed_data.get("status") == "Erro":
            status_code = 422 if parsed_data.get("code") in ("PDF_PASSWORD_REQUIRED", "PDF_SCANNED") else 400
            return jsonify(parsed_data), status_code
            
        return jsonify(parsed_data), 200
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

@ocr_import_bp.route('/api/ocr/parse-b3-extract', methods=['POST'])
def parse_b3_extract():
    if 'file' not in request.files:
        return jsonify({"status": "Erro", "msg": "Nenhum arquivo enviado"}), 400
        
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({"status": "Erro", "msg": "Arquivo inválido"}), 400
        
    ext = os.path.splitext(file.filename)[1].lower()
    if ext != '.pdf':
        return jsonify({"status": "Erro", "msg": f"Extensão '{ext}' não suportada. Use apenas PDF."}), 400
        
    user_id = get_current_user_id()
    temp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix='.pdf') as f:
            file.save(f.name)
            temp_path = f.name
            
        password = request.form.get("password") or None
        # Parseia o PDF da B3
        with open(temp_path, 'rb') as f:
            parsed_data = extract_b3_extract_transactions(f, file.filename, password=password)
            
        logging.warning(f"[OCR] B3 Parse result: status={parsed_data.get('status')}")
        
        if parsed_data.get("status") == "Erro":
            status_code = 422 if parsed_data.get("code") in ("PDF_PASSWORD_REQUIRED", "PDF_SCANNED") else 400
            return jsonify(parsed_data), status_code
            
        # Deduplica no backend
        parsed_data = match_b3_to_db(user_id, parsed_data)
            
        return jsonify(parsed_data), 200
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
