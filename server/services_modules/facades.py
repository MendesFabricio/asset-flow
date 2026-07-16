# server/services_modules/facades.py

from db.session import Session
from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn

# Importações explícitas e diretas das funções de domínio matemático
from domain.quant.monte_carlo import run_monte_carlo
from domain.quant.risk import calculate_risk_metrics
from domain.quant.correlation import get_correlation_matrix, calculate_sector_correlation
from domain.quant.rebalance import calculate_smart_rebalance
from domain.quant.projection import calculate_income_projection, calculate_dividend_forecast
from domain.quant.optimization import calculate_markowitz_optimization, calculate_risk_parity, calculate_efficient_frontier_points
from domain.quant.analysis import calculate_kelly_criterion, calculate_alpha_attribution, calculate_rolling_sharpe, calculate_momentum_ranking
from domain.quant.exposure import calculate_sector_exposure

class FacadeService:
    def run_monte_carlo_simulation(self, days: int = 252, simulations: int = 1000) -> dict:
        """Façade → quant_engine.run_monte_carlo"""
        with Session() as session:
            return run_monte_carlo(session, _fetch_price_history_fn, days, simulations)

    def _execute_with_cache(self, session, cache_key, func, allow_compute):
        def _internal(s):
            cached = self._get_cached_unwrap(cache_key)
            if cached:
                return cached
            if not allow_compute:
                return {"status": "Erro", "msg": "Cache MISS and allow_compute is False."}
            result = func(s)
            self._set_cached_value(s, cache_key, result)
            return result
            
        if session is not None:
            return _internal(session)
        with Session() as s:
            return _internal(s)

    def get_correlation_matrix(self, session=None, allow_compute=True):
        """Façade → quant_engine.get_correlation_matrix com Cache"""
        uid = getattr(self, 'current_user_id', None)
        cache_key = f"correlation_matrix_{uid}" if uid else "correlation_matrix"
        return self._execute_with_cache(
            session, cache_key, 
            lambda s: get_correlation_matrix(s, _fetch_price_history_fn, allow_compute), 
            allow_compute
        )

    def calculate_risk_metrics(self, session=None, allow_compute=True) -> dict:
        """Façade → quant_engine.calculate_risk_metrics com Cache"""
        uid = getattr(self, 'current_user_id', None)
        cache_key = f"risk_metrics_{uid}" if uid else "risk_metrics"
        return self._execute_with_cache(
            session, cache_key, 
            lambda s: calculate_risk_metrics(s, _fetch_price_history_fn, allow_compute), 
            allow_compute
        )

    def calculate_smart_rebalance(self, monthly_contribution: float = 0.0) -> dict:
        """Façade → quant_engine.calculate_smart_rebalance"""
        with Session() as session:
            return calculate_smart_rebalance(session, _fetch_price_history_fn, monthly_contribution)

    def calculate_income_projection(
        self,
        monthly_contribution: float = 1000.0,
        years: int = 20,
        annual_return_pct: float = 12.0,
        annual_dividend_yield_pct: float = 6.0,
    ) -> dict:
        """Façade → quant_engine.calculate_income_projection"""
        with Session() as session:
            return calculate_income_projection(
                session,
                monthly_contribution,
                years,
                annual_return_pct,
                annual_dividend_yield_pct,
            )

    def calculate_risk_parity(self) -> dict:
        """Façade → quant_engine.calculate_risk_parity"""
        with Session() as session:
            return calculate_risk_parity(session, _fetch_price_history_fn)

    def calculate_markowitz_optimization(self) -> dict:
        """Façade → quant_engine.calculate_markowitz_optimization"""
        with Session() as session:
            return calculate_markowitz_optimization(session, _fetch_price_history_fn)

    def calculate_sector_exposure(self) -> dict:
        """Façade → quant_engine.calculate_sector_exposure"""
        with Session() as session:
            return calculate_sector_exposure(session)

    def calculate_dividend_forecast(self) -> dict:
        """Façade → quant_engine.calculate_dividend_forecast"""
        with Session() as session:
            return calculate_dividend_forecast(session)

    def calculate_sector_correlation(self) -> dict:
        """Façade → quant_engine.calculate_sector_correlation"""
        with Session() as session:
            return calculate_sector_correlation(session, _fetch_price_history_fn)

    def calculate_kelly_criterion(self) -> dict:
        """Façade → quant_engine.calculate_kelly_criterion"""
        with Session() as session:
            return calculate_kelly_criterion(session, _fetch_price_history_fn)

    def calculate_alpha_attribution(self) -> dict:
        """Façade → quant_engine.calculate_alpha_attribution"""
        with Session() as session:
            return calculate_alpha_attribution(session, _fetch_price_history_fn)

    def calculate_rolling_sharpe(self) -> dict:
        """Façade → quant_engine.calculate_rolling_sharpe"""
        with Session() as session:
            return calculate_rolling_sharpe(session, _fetch_price_history_fn)

    def calculate_momentum_ranking(self) -> dict:
        """Façade → quant_engine.calculate_momentum_ranking"""
        with Session() as session:
            return calculate_momentum_ranking(session, _fetch_price_history_fn)

    def calculate_efficient_frontier_points(self) -> dict:
        """Façade → quant_engine.calculate_efficient_frontier_points"""
        with Session() as session:
            return calculate_efficient_frontier_points(session, _fetch_price_history_fn)

    def _get_cached_unwrap(self, key, ttl_seconds=3600):
        try:
            import json
            from db.models import SystemCache
            session = Session()
            rec = session.query(SystemCache).filter_by(key=key).first()
            if rec:
                from datetime import datetime, timedelta
                if datetime.now() - rec.updated_at < timedelta(seconds=ttl_seconds):
                    return json.loads(rec.value)
            return None
        except Exception:
            return None

    def _set_cached_value(self, session, key, value):
        try:
            import json
            from db.models import SystemCache, safe_commit
            from datetime import datetime
            
            rec = session.query(SystemCache).filter_by(key=key).first()
            if not rec:
                rec = SystemCache(key=key)
                session.add(rec)
            rec.value = json.dumps(value)
            rec.updated_at = datetime.now()
            safe_commit(session)
        except Exception:
            pass
