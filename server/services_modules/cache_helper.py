# server/services_modules/cache_helper.py
import json
import logging
import threading
from datetime import datetime
from db.models import SystemCache, safe_commit
from db.session import Session
from infrastructure.price_cache import invalidate as _invalidate_cache

_QUANT_CACHE_PREFIXES = (
    "risk_metrics",
    "risk_metrics_cache",
    "correlation_matrix",
    "correlation_matrix_cache",
    "efficient_frontier",
    "optimize_portfolio",
    "risk_parity",
    "kelly_criterion",
    "alpha_attribution",
    "rolling_sharpe",
    "momentum_ranking",
    "morning_brief",
)
_RECALC_LOCK = threading.Lock()
_RECALC_PENDING_UIDS: set[int] = set()

class CacheHelperService:

    def _invalidate_price_cache(self, session=None):
        _invalidate_cache()
        if session is not None:
            try:
                self._invalidate_quant_cache(session)
                safe_commit(session)
            except Exception as e:
                session.rollback()
                logging.warning(f"Falha ao invalidar cache quant no banco: {e}")
            return
        
        with Session() as session:
            try:
                self._invalidate_quant_cache(session)
                safe_commit(session)
            except Exception as e:
                session.rollback()
                logging.warning(f"Falha ao invalidar cache quant no banco: {e}")

    def _invalidate_quant_cache(self, session):
        user_id = getattr(self, "current_user_id", None)
        try:
            from sqlalchemy import or_
            keys = list(_QUANT_CACHE_PREFIXES)
            if user_id:
                keys_to_del = keys + [f"{k}_{user_id}" for k in keys]
                session.query(SystemCache).filter(SystemCache.key.in_(keys_to_del)).delete(synchronize_session=False)
            else:
                # Worker global: invalida chaves globais e por usuário (ex.: prefix_1)
                session.query(SystemCache).filter(
                    or_(*[SystemCache.key.like(f"{k}%") for k in keys])
                ).delete(synchronize_session=False)
        except Exception as e:
            logging.warning(f"Falha ao invalidar cache quant: {e}")

        if user_id:
            with _RECALC_LOCK:
                if user_id in _RECALC_PENDING_UIDS:
                    return
                _RECALC_PENDING_UIDS.add(user_id)

            def background_recalculate(uid):
                import time
                from db.session import Session
                try:
                    time.sleep(1.0)
                    from services import PortfolioService
                    with Session() as bg_session:
                        svc = PortfolioService()
                        svc.current_user_id = uid
                        logging.info(f"🔄 Recomputando cache quant para usuário {uid} em background...")
                        svc.get_correlation_matrix(session=bg_session, allow_compute=True)
                        svc.calculate_risk_metrics(session=bg_session, allow_compute=True)
                except Exception as bg_e:
                    logging.warning(f"⚠️ Erro ao pré-computar cache: {bg_e}")
                finally:
                    with _RECALC_LOCK:
                        _RECALC_PENDING_UIDS.discard(uid)

            threading.Thread(target=background_recalculate, args=(user_id,), daemon=True).start()

    def _set_cached_value(self, session, key, value):
        try:
            user_id = getattr(self, "current_user_id", None)
            if user_id and key in _QUANT_CACHE_PREFIXES:
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
