"""
infrastructure/market_data.py
Lógica de scraping e integração com APIs externas (Yahoo Finance, CVM, B3 Fnet).
Desacoplada de services.py para manter a arquitetura limpa.
"""
import logging
import traceback
import json
import time
from datetime import datetime, timedelta
import yfinance as yf
from db.models import Asset, Position, Category, MarketData
from utils.ticker_helper import to_yf_ticker

def _active_assets_query(session, user_id=None):
    """Return distinct Asset query restricted to currently held positions (quantity > 0)."""
    query = session.query(Asset).join(Position).filter(Position.quantity > 0)
    if user_id is not None:
        query = query.filter(Position.user_id == user_id)
    return query.distinct()


def collect_amortization_12m_map(session, cutoff_date, user_id=None) -> dict[str, float]:
    """Soma amortizações por cota (AMORTIZATION) na janela de 12m por ticker."""
    from db.models import AssetTransaction

    query = session.query(AssetTransaction).filter(
        AssetTransaction.type == "AMORTIZATION",
        AssetTransaction.transaction_date >= cutoff_date,
    )
    if user_id is not None:
        query = query.filter(AssetTransaction.user_id == user_id)

    amort_map: dict[str, float] = {}
    seen_events: set[tuple] = set()
    for tx in query.all():
        tkr = (getattr(tx, "ticker", None) or "").strip().upper()
        unit_p = float(getattr(tx, "unit_price", 0) or 0)
        if not tkr or unit_p <= 0:
            continue
        if user_id is None:
            tx_dt = tx.transaction_date.date() if tx.transaction_date else None
            ev_key = (tkr, tx_dt, getattr(tx, "corporate_event_id", None) or tx.id)
            if ev_key in seen_events:
                continue
            seen_events.add(ev_key)
        amort_map[tkr] = amort_map.get(tkr, 0.0) + unit_p
    return amort_map


def _extract_vpa_from_report_json(raw_report):
    """Extrai VPA (R$) salvo em last_report_type de FII quando disponível."""
    if not raw_report:
        return 0.0
    try:
        parsed = json.loads(raw_report)
        cards = (parsed.get("fundamentalist") or {}).get("cards_indicadores") or []
        for card in cards:
            if card.get("titulo") == "VPA":
                val = str(card.get("valor_formatado", "")).replace("R$", "").replace(",", ".").strip()
                num = float(val)
                if num > 0:
                    return round(num, 2)
    except Exception as exc:
        logging.debug(f"Extract VPA report fallback: {exc}")
    return 0.0

