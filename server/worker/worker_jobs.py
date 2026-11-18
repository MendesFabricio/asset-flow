import logging
from services import PortfolioService
from routes.market import update_market_cache
from routes.alerts_price import check_price_alerts
from routes.simulation import _run_morning_brief_bg, _build_morning_brief_context
from domain.quant.helpers import get_risk_free_rate
from worker_core import _run_with_tracking

service = PortfolioService()

def scheduled_update_prices():
    _run_with_tracking("scheduled_update_prices", _do_update_prices)

def _do_update_prices():
    logging.info("🕒 JOB 10m: Atualizando preços dos ativos...")
    service.update_prices()

def _do_daily_snapshot():
    logging.info("📸 JOB DIÁRIO: Salvando snapshot do portfólio...")
    service.take_daily_snapshot()

def scheduled_daily_snapshot():
    _run_with_tracking("scheduled_daily_snapshot", _do_daily_snapshot)


def scheduled_update_indices():
    _run_with_tracking("scheduled_update_indices", _do_update_indices)

def _do_update_indices():
    update_market_cache()
    fired = check_price_alerts()
    if fired:
        logging.info(f"🔔 {len(fired)} alerta(s) de preço disparado(s) neste ciclo.")

def scheduled_dividends_check():
    _run_with_tracking("scheduled_dividends_check", _do_dividends_check)

def _do_dividends_check():
    logging.info("📅 JOB DIÁRIO: Verificando Dividendos...")
    if hasattr(service, 'record_confirmed_dividends'):
        service.record_confirmed_dividends()

def scheduled_quant_warm():
    _run_with_tracking("scheduled_quant_warm", _do_quant_warm)

def _do_quant_warm():
    logging.info("🔥 JOB 30m: Pré-aquecendo métricas analíticas...")
    service.get_usd_rate()
    service.run_monte_carlo_simulation()
    service.get_correlation_matrix()
    service.calculate_risk_metrics()
    service.calculate_efficient_frontier_points()

def scheduled_morning_brief_generation():
    _run_with_tracking("scheduled_morning_brief_generation", _do_morning_brief)


def scheduled_daily_sentiment_analysis():
    _run_with_tracking("scheduled_daily_sentiment_analysis", _do_daily_sentiment)


def _do_daily_sentiment():
    import time
    from datetime import datetime, timedelta
    logging.info("🧠 JOB 07:30: Atualizando IA Sentiment diário dos ativos ativos...")
    try:
        from db.models import Session as DBSession, Position
        from routes.news import fetch_ticker_news
        from infrastructure.gemini_service import _run_sentiment_analysis

        with DBSession() as session:
            positions = (
                session.query(Position)
                .filter(Position.quantity > 0)
                .all()
            )
            seen_assets = {}
            for pos in positions:
                asset = pos.asset
                if not asset or asset.id in seen_assets:
                    continue
                cat_name = asset.category.name if asset.category else ""
                if cat_name == "Reserva":
                    continue
                seen_assets[asset.id] = (asset, pos)

            now = datetime.now()
            targets = []
            for asset, pos in seen_assets.values():
                if asset.ai_status == "success" and asset.ai_updated_at and (now - asset.ai_updated_at) < timedelta(hours=20):
                    continue
                targets.append((
                    asset.id,
                    asset.ticker,
                    {
                        "quantity": float(pos.quantity or 0.0),
                        "average_price": float(pos.average_price or 0.0),
                        "target_percent": float(pos.target_percent or 0.0),
                    },
                ))

        for asset_id, ticker, pos_info in targets:
            try:
                news_list = fetch_ticker_news(ticker.strip().upper().replace(".SA", ""), limit=5)
                _run_sentiment_analysis(asset_id, ticker, news_list, pos_info)
                time.sleep(1.0)
            except Exception as exc:
                logging.warning(f"⚠️ [IA] Falha ao atualizar sentimento diário de {ticker}: {exc}")
        logging.info(f"✅ [IA] Sentimento diário finalizado ({len(targets)} ativo(s) processado(s)).")
    except Exception as e:
        logging.error(f"❌ [IA] Falha geral no job diário de sentimento: {e}", exc_info=True)

