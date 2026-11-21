"""
utils/notifier.py — Canal opcional de notificações externas (Telegram Bot API).
Suporta configuração dinâmica via interface web (persistida em SystemCache) ou via .env.
Falhas de rede são apenas logadas para nunca interromper jobs do worker ou rotas HTTP.
"""
import html
import json
import logging
import os
from datetime import datetime
import requests

TELEGRAM_CACHE_KEY = "telegram_config"


def _mask_token(token: str) -> str:
    t = (token or "").strip()
    if not t:
        return ""
    if len(t) <= 10:
        return "***"
    return f"{t[:6]}...{t[-4:]}"


def get_telegram_credentials(session=None) -> tuple[str, str, str]:
    """Retorna (bot_token, chat_id, source) priorizando configuração salva no banco sobre .env."""
    try:
        from sqlalchemy.orm import sessionmaker
        from db.models import SystemCache
        from db.session import engine

        # Usa sessão dedicada se nenhuma for passada, evitando fechar o scoped_session do chamador
        if session is not None:
            rec = session.query(SystemCache).filter_by(key=TELEGRAM_CACHE_KEY).first()
            val = rec.value if rec else None
        else:
            local_session = sessionmaker(bind=engine)()
            try:
                rec = local_session.query(SystemCache).filter_by(key=TELEGRAM_CACHE_KEY).first()
                val = rec.value if rec else None
            finally:
                local_session.close()

        if val:
            data = json.loads(val)
            tok = str(data.get("bot_token") or "").strip()
            cid = str(data.get("chat_id") or "").strip()
            if tok and cid:
                return tok, cid, "db"
    except Exception:
        pass

    env_tok = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    env_cid = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    if env_tok and env_cid:
        return env_tok, env_cid, "env"
    return "", "", "none"


def get_telegram_status() -> dict:
    tok, cid, src = get_telegram_credentials()
    return {
        "configured": bool(tok and cid),
        "bot_token_masked": _mask_token(tok),
        "chat_id": cid,
        "source": src,
    }


def save_telegram_config(bot_token: str, chat_id: str) -> dict:
    from db.models import SystemCache, safe_commit
    from db.session import Session

    tok = (bot_token or "").strip()
    cid = (chat_id or "").strip()
    if not tok or ":" not in tok:
        raise ValueError("Bot Token inválido (formato esperado: 123456:ABC-DEF...).")
    if not cid:
        raise ValueError("Chat ID é obrigatório.")

    payload = json.dumps({"bot_token": tok, "chat_id": cid})
    with Session() as session:
        rec = session.query(SystemCache).filter_by(key=TELEGRAM_CACHE_KEY).first()
        if not rec:
            session.add(SystemCache(key=TELEGRAM_CACHE_KEY, value=payload, updated_at=datetime.now()))
        else:
            rec.value = payload
            rec.updated_at = datetime.now()
        safe_commit(session)
    return get_telegram_status()


def clear_telegram_config() -> dict:
    from db.models import SystemCache, safe_commit
    from db.session import Session

    with Session() as session:
        session.query(SystemCache).filter_by(key=TELEGRAM_CACHE_KEY).delete()
        safe_commit(session)
    return get_telegram_status()


def is_telegram_configured() -> bool:
    tok, cid, _ = get_telegram_credentials()
    return bool(tok and cid)


def send_telegram_message(text: str, parse_mode: str = "HTML", session=None) -> bool:
    """Envia mensagem para o chat configurado no Telegram. Retorna True se enviado."""
    token, chat_id, _ = get_telegram_credentials(session=session)
    if not token or not chat_id or not text:
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text[:4000],
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=6.0)
        if resp.status_code == 200 and resp.json().get("ok"):
            return True
        logging.warning(f"⚠️ [TELEGRAM] Falha ao enviar ({resp.status_code}): {resp.text[:200]}")
        return False
    except Exception as exc:
        logging.warning(f"⚠️ [TELEGRAM] Erro de rede ao enviar notificação: {exc}")
        return False


def format_alert_telegram(title: str, lines: list[str]) -> str:
    safe_title = html.escape(title)
    safe_lines = [html.escape(line) for line in lines if line]
    return "\n".join([f"<b>{safe_title}</b>", *safe_lines])
