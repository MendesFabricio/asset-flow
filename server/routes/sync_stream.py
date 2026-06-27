"""
routes/sync_stream.py
Canal de streaming Server-Sent Events (SSE) para atualização de progresso
da sincronia de relatórios CVM e indicadores fundamentalistas do Yahoo Finance.
"""
import time
import json
import logging
from flask import Blueprint, Response, stream_with_context
from database.models import get_sync_state_db

sync_stream_bp = Blueprint('sync_stream', __name__)

@sync_stream_bp.route('/api/sync/stream', methods=['GET'])
def sync_stream():
    """
    📡 STREAM SSE: Transmite eventos em tempo real para o frontend, reduzindo overhead de rede.
    Consome o progresso das tabelas persistentes no SQLite (SyncState).
    """
    def event_generator():
        logging.info("🔌 [SSE] Novo cliente conectado ao canal de streaming de progresso.")
        last_payload = {}
        
        # Enviamos o primeiro payload imediatamente para sincronizar o estado inicial
        try:
            while True:
                cvm_sync = get_sync_state_db("cvm_sync")
                yahoo_sync = get_sync_state_db("yahoo_sync")
                
                current_payload = {
                    "cvm_sync": cvm_sync,
                    "yahoo_sync": yahoo_sync
                }
                
                # Só despacha pacotes de dados se houver diferença real de progresso
                if current_payload != last_payload:
                    last_payload = current_payload
                    yield f"data: {json.dumps(current_payload)}\n\n"
                
                time.sleep(1.0)
        except GeneratorExit:
            logging.info("🔌 [SSE] Conexão SSE encerrada pelo cliente.")
        except Exception as e:
            logging.error(f"❌ [SSE] Erro na transmissão do stream de progresso: {e}")

    # Retorna o fluxo contínuo com headers específicos para SSE e desativa buffers adicionais do Nginx/Proxy
    headers = {
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',  # Impede buffering do Nginx em ambientes proxyados
    }
    return Response(stream_with_context(event_generator()), mimetype='text/event-stream', headers=headers)
