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
from database.models import Asset, Position, Category, MarketData
from utils.ticker_helper import to_yf_ticker

def update_prices(session, invalidate_cache_callback):
    import pandas as pd
    logging.info(" odds 🔄 JOB: Iniciando atualização automática de cotações...")
    try:
        assets = session.query(Asset).filter(Asset.ticker != 'Nubank Caixinha').all()
        tickers_map = {}
        download_list = []

        for asset in assets:
            ticker_raw = asset.ticker.strip().upper()
            
            if len(ticker_raw) > 7 or " " in ticker_raw:
                logging.info(f"   ℹ️ {ticker_raw} ignorado por escopo (Regra: Manual/Longo)")
                continue

            symbol = to_yf_ticker(ticker_raw, asset.category.name if asset.category else '')
            tickers_map[symbol] = asset
            download_list.append(symbol)

        if not download_list:
            return

        batch_data = yf.download(download_list, period="6mo", group_by='ticker', threads=True, progress=False, auto_adjust=True)

        count_ok = 0
        existing_mdata = {
            m.asset_id: m for m in session.query(MarketData).all()
        }

        for symbol, asset in tickers_map.items():
            try:
                hist = pd.DataFrame()
                if symbol in batch_data.columns:
                    hist = batch_data[symbol]
                else:
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
                mdata.date = datetime.now()
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
    try:
        ticker = ticker.upper().strip() 
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1d")
        if not hist.empty: return {"valid": True, "ticker": ticker}
        
        if not ticker.endswith('.SA'):
            ticker_sa = f"{ticker}.SA"
            stock_sa = yf.Ticker(ticker_sa)
            hist_sa = stock_sa.history(period="1d")
            if not hist_sa.empty: return {"valid": True, "ticker": ticker} 
        
        return {"valid": False, "ticker": None}
    except Exception as e:
        logging.error(f"Erro ao validar existência do ticker {ticker} no Yahoo: {e}")
        return {"valid": False, "ticker": None}

def update_fundamentals(dolar_rate_callback, state_dict=None):
    from database.session import Session
    from database.models import safe_commit
    
    logging.info("📊 JOB: Calculando Fundamentos via Yahoo Finance...")
    
    # 1. Busca os IDs e metadados mínimos dos ativos do banco em uma sessão curta
    session = Session()
    assets_info = []
    try:
        from sqlalchemy.orm import joinedload
        assets = (
            session.query(Asset)
            .join(Category)
            .filter(Category.name.in_(['Ação', 'FII', 'Internacional', 'ETF', 'BDR']))
            .all()
        )
        for asset in assets:
            assets_info.append({
                "id": asset.id,
                "ticker": asset.ticker,
                "category_name": asset.category.name if asset.category else '',
                "currency": asset.currency
            })
    finally:
        Session.remove()

    total = len(assets_info)
    if state_dict is not None:
        state_dict["total"] = total
        state_dict["progress"] = 0
        state_dict["message"] = f"Mapeando {total} ativos de renda variável..."

    cutoff_date = datetime.now() - timedelta(days=365)
    dolar_rate = dolar_rate_callback()
    consecutive_failures = 0
    count = 0

    for asset_data in assets_info:
        asset_id = asset_data["id"]
        ticker_raw = asset_data["ticker"].strip().upper()
        category_name = asset_data["category_name"]
        currency = asset_data["currency"]

        try:
            ticker_symbol = to_yf_ticker(ticker_raw, category_name)
            is_intl = (currency == 'USD') if currency else (
                category_name in ('Internacional', 'ETF', 'BDR')
            )
                
            if state_dict is not None:
                state_dict["message"] = f"Analisando {ticker_raw} ({count + 1}/{total})"

            # Chamadas de rede fora da transação de banco de dados
            y_asset = yf.Ticker(ticker_symbol)
            
            current_price = 0
            if hasattr(y_asset, 'fast_info') and y_asset.fast_info.last_price:
                current_price = y_asset.fast_info.last_price
            else:
                hist = y_asset.history(period="1d")
                if not hist.empty: current_price = hist['Close'].iloc[-1]

            if current_price <= 0:
                count += 1
                if state_dict is not None: state_dict["progress"] = count
                continue

            divs = y_asset.dividends
            total_divs_val = 0.0
            
            if not divs.empty:
                divs.index = divs.index.tz_localize(None)
                divs_last_12m = divs[divs.index >= cutoff_date]
                total_divs_val = float(divs_last_12m.sum())

            dy_calculated = total_divs_val / current_price if current_price > 0 else 0
            
            info = y_asset.info
            lpa = info.get('trailingEps') or info.get('forwardEps') or 0
            vpa = info.get('bookValue') or 0

            if is_intl and not ticker_symbol.endswith('.SA'):
                lpa *= dolar_rate
                vpa *= dolar_rate

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

            # 2. Agora com os dados obtidos, abre uma sessão rápida apenas para atualizar o ativo no banco
            session = Session()
            try:
                db_asset = session.query(Asset).filter_by(id=asset_id).first()
                if db_asset:
                    db_asset.upcoming_split = upcoming_split_val
                    pos = db_asset.position
                    if pos:
                        if lpa != 0: pos.manual_lpa = round(lpa, 2)
                        if vpa != 0: pos.manual_vpa = round(vpa, 2)
                        if dy_calculated >= 0:
                            pos.manual_dy = round(dy_calculated, 4)
                    safe_commit(session)
                    consecutive_failures = 0 # Reseta após sucesso real
            finally:
                Session.remove()
                
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
            
    logging.info(f"🏁 Varredura fundamentalista concluída: {count} registros atualizados.")
    return {"status": "Sucesso", "msg": f"Sucesso! {total} ativos reavaliados via Yahoo Finance."}