def update_prices(session, invalidate_cache_callback, user_id=None):
    import pandas as pd
    from utils.http_client import get_secure_session
    logging.info(" odds 🔄 JOB: Iniciando atualização automática de cotações...")
    try:
        secure_session = get_secure_session(timeout=10.0)
        assets = _active_assets_query(session, user_id).filter(Asset.ticker != 'Nubank Caixinha').all()
        tickers_map = {}
        download_list = []

        for asset in assets:
            ticker_raw = asset.ticker.strip().upper()
            cat_name = asset.category.name if asset.category else ''
            if cat_name == "Reserva" or len(ticker_raw) > 7 or " " in ticker_raw or ticker_raw in {"BTC", "ETH", "BITCOIN", "ETHEREUM"}:
                logging.info(f"   ℹ️ {ticker_raw} ignorado por escopo (Regra: Manual/Reserva/Longo)")
                continue

            symbol = to_yf_ticker(ticker_raw, cat_name)
            tickers_map[symbol] = asset
            download_list.append(symbol)

        if not download_list:
            return

        batch_data = yf.download(download_list, period="6mo", group_by='ticker', threads=False, progress=False, auto_adjust=False, session=secure_session)

        count_ok = 0
        asset_ids = [asset.id for asset in assets]
        existing_mdata = {}
        all_mdata = (
            session.query(MarketData)
            .filter(MarketData.asset_id.in_(asset_ids))
            .order_by(MarketData.date.desc(), MarketData.id.desc())
            .all()
        )
        for m in all_mdata:
            if m.asset_id not in existing_mdata:
                existing_mdata[m.asset_id] = m
            else:
                session.delete(m)

        for symbol, asset in tickers_map.items():
            try:
                hist = pd.DataFrame()
                if isinstance(batch_data.columns, pd.MultiIndex):
                    if symbol in batch_data.columns.levels[0]:
                        hist = batch_data[symbol]
                else:
                    if len(download_list) == 1:
                        hist = batch_data
                    elif symbol in batch_data.columns:
                        hist = batch_data[symbol]

                if hist.empty or 'Close' not in hist.columns:
                    logging.info(f"🔄 Fallback individual para {symbol}...")
                    hist = yf.Ticker(symbol, session=secure_session).history(period="6mo")

                if hist.empty:
                    continue

                hist = hist.dropna(subset=['Close'])

                if hist.empty:
                    continue

                current_price = float(hist['Close'].iloc[-1])
                absolute_min_6m = float(hist['Low'].min())

                change_pct = 0.0
                if len(hist) >= 2:
                    prev_close = float(hist['Close'].iloc[-2])
                    if prev_close > 0:
                        change_pct = ((current_price - prev_close) / prev_close) * 100

                mdata = existing_mdata.get(asset.id)
                if not mdata:
                    mdata = MarketData(asset_id=asset.id)
                    session.add(mdata)

                mdata.price = current_price
                mdata.min_6m = absolute_min_6m
                mdata.change_percent = change_pct
                mdata.date = hist.index[-1].date()
                count_ok += 1

            except Exception:
                continue

        session.commit()
        logging.info(f"🏁 Atualização finalizada com sucesso: {count_ok} ativos processados.")
        invalidate_cache_callback()
    except Exception as e:
        session.rollback()
        logging.error(f"❌ Erro ao atualizar cotações no banco: {e}")

def validate_ticker_on_yahoo(ticker):
    from utils.http_client import get_secure_session
    secure_session = get_secure_session(timeout=10.0)
    try:
        ticker = ticker.upper().strip() 
        try:
            stock = yf.Ticker(ticker, session=secure_session)
            hist = stock.history(period="1d")
            if not hist.empty:
                price = float(hist['Close'].iloc[-1])
                return {"valid": True, "ticker": ticker, "price": price}
        except Exception as exc:
            logging.debug(f"Ticker {ticker} sem sufixo falhou, testando .SA: {exc}")
            
        if not ticker.endswith('.SA'):
            ticker_sa = f"{ticker}.SA"
            stock_sa = yf.Ticker(ticker_sa, session=secure_session)
            hist_sa = stock_sa.history(period="1d")
            if not hist_sa.empty:
                price = float(hist_sa['Close'].iloc[-1])
                return {"valid": True, "ticker": ticker, "price": price} 
            
        return {"valid": False, "ticker": None}
    except Exception as e:
        logging.error(f"Erro ao validar existência do ticker {ticker} no Yahoo: {e}")
        return {"valid": False, "ticker": None}

