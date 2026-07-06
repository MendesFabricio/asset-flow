# server/routes/auth.py
import logging
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app
from database.models import User, RefundConfig, safe_commit
from database.session import Session
from werkzeug.security import check_password_hash, generate_password_hash
from itsdangerous import URLSafeTimedSerializer

auth_bp = Blueprint('auth', __name__)

def get_serializer():
    # Fallback key caso SECRET_KEY não esteja configurada
    secret_key = current_app.config.get("SECRET_KEY") or "assetflow_super_secret_key_prod_1337"
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
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"status": "Erro", "msg": "Usuário e senha são obrigatórios."}), 400

    if len(username) < 3 or len(password) < 4:
        return jsonify({"status": "Erro", "msg": "Usuário (min 3 chars) e senha (min 4 chars) muito curtos."}), 400

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