def _do_morning_brief():
    logging.info("☕ JOB 07:00: Gerando Morning Briefing...")
    try:
        from flask import Flask
        from db.models import Session as DBSession, Position
        app = Flask(__name__)
        with app.app_context():
            from flask import g
            with DBSession() as session:
                user_ids = [r[0] for r in session.query(Position.user_id).distinct().all()]
                for uid in user_ids:
                    try:
                        cache_key = f"morning_brief_{uid}"
                        selic = get_risk_free_rate()
                        dolar_rate = service.get_usd_rate()
                        context = _build_morning_brief_context(uid, dolar_rate, selic)
                        _run_morning_brief_bg(uid, context, cache_key)
                    except Exception as e:
                        logging.warning(f"⚠️ [BRIEF] Falha ao gerar brief para usuário {uid}: {e}")
    except Exception as e:
        logging.error(f"❌ [BRIEF] Falha geral no job de Morning Brief: {e}", exc_info=True)


def _do_radar_refresh():
    logging.info("📡 JOB 08:15: Atualizando Radar B3 de Valuation & Fundamentos...")
    try:
        from db.models import Session as DBSession
        from infrastructure.screener_service import refresh_b3_screener
        with DBSession() as session:
            refresh_b3_screener(session)
    except Exception as e:
        logging.error(f"❌ [RADAR] Falha no job diário do Radar B3: {e}", exc_info=True)


def scheduled_radar_refresh():
    _run_with_tracking("scheduled_radar_refresh", _do_radar_refresh)


def scheduled_fundamentals_and_reports():
    _run_with_tracking("scheduled_fundamentals_and_reports", _do_fundamentals_and_reports)


def _do_fundamentals_and_reports():
    logging.info("📊 JOB 12h: Sincronizando relatórios CVM/FNet e fundamentos (VPA, LPA, DY)...")
    try:
        from services import PortfolioService
        svc = PortfolioService()
        svc.sync_reports_with_fnet()
        svc.update_fundamentals()
        logging.info("✅ [AUTO] Relatórios CVM/FNet e fundamentos atualizados com sucesso.")
    except Exception as e:
        logging.error(f"❌ [AUTO] Falha na sincronização automática de relatórios/fundamentos: {e}", exc_info=True)


JOB_REGISTRY = {
    "scheduled_update_indices": {
        "func": scheduled_update_indices,
        "description": "Atualiza índices de mercado e verifica alertas de preço",
        "default_type": "interval",
        "default_interval": 5,
    },
    "scheduled_update_prices": {
        "func": scheduled_update_prices,
        "description": "Atualiza preços de ativos",
        "default_type": "interval",
        "default_interval": 10,
    },
    "scheduled_daily_snapshot": {
        "func": scheduled_daily_snapshot,
        "description": "Salva snapshot diário do portfólio",
        "default_type": "cron",
        "default_cron": "0 23 * * *",
    },
    "scheduled_quant_warm": {
        "func": scheduled_quant_warm,
        "description": "Pré-aquece cache quantitativo: USD rate, Monte Carlo, correlação, risco, fronteira eficiente",
        "default_type": "interval",
        "default_interval": 30,
    },
    "scheduled_dividends_check": {
        "func": scheduled_dividends_check,
        "description": "Registra dividendos confirmados do dia",
        "default_type": "cron",
        "default_cron": "0 8 * * *",
    },
    "scheduled_morning_brief_generation": {
        "func": scheduled_morning_brief_generation,
        "description": "Gera Morning Briefing proativo",
        "default_type": "cron",
        "default_cron": "0 7 * * *",
    },
    "scheduled_daily_sentiment_analysis": {
        "func": scheduled_daily_sentiment_analysis,
        "description": "Atualiza IA Sentiment automático de todos os ativos da carteira (checa a cada 6h ativos pendentes ou >20h)",
        "default_type": "interval",
        "default_interval": 360,
    },
    "scheduled_radar_refresh": {
        "func": scheduled_radar_refresh,
        "description": "Atualiza cache do Radar B3 (Preço Teto, Checklist e Fórmula Mágica)",
        "default_type": "cron",
        "default_cron": "15 8 * * *",
    },
    "scheduled_fundamentals_and_reports": {
        "func": scheduled_fundamentals_and_reports,
        "description": "Sincroniza automaticamente relatórios CVM/FNet e fundamentos (VPA, LPA, DY) a cada 12h",
        "default_type": "interval",
        "default_interval": 720,
    },
}
