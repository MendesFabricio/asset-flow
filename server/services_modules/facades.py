# server/services_modules/facades.py
from database.session import Session
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
        session = Session()
        try:
            return run_monte_carlo(session, _fetch_price_history_fn, days, simulations)
        finally:
            Session.remove()

    def get_correlation_matrix(self, session=None):
        """Façade → quant_engine.get_correlation_matrix com Cache"""
        self_close = False
        if session is None:
            session = Session()
            self_close = True
        try:
            cached = self._get_cached_unwrap(f"correlation_matrix_cache_{g.user_id}" if 'g' in globals() and hasattr(g, 'user_id') else "correlation_matrix_cache")
            if cached:
                return cached
            return get_correlation_matrix(session, _fetch_price_history_fn)
        finally:
            if self_close:
                Session.remove()

    def calculate_risk_metrics(self, session=None) -> dict:
        """Façade → quant_engine.calculate_risk_metrics com Cache"""
        self_close = False
        if session is None:
            session = Session()
            self_close = True
        try:
            return calculate_risk_metrics(session, _fetch_price_history_fn)
        finally:
            if self_close:
                Session.remove()

    def calculate_smart_rebalance(self, monthly_contribution: float = 0.0) -> dict:
        """Façade → quant_engine.calculate_smart_rebalance"""
        session = Session()
        try:
            return calculate_smart_rebalance(session, _fetch_price_history_fn, monthly_contribution)
        finally:
            Session.remove()

    def calculate_income_projection(
        self,
        monthly_contribution: float = 1000.0,
        years: int = 20,
        annual_return_pct: float = 12.0,
        annual_dividend_yield_pct: float = 6.0,
    ) -> dict:
        """Façade → quant_engine.calculate_income_projection"""
        session = Session()
        try:
            return calculate_income_projection(
                session,
                monthly_contribution,
                years,
                annual_return_pct,
                annual_dividend_yield_pct,
            )
        finally:
            Session.remove()

    def calculate_risk_parity(self) -> dict:
        """Façade → quant_engine.calculate_risk_parity"""
        session = Session()
        try:
            return calculate_risk_parity(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_markowitz_optimization(self) -> dict:
        """Façade → quant_engine.calculate_markowitz_optimization"""
        session = Session()
        try:
            return calculate_markowitz_optimization(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_sector_exposure(self) -> dict:
        """Façade → quant_engine.calculate_sector_exposure"""
        session = Session()
        try:
            return calculate_sector_exposure(session)
        finally:
            Session.remove()

    def calculate_dividend_forecast(self) -> dict:
        """Façade → quant_engine.calculate_dividend_forecast"""
        session = Session()
        try:
            return calculate_dividend_forecast(session)
        finally:
            Session.remove()

    def calculate_sector_correlation(self) -> dict:
        """Façade → quant_engine.calculate_sector_correlation"""
        session = Session()
        try:
            return calculate_sector_correlation(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_kelly_criterion(self) -> dict:
        """Façade → quant_engine.calculate_kelly_criterion"""
        session = Session()
        try:
            return calculate_kelly_criterion(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_alpha_attribution(self) -> dict:
        """Façade → quant_engine.calculate_alpha_attribution"""
        session = Session()
        try:
            return calculate_alpha_attribution(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_rolling_sharpe(self) -> dict:
        """Façade → quant_engine.calculate_rolling_sharpe"""
        session = Session()
        try:
            return calculate_rolling_sharpe(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_momentum_ranking(self) -> dict:
        """Façade → quant_engine.calculate_momentum_ranking"""
        session = Session()
        try:
            return calculate_momentum_ranking(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_efficient_frontier_points(self) -> dict:
        """Façade → quant_engine.calculate_efficient_frontier_points"""
        session = Session()
        try:
            return calculate_efficient_frontier_points(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def _get_cached_unwrap(self, key, ttl_seconds=3600):
        try:
            import json
            from database.models import SystemCache
            session = Session()
            rec = session.query(SystemCache).filter_by(key=key).first()
            if rec:
                from datetime import datetime, timedelta
                if datetime.now() - rec.updated_at < timedelta(seconds=ttl_seconds):
                    return json.loads(rec.value)
            return None
        except Exception:
            return None
