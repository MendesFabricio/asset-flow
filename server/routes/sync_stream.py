"""
routes/sync_stream.py
Canal de streaming Server-Sent Events (SSE) para atualização de progresso
da sincronia de relatórios CVM e indicadores fundamentalistas do Yahoo Finance.
"""
import time
import json
import logging
from flask import Blueprint, Response, stream_with_context


sync_stream_bp = Blueprint('sync_stream', __name__)

@sync_stream_bp.route('/api/sync/stream', methods=['GET'])
def sync_stream():
    """
    📡 STREAM SSE: Transmite eventos em tempo real para o frontend, reduzindo overhead de rede.
    Consome o progresso das tabelas persistentes no SQLite (SyncState).
    """
    from database.session import Session
    from database.models import SyncState

    def get_sync_state_scoped(session, key: str) -> dict:
        state = session.query(SyncState).filter_by(key=key).first()
        if not state:
            return {
                "status": "idle",
                "progress": 0,
                "total": 0,
                "message": "Sistema pronto."
            }
        return {
            "status": state.status,
            "progress": state.progress,
            "total": state.total,
            "message": state.message
        }

    def event_generator():
        logging.info("🔌 [SSE] Novo cliente conectado ao canal de streaming de progresso.")
        last_payload = {}
        
        # Timeout de 30 minutos (1800s) para evitar locks ou leaks infinitos
        MAX_DURATION = 1800
        start_time = time.monotonic()
        
        session = Session()
        try:
            while time.monotonic() - start_time < MAX_DURATION:
                cvm_sync = get_sync_state_scoped(session, "cvm_sync")
                yahoo_sync = get_sync_state_scoped(session, "yahoo_sync")
                
                current_payload = {
                    "cvm_sync": cvm_sync,
                    "yahoo_sync": yahoo_sync
                }
                
                # Só despacha se houver alteração
                if current_payload != last_payload:
                    last_payload = current_payload
                    yield f"data: {json.dumps(current_payload)}\n\n"
                
                session.rollback() # 🔄 Limpa transação de leitura para expirar cache de identidade e ver alterações
                time.sleep(1.0)
                
            logging.info("🔌 [SSE] Sessão de streaming expirou por limite de tempo máximo (30min).")
            yield "data: {\"status\": \"timeout\", \"message\": \"Conexão SSE renovada.\"}\n\n"
        except GeneratorExit:
            logging.info("🔌 [SSE] Conexão SSE encerrada de forma graciosa pelo cliente. Efetuando cleanup do banco.")
        except Exception as e:
            logging.error(f"❌ [SSE] Erro na transmissão do stream de progresso: {e}. Efetuando cleanup do banco.")
        finally:
            Session.remove()  # 🔒 Liberação única da conexão de volta ao pool no encerramento final

    headers = {
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
    }
    return Response(stream_with_context(event_generator()), mimetype='text/event-stream', headers=headers)
