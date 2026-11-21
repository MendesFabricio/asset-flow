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
    logging.info("📸 JOB 4h: Salvando snapshot diário e atualizando mês corrente...")
    service.take_daily_snapshot()
    try:
        from datetime import date
        from db.models import Session as DBSession, User
        from db.models.system import prune_expired_system_cache
        from domain.portfolio.monthly_snapshot import generate_or_update_monthly_snapshot, build_historical_price_cache
        today = date.today()
        with DBSession() as session:
            for u in session.query(User).all():
                cache = build_historical_price_cache(session, u.id)
                generate_or_update_monthly_snapshot(session, u.id, today.year, today.month, price_cache=cache)
            session.commit()
        prune_expired_system_cache(max_age_days=7)
    except Exception as e:
        logging.warning(f"⚠️ Falha ao atualizar MonthlyPortfolioSnapshot do mês corrente: {e}")

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
    try:
        from datetime import date, datetime, timedelta
        from db.models import Dividend, SystemCache, safe_commit
        from db.session import Session as DBSession
        from utils.notifier import format_alert_telegram, is_telegram_configured, send_telegram_message

        if not is_telegram_configured():
            return
        today = date.today()
        digest_key = f"telegram_datacom_digest_{today.isoformat()}"
        with DBSession() as session:
            if session.query(SystemCache).filter_by(key=digest_key).first():
                return
            upcoming = (
                session.query(Dividend)
                .filter(
                    Dividend.date_com >= today,
                    Dividend.date_com <= today + timedelta(days=1),
                )
                .all()
            )
            if upcoming:
                lines = [
                    f"• {d.asset.ticker}: Data-Com {'HOJE' if d.date_com == today else 'AMANHÃ'} "
                    f"({d.type or 'Provento'} · R$ {float(d.total_value or 0):.2f} líquido)"
                    for d in upcoming if d.asset
                ]
                if lines:
                    send_telegram_message(
                        format_alert_telegram("⏰ Data-Com Próxima — AssetFlow", lines)
                    )
            session.add(SystemCache(key=digest_key, value="sent", updated_at=datetime.now()))
            safe_commit(session)
    except Exception as exc:
        logging.warning(f"⚠️ Falha no digest diário de Data-Com (Telegram): {exc}")

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


def scheduled_database_backup():
    _run_with_tracking("scheduled_database_backup", _do_database_backup)


def _do_database_backup():
    from db.models.system import prune_expired_system_cache
    logging.info("💾 JOB DIÁRIO: Executando backup do banco SQLite e limpeza de cache expirado...")
    service._backup_database()
    prune_expired_system_cache(max_age_days=7)


def scheduled_news_summary_warm():
    _run_with_tracking("scheduled_news_summary_warm", _do_news_summary_warm)


def _do_news_summary_warm():
    from flask import Flask, g
    from db.models import Session as DBSession, User
    from routes.news import get_daily_sector_summary

    logging.info("📰 JOB 07:30: Pré-aquecendo resumo diário de notícias IA...")
    tmp_app = Flask(__name__)
    with DBSession() as session:
        user_ids = [r[0] for r in session.query(User.id).all()]
    for uid in user_ids or [1]:
        with tmp_app.test_request_context('/api/news/daily-summary'):
            g.user_id = uid
            get_daily_sector_summary()


JOB_REGISTRY = {
    "scheduled_update_indices": {
        "func": scheduled_update_indices,
        "description": "Atualiza índices (IBOV, IFIX, Dólar) e verifica alertas de preço",
        "default_type": "interval",
        "default_interval": 5,
    },
    "scheduled_update_prices": {
        "func": scheduled_update_prices,
        "description": "Atualiza cotações de mercado de todos os ativos da carteira",
        "default_type": "interval",
        "default_interval": 10,
    },
    "scheduled_daily_snapshot": {
        "func": scheduled_daily_snapshot,
        "description": "Salva snapshot diário do portfólio, sinais e evolução mensal",
        "default_type": "interval",
        "default_interval": 240,
    },
    "scheduled_quant_warm": {
        "func": scheduled_quant_warm,
        "description": "Pré-aquece cache quantitativo: USD rate, Monte Carlo, correlação, risco e fronteira eficiente",
        "default_type": "interval",
        "default_interval": 60,
    },
    "scheduled_dividends_check": {
        "func": scheduled_dividends_check,
        "description": "Sincroniza proventos confirmados e envia alertas de novos anúncios e Data-Com",
        "default_type": "cron",
        "default_cron": "0 8,19 * * *",
    },
    "scheduled_morning_brief_generation": {
        "func": scheduled_morning_brief_generation,
        "description": "Gera Morning Briefing diário com IA para a carteira",
        "default_type": "cron",
        "default_cron": "0 7 * * *",
    },
    "scheduled_news_summary_warm": {
        "func": scheduled_news_summary_warm,
        "description": "Pré-aquece resumo diário de notícias por setor (Ações, FIIs e Cripto)",
        "default_type": "cron",
        "default_cron": "30 7 * * *",
    },
    "scheduled_daily_sentiment_analysis": {
        "func": scheduled_daily_sentiment_analysis,
        "description": "Atualiza IA Sentiment automático de todos os ativos da carteira (a cada 6h)",
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
        "description": "Sincroniza relatórios CVM/FNet e fundamentos (VPA, LPA, DY) a cada 12h",
        "default_type": "interval",
        "default_interval": 720,
    },
    "scheduled_database_backup": {
        "func": scheduled_database_backup,
        "description": "Executa backup diário do banco SQLite e limpa caches expirados",
        "default_type": "cron",
        "default_cron": "30 23 * * *",
    },
}
