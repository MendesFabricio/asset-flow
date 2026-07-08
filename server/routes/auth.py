# server/routes/auth.py
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from database.models import User, RefundConfig, safe_commit
from database.session import Session
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import URLSafeTimedSerializer

import time
import re
from collections import defaultdict

auth_bp = Blueprint('auth', __name__)

_rate_limit_store = defaultdict(list)

def is_rate_limited(ip: str, limit: int = 5, window_seconds: int = 60) -> bool:
    """Verifica e limpa tentativas de requisições, retornando True se excedeu o limite."""
    if current_app.config.get("TESTING"):
        return False
    now = time.time()
    # Filtra apenas tentativas dentro da janela temporal
    attempts = [t for t in _rate_limit_store[ip] if now - t < window_seconds]
    _rate_limit_store[ip] = attempts
    if len(attempts) >= limit:
        return True
    _rate_limit_store[ip].append(now)
    return False

def validate_password_complexity(password: str) -> bool:
    """Valida se a senha tem pelo menos 8 caracteres, 1 número, 1 maiúscula e 1 especial."""
    if len(password) < 8:
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"\d", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False
    return True

def get_serializer():
    secret_key = current_app.config.get("SECRET_KEY")
    if not secret_key:
        raise RuntimeError("SECRET_KEY de sessão ausente no contexto do aplicativo Flask.")
    return URLSafeTimedSerializer(secret_key)

def generate_session_token(user_id: int, username: str) -> str:
    serializer = get_serializer()
    return serializer.dumps({"user_id": user_id, "username": username})

def verify_session_token(token: str) -> dict:
    serializer = get_serializer()
    # Expiração de 7 dias = 604800 segundos
    try:
        return serializer.loads(token, max_age=604800)
    except Exception:
        return None

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    ip = request.remote_addr or "unknown"
    if is_rate_limited(ip, limit=5, window_seconds=60):
        return jsonify({
            "status": "Erro", 
            "msg": "Muitas tentativas de login. Por favor, tente novamente em 1 minuto."
        }), 429

    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"status": "Erro", "msg": "Usuário e senha são obrigatórios."}), 400

    session = Session()
    try:
        user = session.query(User).filter(User.username.ilike(username)).first()
        if user and check_password_hash(user.password_hash, password):
            token = generate_session_token(user.id, user.username)
            return jsonify({
                "status": "Sucesso",
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username
                }
            })
        
        return jsonify({"status": "Erro", "msg": "Usuário ou senha incorretos."}), 401
    except Exception as e:
        logging.error(f"Erro no login: {e}")
        return jsonify({"status": "Erro", "msg": "Erro interno do servidor."}), 500
    finally:
        Session.remove()

@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    ip = request.remote_addr or "unknown"
    if is_rate_limited(ip, limit=5, window_seconds=60):
        return jsonify({
            "status": "Erro", 
            "msg": "Muitas tentativas de registro. Por favor, tente novamente em 1 minuto."
        }), 429

    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"status": "Erro", "msg": "Usuário e senha são obrigatórios."}), 400

    if len(username) < 3:
        return jsonify({"status": "Erro", "msg": "Usuário deve conter pelo menos 3 caracteres."}), 400

    if not validate_password_complexity(password):
        return jsonify({
            "status": "Erro", 
            "msg": "Senha fraca. A senha deve conter pelo menos 8 caracteres, contendo pelo menos 1 número, 1 letra maiúscula e 1 caractere especial."
        }), 400

    session = Session()
    try:
        # Verifica se usuário existe
        exists = session.query(User).filter(User.username.ilike(username)).first()
        if exists:
            return jsonify({"status": "Erro", "msg": "Este nome de usuário já está sendo utilizado."}), 409

        # Cria usuário
        hashed_pw = generate_password_hash(password)
        new_user = User(
            username=username,
            password_hash=hashed_pw
        )
        session.add(new_user)
        session.flush() # Atribui o id ao novo usuário antes do commit

        # Cria a configuração padrão de cartões/reembolsos para o novo usuário
        new_config = RefundConfig(
            user_id=new_user.id,
            fechamento_dia=15,
            vencimento_dia=20
        )
        session.add(new_config)

        safe_commit(session)
        logging.info(f"👤 Novo usuário registrado com sucesso: {username} (ID: {new_user.id})")
        return jsonify({"status": "Sucesso", "msg": "Usuário registrado com sucesso."}), 201
    except Exception as e:
        session.rollback()
        logging.error(f"Erro no registro de usuário: {e}")
        return jsonify({"status": "Erro", "msg": "Erro interno do servidor ao criar conta."}), 500
    finally:
        Session.remove()

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    response = jsonify({"status": "Sucesso", "msg": "Logout efetuado com sucesso."})
    response.delete_cookie("assetflow_session")
    return response
