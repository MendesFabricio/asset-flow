# server/services_modules/cache_helper.py
import json
import logging
from datetime import datetime, timedelta
from database.models import SystemCache, safe_commit
from database.session import Session
from infrastructure.price_cache import invalidate as _invalidate_cache

class CacheHelperService:

    def _invalidate_price_cache(self, session=None):
        _invalidate_cache()
        self_close = False
        if session is None:
            session = Session()
            self_close = True
        try:
            self._invalidate_quant_cache(session)
            safe_commit(session)
        except Exception as e:
            session.rollback()
            logging.warning(f"Falha ao invalidar cache quant no banco: {e}")
        finally:
            if self_close:
                Session.remove()

    def _invalidate_quant_cache(self, session):
        try:
            user_id = getattr(self, "current_user_id", None)
            keys = [
                "risk_metrics", 
                "risk_metrics_cache", 
                "correlation_matrix_cache", 
                "efficient_frontier",
                "optimize_portfolio",
                "risk_parity",
                "morning_brief"
            ]
            if user_id:
                keys_to_del = keys + [f"{k}_{user_id}" for k in keys]
            else:
                keys_to_del = keys
            session.query(SystemCache).filter(SystemCache.key.in_(keys_to_del)).delete()
        except Exception as e:
            logging.warning(f"Falha ao invalidar cache quant: {e}")

    def _get_cached_value(self, session, key, ttl_seconds=3600):
        try:
            user_id = getattr(self, "current_user_id", None)
            if user_id and key in [
                "risk_metrics", 
                "risk_metrics_cache", 
                "correlation_matrix_cache", 
                "efficient_frontier",
                "optimize_portfolio",
                "risk_parity",
                "morning_brief"
            ]:
                key = f"{key}_{user_id}"
            cache = session.query(SystemCache).filter_by(key=key).first()
            if cache and datetime.now() - cache.updated_at < timedelta(seconds=ttl_seconds):
                return json.loads(cache.value)
        except Exception as e:
            logging.warning(f"Erro ao obter cache do banco para {key}: {e}")
        return None

    def _set_cached_value(self, session, key, value):
        try:
            user_id = getattr(self, "current_user_id", None)
            if user_id and key in [
                "risk_metrics", 
                "risk_metrics_cache", 
                "correlation_matrix_cache", 
                "efficient_frontier",
                "optimize_portfolio",
                "risk_parity",
                "morning_brief"
            ]:
                key = f"{key}_{user_id}"
            cache = session.query(SystemCache).filter_by(key=key).first()
            if not cache:
                cache = SystemCache(key=key)
                session.add(cache)
            cache.value = json.dumps(value)
            cache.updated_at = datetime.now()
            safe_commit(session)
        except Exception as e:
            session.rollback()
            logging.warning(f"Erro ao gravar cache no banco para {key}: {e}")
