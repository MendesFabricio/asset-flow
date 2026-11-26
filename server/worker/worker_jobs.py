import logging
from services import PortfolioService
from routes.market import update_market_cache
from routes.alerts_price import check_price_alerts
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
                seen_digest = set()
                lines = []
                for d in upcoming:
                    if not d.asset:
                        continue
                    key = (d.user_id, d.asset.ticker, d.date_com, d.type or 'Provento')
                    if key in seen_digest:
                        continue
                    seen_digest.add(key)
                    lines.append(
                        f"• {d.asset.ticker}: Data-Com {'HOJE' if d.date_com == today else 'AMANHÃ'} "
                        f"({d.type or 'Provento'} · R$ {float(d.total_value or 0):.2f} líquido)"
                    )
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


def scheduled_price_history_sync():
    _run_with_tracking("scheduled_price_history_sync", _do_price_history_sync)


def _do_price_history_sync():
    from db.models import Asset, Category, MarketScreenerItem, Position, Session as DBSession
    from domain.signals.ledger import sync_price_history_from_yf
    from domain.signals.regime import detect_and_persist_market_regime
    with DBSession() as session:
        rows = (
            session.query(Asset.ticker, Category.name)
            .join(Position, Position.asset_id == Asset.id)
            .outerjoin(Category, Asset.category_id == Category.id)
            .filter(Position.quantity > 0)
            .distinct()
            .all()
        )
        pairs_map: dict[str, str] = {}
        for t, c in rows:
            cat_name = c or "Ação"
            if cat_name not in ("Reserva", "Renda Fixa", "Cripto"):
                pairs_map[t.strip().upper()] = cat_name
        for scr in session.query(MarketScreenerItem.ticker, MarketScreenerItem.asset_type).all():
            t_u = (scr.ticker or "").strip().upper()
            cat_name = scr.asset_type or "Ação"
            if t_u and t_u not in pairs_map and cat_name not in ("Reserva", "Renda Fixa", "Cripto"):
                pairs_map[t_u] = cat_name
        pairs = list(pairs_map.items())
        sync_price_history_from_yf(session, pairs, period="2y")
        detect_and_persist_market_regime(session)
        session.commit()


def scheduled_signal_ledger_capture():
    _run_with_tracking("scheduled_signal_ledger_capture", _do_signal_ledger_capture)


def _do_signal_ledger_capture():
    from db.models import Session as DBSession
    from domain.signals.ledger import capture_daily_signals_to_ledger
    with DBSession() as session:
        capture_daily_signals_to_ledger(session)


def scheduled_signal_outcome_audit():
    _run_with_tracking("scheduled_signal_outcome_audit", _do_signal_outcome_audit)


def _do_signal_outcome_audit():
    from db.models import Session as DBSession
    from domain.signals.ledger import audit_matured_signal_outcomes
    with DBSession() as session:
        audit_matured_signal_outcomes(session)


def scheduled_walk_forward_recalibration():
    _run_with_tracking("scheduled_walk_forward_recalibration", _do_walk_forward_recalibration)


def _do_walk_forward_recalibration():
    from db.models import Session as DBSession
    from domain.signals.walk_forward import recalibrate_all_setups
    with DBSession() as session:
        recalibrate_all_setups(session)


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
    "scheduled_price_history_sync": {
        "func": scheduled_price_history_sync,
        "description": "Sincroniza séries diárias Total Return (adj_close_tr), RSI/SMAs e Regime Macro",
        "default_type": "cron",
        "default_cron": "45 18 * * 1-5",
    },
    "scheduled_signal_ledger_capture": {
        "func": scheduled_signal_ledger_capture,
        "description": "Registra pontos de compra calibrados no Signal Ledger",
        "default_type": "cron",
        "default_cron": "15 19 * * 1-5",
    },
    "scheduled_signal_outcome_audit": {
        "func": scheduled_signal_outcome_audit,
        "description": "Audita outcomes reais pós-horizonte (30/90/180/365d) e Brier Score",
        "default_type": "cron",
        "default_cron": "45 19 * * 1-5",
    },
    "scheduled_walk_forward_recalibration": {
        "func": scheduled_walk_forward_recalibration,
        "description": "Recalibra backtest Purged Walk-Forward e Wilson Lower Bounds",
        "default_type": "cron",
        "default_cron": "0 3 * * 0",
    },
}
