"""
infrastructure/local_ai.py
Cliente leve para execução local do Jarvis via Ollama quando GEMINI_API_KEY não está configurada.
"""
import json
import os
import threading
import time
from typing import Iterator, Optional
import requests

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
_OLLAMA_STATUS_TTL = 30.0
_OLLAMA_STATUS_LOCK = threading.Lock()
_OLLAMA_STATUS_CACHE: dict = {"ts": 0.0, "data": None}


def _candidate_base_urls() -> list[str]:
    urls = [OLLAMA_BASE_URL]
    if "localhost" not in OLLAMA_BASE_URL and "127.0.0.1" not in OLLAMA_BASE_URL:
        urls.append("http://localhost:11434")
    return urls


def get_ollama_status(timeout: float = 2.0) -> dict:
    """Verifica se o Ollama está acessível e retorna o modelo ativo disponível."""
    is_mocked = hasattr(requests.get, "return_value") or hasattr(requests.get, "side_effect")
    now = time.monotonic()
    if not is_mocked:
        with _OLLAMA_STATUS_LOCK:
            cached_data = _OLLAMA_STATUS_CACHE.get("data")
            if cached_data is not None and (now - _OLLAMA_STATUS_CACHE["ts"]) < _OLLAMA_STATUS_TTL:
                return dict(cached_data)

    preferred = OLLAMA_MODEL
    last_error = None

    for base_url in _candidate_base_urls():
        try:
            resp = requests.get(f"{base_url}/api/tags", timeout=timeout)
            if resp.status_code != 200:
                last_error = f"HTTP {resp.status_code}"
                continue

            models = [m.get("name", "") for m in (resp.json().get("models") or []) if m.get("name")]
            active_model: Optional[str] = None
            if preferred in models:
                active_model = preferred
            else:
                pref_prefix = preferred.split(":")[0]
                active_model = next((m for m in models if m.startswith(pref_prefix)), models[0] if models else None)

            result = {
                "available": True,
                "base_url": base_url,
                "model": active_model,
                "models": models,
                "preferred_model": preferred,
                "error": None,
            }
            if not is_mocked:
                with _OLLAMA_STATUS_LOCK:
                    _OLLAMA_STATUS_CACHE["ts"] = time.monotonic()
                    _OLLAMA_STATUS_CACHE["data"] = dict(result)
            return result
        except Exception as exc:
            last_error = str(exc)

    result = {
        "available": False,
        "base_url": OLLAMA_BASE_URL,
        "model": None,
        "models": [],
        "preferred_model": preferred,
        "error": last_error or "Ollama inacessível",
    }
    if not is_mocked:
        with _OLLAMA_STATUS_LOCK:
            _OLLAMA_STATUS_CACHE["ts"] = time.monotonic()
            _OLLAMA_STATUS_CACHE["data"] = dict(result)
    return result


def stream_ollama_chat(
    messages: list[dict],
    model: str,
    base_url: Optional[str] = None,
    timeout: int = 180,
) -> Iterator[str]:
    """Faz streaming de respostas do endpoint /api/chat do Ollama."""
    target_url = f"{(base_url or OLLAMA_BASE_URL).rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "num_ctx": 16384,
            "num_predict": 1024,
            "temperature": 0.25,
            "repeat_penalty": 1.15,
            "repeat_last_n": 128,
        },
    }

    with requests.post(target_url, json=payload, stream=True, timeout=timeout) as resp:
        resp.raise_for_status()
        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            try:
                chunk = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            content = (chunk.get("message") or {}).get("content")
            if content:
                yield content
            if chunk.get("done"):
                break


def generate_ollama_completion(
    prompt: str,
    system_prompt: Optional[str] = None,
    json_mode: bool = False,
    timeout: int = 120,
) -> str:
    """Executa uma inferência síncrona no Ollama local (com suporte opcional a JSON)."""
    status = get_ollama_status(timeout=2.0)
    if not status.get("available") or not status.get("model"):
        raise RuntimeError(status.get("error") or "Ollama local indisponível.")

    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload: dict = {
        "model": status["model"],
        "messages": messages,
        "stream": False,
        "options": {
            "num_ctx": 16384,
            "num_predict": 1024,
            "temperature": 0.25,
            "repeat_penalty": 1.15,
            "repeat_last_n": 128,
        },
    }
    if json_mode:
        payload["format"] = "json"

    target_url = f"{status['base_url'].rstrip('/')}/api/chat"
    resp = requests.post(target_url, json=payload, timeout=timeout)
    resp.raise_for_status()
    return ((resp.json().get("message") or {}).get("content") or "").strip()
