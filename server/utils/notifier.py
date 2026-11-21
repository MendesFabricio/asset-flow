"""
utils/notifier.py — Canal opcional de notificações externas (Telegram Bot API).
Ativado apenas quando TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID estão definidos no ambiente.
Falhas de rede são apenas logadas para nunca interromper jobs do worker ou rotas HTTP.
"""
import html
import logging
import os
import requests


def is_telegram_configured() -> bool:
    return bool(
        (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
        and (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
    )


def send_telegram_message(text: str, parse_mode: str = "HTML") -> bool:
    """Envia mensagem para o chat configurado no Telegram. Retorna True se enviado."""
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or "").strip()
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