def update_fundamentals(dolar_rate_callback, state_dict=None, user_id=None):
    from db.session import Session
    from db.models import safe_commit
    from utils.http_client import get_secure_session
    
    logging.info("📊 JOB: Calculando Fundamentos via Yahoo Finance...")
    
    cutoff_date = datetime.now() - timedelta(days=365)
    # 1. Busca os IDs e metadados mínimos apenas dos ativos em carteira (quantity > 0)
    session = Session()
    assets_info = []
    amort_12m_map: dict[str, float] = {}
    try:
        assets = (
            _active_assets_query(session, user_id)
            .join(Category)
            .filter(Category.name.in_(['Ação', 'FII', 'Internacional', 'ETF', 'BDR']))
            .all()
        )
        for asset in assets:
            assets_info.append({
                "id": asset.id,
                "ticker": asset.ticker,
                "category_name": asset.category.name if asset.category else '',
                "currency": asset.currency,
                "cvm_code": asset.cvm_code or "",
            })
        amort_12m_map = collect_amortization_12m_map(session, cutoff_date, user_id=user_id)
    finally:
        Session.remove()

    total = len(assets_info)
    if state_dict is not None:
        state_dict["total"] = total
        state_dict["progress"] = 0
        state_dict["message"] = f"Mapeando {total} ativos de renda variável..."

    dolar_rate = dolar_rate_callback()
    consecutive_failures = 0
    count = 0
    secure_session = get_secure_session(timeout=15.0)
    
    updates_batch = []
    cvm_equity_map: dict[str, float] = {}
    cvm_codes = sorted({
        a["cvm_code"].zfill(6)
        for a in assets_info
        if a.get("cvm_code") and a.get("category_name") == "Ação"
    })
    if cvm_codes:
        try:
            from utils.cvm_processor import CVMProcessor
            for item in CVMProcessor.get_historical_summary(cvm_codes, years_back=1):
                pl = float((item.get("valores") or {}).get("patrimonio_liquido") or 0)
                if pl > 0:
                    cvm_equity_map[item["cvm_code"]] = pl
        except Exception as cvm_err:
            logging.warning(f"⚠️ Erro ao pré-carregar PL da CVM para VPA: {cvm_err}")

    for asset_data in assets_info:
        asset_id = asset_data["id"]
        ticker_raw = asset_data["ticker"].strip().upper()
        category_name = asset_data["category_name"]
        currency = asset_data["currency"]

        if category_name == "Reserva" or len(ticker_raw) > 7 or " " in ticker_raw or ticker_raw in {"BTC", "ETH", "BITCOIN", "ETHEREUM"}:
            count += 1
            if state_dict is not None:
                state_dict["progress"] = count
            continue

        try:
            ticker_symbol = to_yf_ticker(ticker_raw, category_name)
            is_intl = (currency == 'USD') if currency else (
                category_name in ('Internacional', 'ETF', 'BDR')
            )
                
            if state_dict is not None:
                state_dict["message"] = f"Analisando {ticker_raw} ({count + 1}/{total})"

            # Chamadas de rede fora da transação de banco de dados
            start_ticker_time = time.monotonic()
            y_asset = yf.Ticker(ticker_symbol, session=secure_session)
            
            current_price = 0
            try:
                if hasattr(y_asset, 'fast_info') and y_asset.fast_info.last_price:
                    current_price = y_asset.fast_info.last_price
            except Exception as e:
                logging.warning(f"⚠️ Erro ao obter fast_info para {ticker_raw}: {e}")

            if current_price <= 0:
                try:
                    hist = y_asset.history(period="1d")
                    if not hist.empty: current_price = hist['Close'].iloc[-1]
                except Exception as e:
                    logging.warning(f"⚠️ Erro ao obter history para {ticker_raw}: {e}")

            if current_price <= 0:
                count += 1
                if state_dict is not None: state_dict["progress"] = count
                continue

            divs = None
            try:
                divs = y_asset.dividends
            except Exception as e:
                logging.warning(f"⚠️ Erro ao obter dividendos para {ticker_raw}: {e}")

            total_divs_val = 0.0
            if divs is not None and not divs.empty:
                try:
                    divs.index = divs.index.tz_localize(None)
                    divs_last_12m = divs[divs.index >= cutoff_date]
                    raw_divs_val = float(divs_last_12m.sum())
                    total_divs_val = max(0.0, raw_divs_val - amort_12m_map.get(ticker_raw, 0.0))
                except Exception as e:
                    logging.warning(f"⚠️ Erro ao computar soma de dividendos para {ticker_raw}: {e}")

            dy_calculated = total_divs_val / current_price if current_price > 0 else 0
            
            lpa = 0
            vpa = 0
            market_cap = 0
            try:
                info = y_asset.info
                lpa = info.get('trailingEps') or info.get('forwardEps') or 0
                vpa = info.get('bookValue') or 0
                market_cap = info.get('marketCap') or 0
            except Exception as e:
                logging.warning(f"⚠️ Erro ao obter info para {ticker_raw}: {e}")

            if is_intl and not ticker_symbol.endswith('.SA'):
                lpa *= dolar_rate
                vpa *= dolar_rate

            cvm_code = (asset_data.get("cvm_code") or "").zfill(6) if asset_data.get("cvm_code") else ""
            yahoo_pvp = (float(current_price) / float(vpa)) if vpa and current_price > 0 else 0.0
            if (
                category_name == "Ação"
                and cvm_code in cvm_equity_map
                and market_cap > 0
                and current_price > 0
                and (vpa <= 0 or yahoo_pvp < 0.25)
            ):
                # Fallback/override via CVM Equity / MarketCap when Yahoo bookValue is missing or Unit-distorted (e.g. SAPR4)
                vpa = float(current_price) * (cvm_equity_map[cvm_code] / float(market_cap))

            # Check for upcoming splits
            upcoming_split_val = None
            try:
                splits = y_asset.splits
                if not splits.empty:
                    today_date = datetime.now().date()
                    future_splits = splits[splits.index.date >= today_date]
                    if not future_splits.empty:
                        fut_date = future_splits.index[0].date()
                        fut_ratio = float(future_splits.iloc[0])
                        upcoming_split_val = f"{fut_date}:{fut_ratio}"
            except Exception as split_err:
                logging.warning(f"Erro ao verificar splits para {ticker_raw}: {split_err}")

            duration_ticker = time.monotonic() - start_ticker_time
            logging.info(f"⏱️ Chamadas yfinance para {ticker_raw} processadas em {duration_ticker:.2f}s")

            # Armazena os dados para o update em batch posterior
            updates_batch.append({
                "asset_id": asset_id,
                "upcoming_split": upcoming_split_val,
                "lpa": lpa,
                "vpa": vpa,
                "dy_calculated": dy_calculated
            })
            consecutive_failures = 0 # Reseta após sucesso real
                
            count += 1
            if state_dict is not None:
                state_dict["progress"] = count
                
        except Exception as e:
            consecutive_failures += 1
            err_msg = str(e)
            logging.warning(f"   ⚠️ Falha em {ticker_raw} (consecutivas: {consecutive_failures}): {err_msg}")
            
            if "429" in err_msg or "too many requests" in err_msg.lower() or "rate limit" in err_msg.lower():
                raise Exception("Yahoo Finance instável (Erro 429/Bloqueio). Limite de requisições excedido. Tente novamente mais tarde.")
            
            if consecutive_failures >= 5:
                raise Exception("Múltiplas falhas consecutivas ao conectar ao Yahoo Finance. Sincronização interrompida para segurança.")
            
            count += 1
            if state_dict is not None: state_dict["progress"] = count
            
    # 3. Aplica todos os updates acumulados em uma única sessão atômica
    if updates_batch:
        session = Session()
        try:
            for upd in updates_batch:
                db_asset = session.query(Asset).filter_by(id=upd["asset_id"]).first()
                if db_asset:
                    db_asset.upcoming_split = upd["upcoming_split"]
                    for pos in db_asset.positions:
                        if pos.quantity <= 0:
                            continue
                        if user_id is not None and pos.user_id != user_id:
                            continue
                        if upd["lpa"] != 0: pos.manual_lpa = round(upd["lpa"], 2)
                        is_fii = db_asset.category and db_asset.category.name == "FII"
                        report_vpa = _extract_vpa_from_report_json(pos.last_report_type) if is_fii else 0.0
                        if is_fii and report_vpa > 0:
                            pos.manual_vpa = round(report_vpa, 2)
                        elif upd["vpa"] != 0:
                            pos.manual_vpa = round(upd["vpa"], 2)
                        if upd["dy_calculated"] >= 0:
                            pos.manual_dy = round(upd["dy_calculated"], 4)
            safe_commit(session)
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro no bulk update de fundamentos: {e}")
        finally:
            Session.remove()

    logging.info(f"🏁 Varredura fundamentalista concluída: {count} registros atualizados no banco em lote.")
    return {"status": "Sucesso", "msg": f"Sucesso! {total} ativos reavaliados via Yahoo Finance."}

