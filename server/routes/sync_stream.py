# server/routes/sync_stream.py
"""
routes/sync_stream.py
Canal de streaming Server-Sent Events (SSE) para atualização de progresso
da sincronia de relatórios CVM e indicadores fundamentalistas do Yahoo Finance.
"""
import time
import json
import logging
from flask import Blueprint, Response, stream_with_context
from db.models import get_sync_state_db  # 💡 CORREÇÃO: Importando a função isolada segura

sync_stream_bp = Blueprint('sync_stream', __name__)

@sync_stream_bp.route('/api/sync/stream', methods=['GET'])
def sync_stream():
    """
    📡 STREAM SSE: Transmite eventos em tempo real para o frontend, reduzindo overhead de rede.
    Consome o progresso das tabelas persistentes no SQLite (SyncState) sem prender conexões.
    """
    def event_generator():
        logging.info("🔌 [SSE] Novo cliente conectado ao canal de streaming de progresso.")
        last_payload = {}
        
        # Timeout de 30 minutos (1800s) para evitar locks ou leaks infinitos
        MAX_DURATION = 1800
        start_time = time.monotonic()
        
        try:
            while time.monotonic() - start_time < MAX_DURATION:
                # 💡 CORREÇÃO: Abre e fecha sessões instantaneamente evitando snapshots travados
                cvm_sync = get_sync_state_db("cvm_sync")
                yahoo_sync = get_sync_state_db("yahoo_sync")
                
                current_payload = {
                    "cvm_sync": cvm_sync,
                    "yahoo_sync": yahoo_sync
                }
                
                # Só despacha se houver alteração real de dados
                if current_payload != last_payload:
                    last_payload = current_payload
                    yield f"data: {json.dumps(current_payload)}\n\n"
                
                # Intervalo adaptativo: 300ms quando em processamento (real-time fluido), 2.0s quando ocioso
                is_active = (cvm_sync.get("status") == "processing") or (yahoo_sync.get("status") == "processing")
                sleep_interval = 0.3 if is_active else 2.0
                time.sleep(sleep_interval)
                
            logging.info("🔌 [SSE] Sessão de streaming expirou por limite de tempo máximo (30min).")
            yield "data: {\"status\": \"timeout\", \"message\": \"Conexão SSE renovada.\"}\n\n"
        except GeneratorExit:
            logging.info("🔌 [SSE] Conexão SSE encerrada de forma graciosa pelo cliente.")
        except Exception as e:
            logging.error(f"❌ [SSE] Erro na transmissão do stream de progresso: {e}")

    headers = {
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
    }
    return Response(stream_with_context(event_generator()), mimetype='text/event-stream', headers=headers)

@sync_stream_bp.route('/api/sync-status', methods=['GET'])
def get_sync_status():
    """Retorna o estado pontual de sincronia em JSON."""
    from flask import jsonify
    cvm_sync = get_sync_state_db("cvm_sync")
    yahoo_sync = get_sync_state_db("yahoo_sync")
    return jsonify({
        "status": "Sucesso",
        "message": "Estado de sincronia carregado com sucesso.",
        "cvm_sync": cvm_sync,
        "yahoo_sync": yahoo_sync
    })
