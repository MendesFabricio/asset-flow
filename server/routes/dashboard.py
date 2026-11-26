# server/routes/dashboard.py
import time
from flask import Blueprint, jsonify, request, current_app, g # ⚡ Injetado current_app e g para escopo de thread
import sys
import os
import logging 
import threading

# Ajuste para importar services da pasta pai
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService
from db.models import DatabaseStateProxy, get_sync_state_db

dashboard_bp = Blueprint('dashboard', __name__)
service = PortfolioService()

# 🧠 MÁQUINA DE ESTADO PERSISTENTE: Monitora o progresso ativo por ativo no Yahoo Finance via SQLite (stateless)
FUNDAMENTALS_STATE = DatabaseStateProxy("yahoo_sync")
CVM_SYNC_STATE = DatabaseStateProxy("cvm_sync")
_cvm_sync_lock = threading.Lock()

# 🚀 STARTUP RECOVERY: Reseta estado "processing" órfão se não houver lock ativo (ex: após reinício do container)
try:
    from db.models import update_sync_state_db, get_sync_state_db as _get_yahoo_state
    if _get_yahoo_state("yahoo_sync").get("status") == "processing":
        logging.warning("⚠️ [STARTUP] Estado orphão 'yahoo_sync' detectado como 'processing'. Resetando para idle.")
        update_sync_state_db("yahoo_sync", status="idle", progress=0, total=0, message="Sistema pronto.")
except Exception as _e:
    logging.warning(f"⚠️ [STARTUP] Falha ao resetar yahoo_sync: {_e}")

def async_fundamentals_worker(flask_app, user_id=None):
    """🛠️ Thread Mestre: Executa a esteira pesada do Yahoo sem prender a requisição HTTP do usuário"""
    with flask_app.app_context():
        try:
            logging.info("⏳ [BACKGROUND TASK] Esteira assíncrona de valuation e dividendos iniciada...")
            result = service.update_fundamentals(state_dict=FUNDAMENTALS_STATE, user_id=user_id)
            
            if result.get("status") == "Sucesso":
                FUNDAMENTALS_STATE.update({
                    "status": "success",
                    "message": result.get("msg", "Inteligência fundamentalista atualizada!")
                })
            else:
                FUNDAMENTALS_STATE.update({
                    "status": "error",
                    "message": result.get("msg", "Falha operacional no pipeline.")
                })
        except Exception as e:
            logging.error(f"❌ Erro catastrófico interno na thread de fundamentos: {e}", exc_info=True)
            FUNDAMENTALS_STATE.update({
                "status": "error",
                "message": f"Erro crítico: {str(e)}"
            })
        finally:
            if service._fundamentals_lock.locked():
                service._fundamentals_lock.release()
            
            # 🔄 RESET AUTOMÁTICO: Agenda a volta ao estado 'idle' após 5 segundos
            def auto_reset():
                time.sleep(5.0)
                FUNDAMENTALS_STATE.update({
                    "status": "idle",
                    "progress": 0,
                    "total": 0,
                    "message": "Sistema pronto."
                })
            threading.Thread(target=auto_reset, daemon=True).start()

@dashboard_bp.route('/api/index', methods=['GET'])
def get_data():
    force = request.args.get('force') == 'true'
    if force:
        uid = getattr(g, 'user_id', None)
        def _bg_update():
            if service._price_lock.acquire(blocking=False):
                try:
                    logging.info("⚡ Atualizando preços em background via requisição force=true...")
                    service.current_user_id = uid
                    service.update_prices(user_id=uid)
                    service.take_daily_snapshot()
                except Exception as e:
                    logging.error(f"⚠️ Falha na atualização de preços: {e}")
                finally:
                    service._price_lock.release()
            else:
                logging.info("⚡ Ignorando update de preços pois já existe uma atualização em andamento.")

        from services import background_task_executor
        background_task_executor.submit(_bg_update)
        
    try:
        data = service.get_dashboard_data()
        return jsonify({
            "status": "Sucesso",
            **data
        })
    except Exception as e:
        logging.error(f"❌ Erro catastrófico ao compilar dados do dashboard: {e}")
        return jsonify({"status": "Erro", "msg": "Não foi possível carregar os dados do painel."}), 500

@dashboard_bp.route('/api/history', methods=['GET'])
def get_history():
    try:
        full = request.args.get("full", "0").lower() in ("1", "true")
        data = service.get_history_data(full=full)
        return jsonify(data)
    except Exception as e:
        logging.error(f"❌ Erro ao buscar histórico patrimonial: {e}")
        return jsonify({"status": "Erro", "msg": "Erro interno ao carregar a timeline histórica."}), 500