def sync_reports_with_fnet(session, state_dict=None, user_id=None):
    from crawlers.b3_fnet import B3FnetCrawler
    from utils.cnpj_finder import CNPJFinder
    from utils.cvm_finder import CVMFinder 
    from utils.cvm_processor import CVMProcessor
    from utils.fii_processor import FIIProcessor
    from utils.http_client import get_secure_session

    secure_session = get_secure_session()

    try:
        query = session.query(Position).join(Asset).join(Category).filter(
            Position.quantity > 0,
            Category.name.in_(["FII", "Ação"])
        )
        if user_id is not None:
            query = query.filter(Position.user_id == user_id)
        assets_to_sync = query.all()

        total_assets = len(assets_to_sync)
        if state_dict is not None:
            state_dict.update({
                "status": "processing",
                "total": total_assets,
                "progress": 0,
                "message": f"Iniciando sincronização de {total_assets} ativos..."
            })

        count_fii = 0
        count_acao = 0

        for index, pos in enumerate(assets_to_sync):
            asset = pos.asset
            ticker = asset.ticker.replace(".SA", "").strip().upper()
            is_fii = asset.category.name == "FII"
            
            if state_dict is not None:
                state_dict.update({
                    "progress": index + 1,
                    "message": f"Sincronizando {ticker} ({index + 1}/{total_assets})..."
                })
            
            if not asset.name or asset.name.strip().upper() == ticker:
                try:
                    yf_symbol = ticker if asset.currency == "USD" else f"{ticker}.SA"
                    info = yf.Ticker(yf_symbol, session=secure_session).info or {}
                    raw_name = info.get("shortName") or info.get("longName")
                    if raw_name:
                        asset.name = " ".join(str(raw_name).split())
                except Exception as exc:
                    logging.debug(f"Yahoo name fallback {ticker}: {exc}")

            if not asset.cnpj or len(str(asset.cnpj)) < 14:
                cnpj_encontrado = CNPJFinder.find_by_ticker(ticker)
                if cnpj_encontrado:
                    asset.cnpj = cnpj_encontrado

            if not is_fii and asset.cnpj and (not asset.cvm_code or asset.cvm_code == ""):
                cnpj_limpo = "".join(filter(str.isdigit, str(asset.cnpj)))
                codigo_cvm = CVMFinder.find_code(cnpj_limpo)
                if codigo_cvm:
                    asset.cvm_code = codigo_cvm
                    logging.info(f"✅ Código CVM Vinculado: {ticker} -> {codigo_cvm}")

            if is_fii and asset.cnpj:
                doc_package = B3FnetCrawler.get_documents_package(asset.cnpj)
                if doc_package:
                    # Tenta processar o informe mensal do FII para extrair indicadores de saúde
                    fii_indicators = None
                    fii_leverage_pct = None
                    mensal = doc_package.get('mensal')
                    if mensal and mensal.get('link'):
                        try:
                            fii_data = FIIProcessor.parse_informe_mensal(mensal['link'])
                            if fii_data:
                                mdata = asset.market_data[0] if asset.market_data else None
                                price = float(mdata.price) if mdata and mdata.price else 0.0
                                t_info = fii_data.get('ticker_info') or {}
                                vpa = t_info.get('vpa', 0.0) or 0.0
                                if vpa > 0:
                                    pos.manual_vpa = round(vpa, 2)
                                p_vp = price / vpa if vpa > 0 else 0.0
                                fii_leverage_pct = round(float(t_info.get('alavancagem') or 0.0), 2)

                                fii_indicators = {
                                    "ticker_info": {
                                        "ultimo_periodo": mensal.get('ref_date', 'Mensal'),
                                        "data_base": mensal.get('date', ''),
                                        "segmento": t_info.get('segmento', 'N/A'),
                                        "gestao": t_info.get('gestao', 'N/A'),
                                        "alavancagem": fii_leverage_pct,
                                    },
                                    "cards_indicadores": [
                                        { "titulo": "P/VP", "valor_formatado": f"{p_vp:.2f}", "tipo": "eficiencia" },
                                        { "titulo": "VPA", "valor_formatado": f"R$ {vpa:.2f}", "tipo": "eficiencia" },
                                        { "titulo": "DY Mensal (XML)", "valor_formatado": fii_data["indicadores"].get("DY Mensal (XML)", "0.00%"), "tipo": "rentabilidade" },
                                        { "titulo": "Patrimônio Líquido", "valor": t_info.get("patrimonio"), "tipo": "rentabilidade" },
                                        { "titulo": "Disponibilidades (Caixa)", "valor": fii_data["raw_xml_data"].get("disponibilidades"), "tipo": "caixa", "subtitulo": f"{t_info.get('caixa_pct', 0):.2f}% do PL" },
                                        { "titulo": "Passivo Total", "valor": fii_data["raw_xml_data"].get("total_passivo"), "tipo": "risco", "subtitulo": f"Alavancagem: {fii_leverage_pct:.2f}%" },
                                    ],
                                    "evolucao_grafico": []
                                }
                        except Exception as fii_err:
                            logging.warning(f"⚠️ Erro ao processar XML de FII {ticker}: {fii_err}")

                    prev_rep = {}
                    if pos.last_report_type:
                        try:
                            prev_rep = json.loads(pos.last_report_type) or {}
                        except Exception:
                            prev_rep = {}
                    combined = {
                        "reports": list(doc_package.values()),
                        "fundamentalist": fii_indicators
                    }
                    if fii_leverage_pct is not None:
                        combined["credit_risk"] = {"leverage_pct": fii_leverage_pct}
                    elif prev_rep.get("credit_risk"):
                        combined["credit_risk"] = prev_rep["credit_risk"]
                    if prev_rep.get("pdf_kpis"):
                        combined["pdf_kpis"] = prev_rep["pdf_kpis"]
                    pos.last_report_type = json.dumps(combined)
                    
                    gerencial = doc_package.get('gerencial')
                    pos.last_report_url = gerencial["link"] if gerencial else list(doc_package.values())[0]["link"]
                    datas = [f"{k[0].upper()}: {v['ref_date']}" for k, v in doc_package.items() if 'ref_date' in v]
                    pos.last_report_at = " | ".join(datas)
                    count_fii += 1
                time.sleep(0.3)

            elif not is_fii and asset.cvm_code:
                try:
                    analise_completa = CVMProcessor.get_dashboard_data(asset.cvm_code)
                    doc_links = None
                    try:
                        from crawlers.cvm_enet import CVMEnetCrawler
                        doc_links = CVMEnetCrawler.get_documents(asset.cvm_code)
                    except Exception as enet_err:
                        logging.warning(f"⚠️ Erro ao buscar links de relatórios da CVM para {ticker}: {enet_err}")

                    combined = {
                        "fundamentalist": analise_completa,
                        "reports": list(doc_links.values()) if doc_links else []
                    }
                    pos.last_report_type = json.dumps(combined)
                    pos.last_report_url = list(doc_links.values())[0]["link"] if doc_links else (pos.last_report_url or "")
                    
                    datas = []
                    if doc_links:
                        datas = [f"{k[0].upper()}: {v['ref_date']}" for k, v in doc_links.items() if 'ref_date' in v]
                    if analise_completa:
                        datas.append(f"Balanço: {analise_completa['ticker_info']['ultimo_periodo']}")
                        
                    pos.last_report_at = " | ".join(datas)
                    count_acao += 1
                    logging.info(f"📊 Análise fundamentalista CVM salva para: {ticker}")
                except Exception as e:
                    logging.warning(f"⚠️ Falha no motor CVM para o papel {ticker}: {e}")

            # 🔒 COMMIT INCREMENTAL: Salva e libera o lock de escrita do SQLite a cada ativo
            try:
                from db.models import safe_commit
                safe_commit(session)
            except Exception as commit_err:
                logging.error(f"❌ Erro ao commitar sincronização de {ticker}: {commit_err}")
                session.rollback()

        return {
            "status": "Sucesso", 
            "msg": f"FIIs: {count_fii} ativos. Ações: {count_acao} fundamentadas."
        }

    except Exception as e:
        session.rollback()
        logging.error(f"🔥 Erro grave na esteira de sincronização FNET/CVM: {traceback.format_exc()}")
        return {"status": "Erro", "msg": str(e)}