def sync_reports_with_fnet(session):
    from crawlers.b3_fnet import B3FnetCrawler
    from utils.cnpj_finder import CNPJFinder
    from utils.cvm_finder import CVMFinder 
    from utils.cvm_processor import CVMProcessor
    from utils.fii_processor import FIIProcessor

    try:
        assets_to_sync = session.query(Position).join(Asset).join(Category).filter(
            Category.name.in_(["FII", "Ação"])
        ).all()

        count_fii = 0
        count_acao = 0

        for pos in assets_to_sync:
            asset = pos.asset
            ticker = asset.ticker.replace(".SA", "").strip().upper()
            is_fii = asset.category.name == "FII"
            
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
                    mensal = doc_package.get('mensal')
                    if mensal and mensal.get('link'):
                        try:
                            fii_data = FIIProcessor.parse_informe_mensal(mensal['link'])
                            if fii_data:
                                mdata = asset.market_data[0] if asset.market_data else None
                                price = float(mdata.price) if mdata and mdata.price else 0.0
                                vpa = fii_data.get('ticker_info', {}).get('vpa', 0.0) or 0.0
                                p_vp = price / vpa if vpa > 0 else 0.0
                                
                                fii_indicators = {
                                    "ticker_info": {
                                        "ultimo_periodo": mensal.get('ref_date', 'Mensal'),
                                        "data_base": mensal.get('date', '')
                                    },
                                    "cards_indicadores": [
                                        { "titulo": "P/VP", "valor_formatado": f"{p_vp:.2f}", "tipo": "eficiencia" },
                                        { "titulo": "VPA", "valor_formatado": f"R$ {vpa:.2f}", "tipo": "eficiencia" },
                                        { "titulo": "DY Mensal (XML)", "valor_formatado": fii_data["indicadores"].get("DY Mensal (XML)", "0.00%"), "tipo": "rentabilidade" },
                                        { "titulo": "Patrimônio Líquido", "valor": fii_data["ticker_info"].get("patrimonio"), "tipo": "rentabilidade" },
                                        { "titulo": "Disponibilidades (Caixa)", "valor": fii_data["raw_xml_data"].get("disponibilidades"), "tipo": "caixa", "subtitulo": f"{fii_data['ticker_info'].get('caixa_pct', 0):.2f}% do PL" },
                                        { "titulo": "Passivo Total", "valor": fii_data["raw_xml_data"].get("total_passivo"), "tipo": "risco", "subtitulo": f"Alavancagem: {fii_data['ticker_info'].get('alavancagem', 0):.2f}%" },
                                    ],
                                    "evolucao_grafico": []
                                }
                        except Exception as fii_err:
                            logging.warning(f"⚠️ Erro ao processar XML de FII {ticker}: {fii_err}")

                    combined = {
                        "reports": list(doc_package.values()),
                        "fundamentalist": fii_indicators
                    }
                    pos.last_report_type = json.dumps(combined)
                    
                    gerencial = doc_package.get('gerencial')
                    pos.last_report_url = gerencial["link"] if gerencial else list(doc_package.values())[0]["link"]
                    datas = [f"{k[0].upper()}: {v['ref_date']}" for k, v in doc_package.items() if 'ref_date' in v]
                    pos.last_report_at = " | ".join(datas)
                    count_fii += 1
                time.sleep(0.5)

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

        session.commit()
        return {
            "status": "Sucesso", 
            "msg": f"FIIs: {count_fii} ativos. Ações: {count_acao} fundamentadas."
        }

    except Exception as e:
        session.rollback()
        logging.error(f"🔥 Erro grave na esteira de sincronização FNET/CVM: {traceback.format_exc()}")
        return {"status": "Erro", "msg": str(e)}
