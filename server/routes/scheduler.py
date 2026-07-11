# server/routes/scheduler.py
from flask import Blueprint, jsonify, request, g
from database.models import Session, ScheduledJob, safe_commit
from datetime import datetime
import logging

scheduler_bp = Blueprint('scheduler', __name__)

@scheduler_bp.route('/jobs', methods=['GET'])
def list_jobs():
    with Session() as session:
        try:
            jobs = session.query(ScheduledJob).order_by(ScheduledJob.name).all()
            return jsonify({
                "status": "Sucesso",
                "data": [{
                    "id": j.id,
                    "name": j.name,
                    "description": j.description,
                    "job_type": j.job_type,
                    "cron_expression": j.cron_expression,
                    "interval_minutes": j.interval_minutes,
                    "is_active": j.is_active,
                    "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
                    # Apresenta "running" para o frontend se o status interno for "pending_manual"
                    "last_run_status": "running" if j.last_run_status == "pending_manual" else j.last_run_status,
                    "last_run_message": j.last_run_message,
                    "created_at": j.created_at.isoformat() if j.created_at else None,
                    "updated_at": j.updated_at.isoformat() if j.updated_at else None,
                } for j in jobs]
            })
        except Exception as e:
            logging.error(f"❌ Erro ao listar jobs: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500

@scheduler_bp.route('/jobs/<int:job_id>/toggle', methods=['POST'])
def toggle_job(job_id):
    with Session() as session:
        try:
            job = session.query(ScheduledJob).filter_by(id=job_id).first()
            if not job:
                return jsonify({"status": "Erro", "msg": "Job não encontrado"}), 404
            
            job.is_active = not job.is_active
            job.updated_at = datetime.utcnow()
            safe_commit(session)
            
            status = "ativado" if job.is_active else "desativado"
            logging.info(f"🔧 Job {job.name} {status} por usuário {g.user_id}")
            return jsonify({
                "status": "Sucesso",
                "msg": f"Job {job.name} {status} com sucesso.",
                "data": {"is_active": job.is_active}
            })
        except Exception as e:
            logging.error(f"❌ Erro ao toggle job {job_id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500

@scheduler_bp.route('/jobs/<int:job_id>', methods=['PUT'])
def update_job(job_id):
    with Session() as session:
        try:
            job = session.query(ScheduledJob).filter_by(id=job_id).first()
            if not job:
                return jsonify({"status": "Erro", "msg": "Job não encontrado"}), 404
            
            data = request.get_json() or {}
            
            if 'cron_expression' in data:
                job.cron_expression = data['cron_expression']
                job.job_type = 'cron'
            if 'interval_minutes' in data:
                job.interval_minutes = int(data['interval_minutes'])
                job.job_type = 'interval'
            if 'is_active' in data:
                job.is_active = bool(data['is_active'])
            
            job.updated_at = datetime.utcnow()
            safe_commit(session)
            
            logging.info(f"🔧 Job {job.name} atualizado por usuário {g.user_id}")
            return jsonify({
                "status": "Sucesso",
                "msg": f"Job {job.name} atualizado com sucesso.",
                "data": {
                    "cron_expression": job.cron_expression,
                    "interval_minutes": job.interval_minutes,
                    "is_active": job.is_active,
                    "job_type": job.job_type,
                }
            })
        except Exception as e:
            logging.error(f"❌ Erro ao atualizar job {job_id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500

@scheduler_bp.route('/jobs/<int:job_id>/run', methods=['POST'])
def run_job(job_id):
    with Session() as session:
        try:
            job = session.query(ScheduledJob).filter_by(id=job_id).first()
            if not job:
                return jsonify({"status": "Erro", "msg": "Job não encontrado"}), 404
            
            # Sinaliza ao worker que uma execução manual foi solicitada
            job.last_run_at = datetime.utcnow()
            job.last_run_status = "pending_manual"
            job.last_run_message = "Execução manual solicitada..."
            job.updated_at = datetime.utcnow()
            safe_commit(session)
            
            logging.info(f"▶️ Job {job.name} executado manualmente por usuário {g.user_id}")
            return jsonify({
                "status": "Sucesso",
                "msg": f"Job {job.name} iniciado com sucesso.",
                "data": {"last_run_at": job.last_run_at.isoformat()}
            })
        except Exception as e:
            logging.error(f"❌ Erro ao executar job {job_id}: {e}", exc_info=True)
            return jsonify({"status": "Erro", "msg": str(e)}), 500