@dashboard_bp.route('/api/update-fundamentals', methods=['POST'])
def trigger_fundamentals():
    try:
        # Trava de segurança para impedir disparos concorrentes duplicados
        is_locked = service._fundamentals_lock.locked()
        db_status = FUNDAMENTALS_STATE.get("status")
        
        if db_status == "processing" and not is_locked:
            logging.warning("⚠️ Estado órfão de processamento no Yahoo detectado (sem lock ativo). Forçando reset para idle.")
            FUNDAMENTALS_STATE.update({"status": "idle", "message": "Sistema pronto."})
            db_status = "idle"

        if not service._fundamentals_lock.acquire(blocking=False):
            return jsonify({"status": "Aviso", "msg": "Uma varredura de fundamentos já está em execução."}), 409

        if db_status == "processing":
            service._fundamentals_lock.release()
            return jsonify({"status": "Aviso", "msg": "Uma varredura de fundamentos já está em execução no banco."}), 409

        if request.is_json:
            request.get_json(silent=True) # Imuniza o parser contra payloads fantasmas nulos

        logging.info("📊 Inicializando barramento assíncrono de fundamentos...")
        FUNDAMENTALS_STATE.update({
            "status": "processing",
            "progress": 0,
            "total": 0,
            "message": "Conectando ao Yahoo Finance..."
        })

        # Dispara execução paralela e libera o Flask na hora com HTTP 202
        uid = getattr(g, 'user_id', None)
        threading.Thread(
            target=async_fundamentals_worker,
            args=(current_app._get_current_object(), uid),
            daemon=True
        ).start()

        return jsonify({
            "status": "Sucesso", 
            "msg": "Cálculo de valuation e margens iniciado em segundo plano!"
        }), 202
    except Exception as e:
        logging.error(f"❌ Falha ao orquestrar agendamento de fundamentos: {e}", exc_info=True)
        if service._fundamentals_lock.locked():
            service._fundamentals_lock.release()
        FUNDAMENTALS_STATE.update({
            "status": "error",
            "message": f"Erro crítico: {str(e)}"
        })
        return jsonify({"status": "Erro", "msg": str(e)}), 500


def async_cvm_reports_worker(flask_app, user_id=None):
    """Thread Mestre: Executa a sincronização CVM/FNET sem prender a requisição HTTP do usuário."""
    with flask_app.app_context():
        try:
            logging.info("⏳ [BACKGROUND TASK] Sincronização CVM/FNET iniciada...")
            result = service.sync_reports_with_fnet(state_dict=CVM_SYNC_STATE, user_id=user_id)

            if result.get("status") == "Sucesso":
                CVM_SYNC_STATE.update({
                    "status": "success",
                    "message": result.get("msg", "Relatórios CVM/FNET sincronizados!")
                })
            else:
                CVM_SYNC_STATE.update({
                    "status": "error",
                    "message": result.get("msg", "Falha operacional na sincronização CVM/FNET.")
                })
        except Exception as e:
            logging.error(f"❌ Erro interno na thread CVM/FNET: {e}", exc_info=True)
            CVM_SYNC_STATE.update({
                "status": "error",
                "message": f"Erro crítico: {str(e)}"
            })
        finally:
            if _cvm_sync_lock.locked():
                _cvm_sync_lock.release()

            def auto_reset():
                time.sleep(5.0)
                CVM_SYNC_STATE.update({
                    "status": "idle",
                    "progress": 0,
                    "total": 0,
                    "message": "Sistema pronto."
                })
            threading.Thread(target=auto_reset, daemon=True).start()


@dashboard_bp.route('/api/sync-reports', methods=['POST'])
def trigger_sync_reports():
    try:
        is_locked = _cvm_sync_lock.locked()
        db_status = CVM_SYNC_STATE.get("status")

        if db_status == "processing" and not is_locked:
            logging.warning("⚠️ Estado órfão de processamento na CVM detectado (sem lock ativo). Resetando para idle.")
            CVM_SYNC_STATE.update({"status": "idle", "message": "Sistema pronto."})
            db_status = "idle"

        if not _cvm_sync_lock.acquire(blocking=False):
            return jsonify({"status": "Aviso", "msg": "Uma sincronização CVM/FNET já está em execução."}), 409

        if db_status == "processing":
            _cvm_sync_lock.release()
            return jsonify({"status": "Aviso", "msg": "Uma sincronização CVM/FNET já está em execução no banco."}), 409

        if request.is_json:
            request.get_json(silent=True)

        logging.info("📊 Inicializando barramento assíncrono CVM/FNET...")
        CVM_SYNC_STATE.update({
            "status": "processing",
            "progress": 0,
            "total": 0,
            "message": "Conectando à CVM e B3 FNET..."
        })

        uid = getattr(g, 'user_id', None)
        threading.Thread(
            target=async_cvm_reports_worker,
            args=(current_app._get_current_object(), uid),
            daemon=True
        ).start()

        return jsonify({
            "status": "Sucesso",
            "msg": "Sincronização CVM/FNET iniciada em segundo plano!"
        }), 202
    except Exception as e:
        logging.error(f"❌ Falha ao agendar sincronização CVM/FNET: {e}", exc_info=True)
        if _cvm_sync_lock.locked():
            _cvm_sync_lock.release()
        CVM_SYNC_STATE.update({
            "status": "error",
            "message": f"Erro crítico: {str(e)}"
        })
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@dashboard_bp.route('/api/simulation', methods=['GET'])
def simulation():
    try:
        logging.info("🎲 Requisição recebida. Disparando projeções de Monte Carlo...")
        result = service.run_monte_carlo_simulation()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro ao processar simulação de Monte Carlo na rota: {e}")
        return jsonify({"status": "Erro", "msg": "Falha ao processar simulação estatística."}), 500
