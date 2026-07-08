# server/services.py
"""
services.py
Serviço unificado de Portfólio (Facade/Orchestrator).
Herda de submódulos modulares em services_modules/ para manter total compatibilidade de API.
"""
import threading
import time
import logging
import yfinance as yf
from datetime import datetime, timedelta
from decimal import Decimal

# Sub-módulos refatorados do novo pacote
from services_modules.cache_helper import CacheHelperService
from services_modules.backup import BackupService
from services_modules.portfolio import PortfolioCrudService
from services_modules.integration import IntegrationService
from services_modules.facades import FacadeService
from services_modules.dashboard import DashboardService
from services_modules.categories import CategoryService
from database.session import Session, session_factory
from database.models import SystemCache, safe_commit

# Mantém as variáveis globais compartilhadas
USD_CACHE = {"rate": Decimal('5.80'), "last_update": 0}
USD_LOCK = threading.Lock()

class PortfolioService(
    CacheHelperService,
    BackupService,
    PortfolioCrudService,
    IntegrationService,
    FacadeService,
    DashboardService,
    CategoryService
):
    _instance = None
    _price_lock = threading.Lock()
    _fundamentals_lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(PortfolioService, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        pass

    @property
    def current_user_id(self):
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'user_id'):
            return g.user_id
        return None

    @property
    def current_username(self):
        from flask import has_request_context, g
        if has_request_context() and hasattr(g, 'username'):
            return g.username
        return None

    def get_usd_rate(self):
        """Retorna a taxa cambial do dólar comercial com cache local/banco de 1 hora"""
        now = time.time()
        with USD_LOCK:
            if (now - USD_CACHE["last_update"]) < 3600:
                return USD_CACHE["rate"]

        session = Session()
        try:
            cache_record = session.query(SystemCache).filter_by(key="usd_rate").first()
            if cache_record:
                age = datetime.now() - cache_record.updated_at
                if age < timedelta(hours=1):
                    rate = Decimal(str(cache_record.value))
                    with USD_LOCK:
                        USD_CACHE["rate"] = rate
                        USD_CACHE["last_update"] = now
                    return rate

            logging.info("🌐 Cache MISS (USD Rate): buscando cotação de BRL=X...")
            ticker = yf.Ticker("BRL=X")
            data = ticker.history(period="1d")
            if not data.empty: 
                rate_val = float(data['Close'].iloc[-1])
                rate = Decimal(str(rate_val))
                
                if not cache_record:
                    cache_record = SystemCache(key="usd_rate", value=str(rate_val), updated_at=datetime.now())
                    session.add(cache_record)
                else:
                    cache_record.value = str(rate_val)
                    cache_record.updated_at = datetime.now()
                safe_commit(session)
                
                with USD_LOCK:
                    USD_CACHE["rate"] = rate
                    USD_CACHE["last_update"] = now
                return rate
                
            if cache_record:
                rate = Decimal(str(cache_record.value))
                with USD_LOCK:
                    USD_CACHE["rate"] = rate
                    USD_CACHE["last_update"] = now
                return rate
        except Exception as e:
            logging.warning(f"⚠️ Erro ao atualizar cotação do Dólar (usando fallback): {e}")
            try:
                db_record = session.query(SystemCache).filter_by(key="usd_rate").first()
                if db_record:
                    return Decimal(str(db_record.value))
            except Exception:
                pass
        # 💡 CORREÇÃO CRÍTICA: Removido o encerramento forçado de sessão para preservar o contexto do chamador
        return USD_CACHE["rate"]
