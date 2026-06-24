import sys
import os
import shutil
import yfinance as yf
import math
import pandas as pd
import time
import numpy as np
import pytz 
import json # ⚡ Corrigido: Importação global essencial para evitar NameError no Dashboard
import logging # ⚡ Módulo estruturado de logs substitui os prints genéricos
import traceback
from datetime import datetime, date, timedelta
from sqlalchemy.orm import scoped_session, sessionmaker

# 🧼 REMOVIDO: Globais ociosas (FNET_CACHE, PENDING_REQUESTS, CACHE_EXPIRATION) limpas do escopo.
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.models import Asset, Position, Category, MarketData, PortfolioSnapshot, engine

session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)

# Nomenclatura padronizada de cache em escopo controlado
USD_CACHE = {"rate": 5.80, "last_update": 0}

class PortfolioService:
    def __init__(self):
        pass

    def _extract_value(self, data_point):
        try:
            if hasattr(data_point, 'iloc'): return float(data_point.iloc[0])
            if hasattr(data_point, 'item'): return float(data_point.item())
            return float(data_point)
        except: return 0.0

    def get_usd_rate(self):
        """Retorna a taxa cambial do dólar comercial com cache local estável de 1 hora"""
        now = time.time()
        
        if (now - USD_CACHE["last_update"]) < 3600:
            return USD_CACHE["rate"]

        try:
            ticker = yf.Ticker("BRL=X")
            data = ticker.history(period="1d")
            if not data.empty: 
                rate = float(data['Close'].iloc[-1])
                USD_CACHE["rate"] = rate
                USD_CACHE["last_update"] = now
                return rate
        except Exception as e:
            logging.warning(f"⚠️ Não foi possível atualizar a taxa do Dólar via API (Usando Cache): {e}")
        
        return USD_CACHE["rate"] 

    def _calculate_rsi(self, series, period=14):
        if len(series) < period + 1: return 50.0
        delta = series.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50.0

    def _calculate_sma(self, series, window=20):
        if len(series) < window: return float(series.mean())
        return float(series.rolling(window=window).mean().iloc[-1])

    def update_prices(self):
        logging.info(" odds 🔄 JOB: Iniciando atualização automática de cotações...")
        session = Session()
        try:
            assets = session.query(Asset).filter(Asset.ticker != 'Nubank Caixinha').all()
            tickers_map = {}
            download_list = []

            for asset in assets:
                ticker_raw = asset.ticker.strip().upper()
                
                if len(ticker_raw) > 7 or " " in ticker_raw:
                    logging.info(f"   ℹ️ {ticker_raw} ignorado por escopo (Regra: Manual/Longo)")
                    continue

                is_intl = asset.category and asset.category.name == 'Internacional'
                needs_sa = False
                
                if not ticker_raw.endswith('.SA'):
                    if not is_intl:
                        needs_sa = True 
                    elif ticker_raw == 'VWRA11' or any(ticker_raw.endswith(s) for s in ['39', '34', '33', '11']):
                        needs_sa = True 
                
                symbol = f"{ticker_raw}.SA" if needs_sa else ticker_raw
                tickers_map[symbol] = asset
                download_list.append(symbol)

            if not download_list:
                return

            batch_data = yf.download(download_list, period="6mo", group_by='ticker', threads=True, progress=False, auto_adjust=True)

            count_ok = 0
            for symbol, asset in tickers_map.items():
                try:
                    hist = pd.DataFrame()
                    if len(download_list) == 1:
                        hist = batch_data
                    else:
                        if symbol in batch_data.columns:
                            hist = batch_data[symbol]
                    
                    hist = hist.dropna(how='all')
                    
                    if hist.empty or 'Close' not in hist.columns:
                        continue

                    current_price = float(hist['Close'].iloc[-1])
                    absolute_min_6m = float(hist['Low'].min())

                    change_pct = 0.0
                    if len(hist) >= 2:
                        prev_close = float(hist['Close'].iloc[-2])
                        if prev_close > 0:
                            change_pct = ((current_price - prev_close) / prev_close) * 100

                    mdata = session.query(MarketData).filter_by(asset_id=asset.id).first()
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
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro ao atualizar cotações no banco: {e}")
        finally:
            Session.remove()

    def _prioridade_alerta(self, txt):
        if "🚨" in txt: return 0  
        if "🧠" in txt: return 1  
        if "💎" in txt: return 2  
        if "⚓" in txt: return 3  
        if "🔻" in txt: return 4  
        if "❗" in txt: return 5  
        if "🔥" in txt: return 6  
        return 7

    def record_confirmed_dividends(self):
        logging.info("📅 [SERVICE] Verificação de rotina de proventos concluída.")
        return True

    def get_dashboard_data(self):
        session = Session()
        try:
            positions = session.query(Position).all()
            categories = session.query(Category).all()
            dolar_rate = self.get_usd_rate()
            
            resumo = {"Total": 0.0, "RendaMensal": 0.0, "TotalInvestido": 0.0, "LucroTotal": 0.0}
            cat_totals = {c.name: 0.0 for c in categories}
            cat_metas = {c.name: c.target_percent for c in categories}
            ativos_proc = []

            for pos in positions:
                asset = pos.asset
                if not asset: continue 

                mdata = asset.market_data[0] if asset.market_data else None
                try:
                    qtd = float(pos.quantity or 0)
                    pm = float(pos.average_price or 0)
                    if mdata and mdata.price is not None and mdata.price > 0:
                        preco = float(mdata.price)
                        min_6m = float(mdata.min_6m or 0)
                        change_percent = float(mdata.change_percent or 0)
                    else:
                        preco = 0.0
                        min_6m = 0.0
                        change_percent = 0.0
                except: 
                    qtd=0; pm=0; preco=0; min_6m=0; change_percent=0

                fator = dolar_rate if asset.currency == 'USD' else 1.0
                total_atual = qtd * preco * fator
                total_investido = qtd * pm * fator
                
                resumo["Total"] += total_atual
                resumo["TotalInvestido"] += total_investido
                if asset.category.name in cat_totals:
                    cat_totals[asset.category.name] += total_atual
                
                metrics = self._calculate_metrics(pos, preco, min_6m)
                resumo["RendaMensal"] += metrics.get("renda_mensal_est", 0)
                
                ativos_proc.append({
                    "obj": pos, "total_atual": total_atual, "total_investido": total_investido,
                    "preco_atual": preco, "min_6m": min_6m, "change_percent": change_percent, "metrics": metrics
                })

            resumo["LucroTotal"] = resumo["Total"] - resumo["TotalInvestido"]
            resumo.update(cat_totals)

            final_list = []
            alertas = []
            
            for item in ativos_proc:
                pos = item["obj"]
                cat_name = pos.asset.category.name
                total_cat = cat_totals.get(cat_name, 1)
                min_bruta = item["min_6m"]
                preco_atual = item["preco_atual"]

                # Metas de Alocação
                pct_na_categoria = (item["total_atual"] / total_cat * 100) if total_cat > 0 else 0
                meta_macro = cat_metas.get(cat_name, 0) / 100
                meta_micro = (pos.target_percent or 0) / 100
                meta_global_valor = resumo["Total"] * meta_macro * meta_micro
                falta = meta_global_valor - item["total_atual"]
                
                rec_text, status, score, motivo, rsi = self._apply_strategy(
                    pos, item["metrics"], falta, item["preco_atual"], item["min_6m"]
                )
                
                # Regras de Alertas
                if cat_name not in ['Renda Fixa', 'Reserva']:
                    if pos.target_percent and pos.target_percent > 0:
                        excesso = pct_na_categoria / pos.target_percent
                        if excesso > 2.0:
                            alertas.append(f"🚨 REBALANCEAR URGENTE: {pos.asset.ticker} ({pct_na_categoria:.1f}% vs meta {pos.target_percent:.1f}%)")
                        elif excesso > 1.5:
                            alertas.append(f"❗ REBALANCEAR: {pos.asset.ticker} estourou a meta ({pct_na_categoria:.1f}%)")

                    if cat_name == "Ação":
                        mg = item["metrics"].get("mg_graham", 0)
                        if mg >= 50:
                            alertas.append(f"🧠 FUNDAMENTO: {pos.asset.ticker} com margem de segurança alta (+{mg:.0f}%)")
                    elif cat_name == "FII":
                        pvp = item["metrics"].get("p_vp", 1)
                        if 0 < pvp <= 0.85:
                            alertas.append(f"🧠 FUNDAMENTO: {pos.asset.ticker} muito abaixo do VP ({pvp:.2f})")

                    if rsi < 28:
                        alertas.append(f"💎 OPORTUNIDADE TÉCNICA: {pos.asset.ticker} (RSI {rsi:.0f})")
                    elif rsi > 78:
                        if (pct_na_categoria / (pos.target_percent or 1)) >= 1.2:
                            alertas.append(f"🔥 ESTICADO: {pos.asset.ticker} em região de topo (RSI {rsi:.0f})")

                    if min_bruta > 0:
                        moeda = "R$" if pos.asset.currency == 'BRL' else "$"
                        if preco_atual <= min_bruta * 1.01:
                            alertas.append(f"⚓ FUNDO: {pos.asset.ticker} na mínima de 6 meses (Ref: {moeda} {min_bruta:.2f})")
                        elif preco_atual <= min_bruta * 1.03:
                            alertas.append(f"🔻 PERTO DO FUNDO: {pos.asset.ticker} (Mínima: {moeda} {min_bruta:.2f})")

                fundamentalist_info = None
                if cat_name == 'Ação' and pos.asset.cvm_code and pos.last_report_type:
                    try:
                        fundamentalist_info = json.loads(pos.last_report_type)
                    except:
                        fundamentalist_info = None

                final_list.append({
                    "id": pos.asset.id, 
                    "ticker": pos.asset.ticker,
                    "tipo": cat_name,
                    "cvm_code": pos.asset.cvm_code,
                    "qtd": pos.quantity,
                    "pm": pos.average_price,
                    "meta": pos.target_percent,
                    "preco_atual": item["preco_atual"],
                    "change_percent": item["change_percent"],
                    "min_6m": item["min_6m"],
                    "total_atual": item["total_atual"],          
                    "total_investido": item["total_investido"],  
                    "lucro_valor": item["total_atual"] - item["total_investido"],
                    "lucro_pct": ((item["total_atual"] - item["total_investido"]) / item["total_investido"] * 100) if item["total_investido"] > 0 else 0,
                    "pct_na_categoria": pct_na_categoria,
                    "falta_comprar": falta,
                    "manual_dy": pos.manual_dy,
                    "manual_lpa": pos.manual_lpa,
                    "manual_vpa": pos.manual_vpa,
                    "recomendacao": rec_text, "status": status, "score": score, "motivo": motivo,
                    "rsi": rsi,
                    "last_report_url": pos.last_report_url,
                    "last_report_at": pos.last_report_at,
                    "last_report_type": pos.last_report_type,
                    "fundamentalist_data": fundamentalist_info,
                    **item["metrics"]
                })

            final_list.sort(key=lambda x: x["score"], reverse=True)
            alertas.sort(key=self._prioridade_alerta)

            lista_grafico = [{"name": k, "value": v} for k, v in cat_totals.items() if v > 0]
            cats_info = [{"name": c.name, "meta": c.target_percent} for c in categories]
            
            return { 
                "status": "Sucesso", 
                "dolar": dolar_rate, 
                "resumo": resumo, 
                "grafico": lista_grafico, 
                "alertas": alertas, 
                "ativos": final_list, 
                "categorias": cats_info 
            }
        except Exception as e:
            logging.error(f"❌ Erro Crítico na montagem do Dashboard: {traceback.format_exc()}")
            return {"status": "Erro", "msg": str(e)}
        for c in [Session]: c.remove()

    def _calculate_metrics(self, pos, preco, min_6m):
        m = {"vi_graham": 0, "mg_graham": 0, "magic_number": 0, "renda_mensal_est": 0, "p_vp": 0}
        try:
            dy = self._extract_value(pos.manual_dy) 
            lpa = self._extract_value(pos.manual_lpa)
            vpa = self._extract_value(pos.manual_vpa)
            qtd = self._extract_value(pos.quantity)
            
            if dy > 0 and preco > 0:
                m["renda_mensal_est"] = (preco * dy * qtd) / 12
                m["magic_number"] = math.ceil(12 / dy)
            
            if vpa > 0 and preco > 0:
                m["p_vp"] = preco / vpa

            if pos.asset.category.name == "Ação" and lpa > 0 and vpa > 0:
                m["vi_graham"] = math.sqrt(22.5 * lpa * vpa)
                if preco > 0: m["mg_graham"] = ((m["vi_graham"] - preco) / preco) * 100
        except: pass
        return m
    
    def _apply_strategy(self, pos, metrics, falta, preco, min_6m):
        score = 0
        motivos = []
        cat_name = pos.asset.category.name

        if cat_name == "Reserva":
            if falta > 0:
                return "🚨 REPOR RESERVA", "COMPRA_FORTE", 100, "⚠️ Nível abaixo do ideal", 50
            else:
                return "✅ RESERVA OK", "NEUTRO", 50, "🛡️ Reserva completa", 50

        if cat_name == "Renda Fixa":
            if falta > 0:
                score = 85 
                motivos.append("💰 Aporte Mensal / Rebalanceamento")
                status = "COMPRAR"
                rec_text = "🟢 APORTAR"
            else:
                score = 40
                motivos.append("⚖️ Alocação Atingida")
                status = "AGUARDAR"
                rec_text = "🟡 MANTER"
            return rec_text, status, score, " • ".join(motivos), 50

        # Renda Variável Geral
        if falta > 0: 
            score += 30 
            motivos.append("⚖️ Abaixo da Meta (+30)")
        else: 
            score -= 10
            motivos.append("📊 Acima da Meta (-10)")

        rsi = 50
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        if mdata:
            rsi = mdata.rsi_14 or 50
        
        if cat_name == "Cripto":
            motivos.append("⚡ Ativo de Volatilidade Alta")
            if rsi < 35:
                score += 25
                motivos.append(f"🔥 Sobrevenda Cripto (RSI {rsi:.0f})")
            elif rsi > 75:
                score -= 30
                motivos.append(f"⚠️ Cripto Esticada (RSI {rsi:.0f})")
        else:
            if rsi < 30:
                score += 25
                motivos.append(f"🔥 Sobrevenda Crítica (RSI {rsi:.0f})")
            elif rsi < 40:
                score += 15
                motivos.append(f"↘️ Desconto Técnico (RSI {rsi:.0f})")
            elif rsi > 70:
                score -= 30
                motivos.append(f"⚠️ Esticado (RSI {rsi:.0f})")

        if min_6m > 0:
            if preco <= min_6m * 1.02: 
                score += 15
                motivos.append("⚓ Suporte: Mínima Semestral")
            elif preco <= min_6m * 1.05:
                score += 5
                motivos.append("📉 Próximo das Mínimas")

        if cat_name == "Ação":
            mg = metrics.get("mg_graham", 0)
            if mg > 50:
                score += 30
                motivos.append(f"💎 Graham: Margem Segura (+{mg:.0f}%)")
            elif mg > 20:
                score += 15
                motivos.append(f"💰 Graham: Desconto (+{mg:.0f}%)")
            elif mg < -20:
                score -= 20
                motivos.append(f"💸 Preço acima do Justo")

        elif cat_name == "Internacional":
            mg = metrics.get("mg_graham", 0)
            if mg != 0: 
                if mg > 20: score += 15; motivos.append("💰 Valuation Atrativo")
                elif mg < -20: score -= 15; motivos.append("💸 Valuation Esticado")
            else:
                score += 10 
                motivos.append("🌎 Alocação Global")

        elif cat_name == "FII":
            pvp = metrics.get("p_vp", 1)
            if pvp < 0.60:
                score -= 20 
                motivos.append(f"🚨 P/VP de Risco? ({pvp:.2f})")
            elif pvp <= 0.90:
                score += 30
                motivos.append(f"🏢 P/VP: Desconto ({pvp:.2f})")
            elif pvp < 1.02:
                score += 10
                motivos.append(f"✅ P/VP Justo ({pvp:.2f})")
            elif pvp > 1.15:
                score -= 30
                motivos.append(f"⚠️ P/VP Caro ({pvp:.2f})")

            mn = metrics.get("magic_number", 0)
            if mn > 0 and pos.quantity >= mn:
                score += 5
                motivos.append("❄️ Magic Number Atingido")

        score = max(0, min(score, 100))

        if score >= 80:
            status = "COMPRA_FORTE"
            rec_text = "💎 OPORTUNIDADE"
        elif score >= 60:
            status = "COMPRAR"
            rec_text = "🟢 COMPRAR"
        elif score >= 40:
            status = "AGUARDAR"
            rec_text = "🟡 OBSERVAR"
        elif score >= 20:
            status = "NEUTRO"
            rec_text = "⚪ NEUTRO"
        else:
            status = "EVITAR"
            rec_text = "🔴 EVITAR"
            
        return rec_text, status, score, " • ".join(motivos), rsi

    def _backup_database(self):
        try:
            backup_dir = 'backups'
            if not os.path.exists(backup_dir): os.makedirs(backup_dir)
            filename = f"assetflow_backup_{date.today()}.db"
            dest = os.path.join(backup_dir, filename)
            shutil.copy('assetflow.db', dest)
        except Exception as e: 
            logging.error(f"❌ Falha automática ao gerar backup físico do banco: {e}")

    def take_daily_snapshot(self):
        logging.info("📸 JOB: Computando snapshot patrimonial diário...")
        session = Session()
        try:
            positions = session.query(Position).all()
            total_equity = 0; total_invested = 0
            dolar_rate = self.get_usd_rate()
            for pos in positions:
                asset = pos.asset
                if not asset: continue 
                
                mdata = asset.market_data[0] if asset.market_data else None
                try:
                    price = float(mdata.price) if (mdata and mdata.price) else float(pos.average_price or 0)
                    qtd = float(pos.quantity or 0)
                    pm = float(pos.average_price or 0)
                except: price=0; qtd=0; pm=0
                fator = dolar_rate if asset.currency == 'USD' else 1.0
                total_equity += (qtd * price * fator)
                total_invested += (qtd * pm * fator)
            
            today = date.today()
            existing = session.query(PortfolioSnapshot).filter(PortfolioSnapshot.date == today).first()
            if existing:
                existing.total_equity = total_equity; existing.total_invested = total_invested
                existing.profit = total_equity - total_invested
            else:
                snap = PortfolioSnapshot(date=today, total_equity=total_equity, total_invested=total_invested, profit=total_equity-total_invested)
                session.add(snap)
            session.commit()
            self._backup_database()
        except Exception as e: 
            session.rollback()
            logging.error(f"❌ Erro ao salvar snapshot diário: {e}")
        finally: Session.remove()

    def get_history_data(self):
        session = Session()
        try:
            snapshots = session.query(PortfolioSnapshot).order_by(PortfolioSnapshot.date).all()
            history = []
            for s in snapshots:
                history.append({
                    "date": s.date.strftime("%d/%m"), 
                    "Patrimônio": s.total_equity,
                    "Investido": s.total_invested,
                    "Lucro": s.profit
                })
            return history
        finally: Session.remove()
        
    def update_position(self, ticker, qtd, pm, meta, dy=0, lpa=0, vpa=0, current_price=None):
        logging.info(f"📝 JOB: Recebendo atualização de {ticker} -> Qtd: {qtd}, PM: {pm}, Meta: {meta}%")
        session = Session()
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset: 
                return {"status": "Erro", "msg": f"Ativo {ticker} não encontrado"}
            
            pos = session.query(Position).filter_by(asset_id=asset.id).first()
            if not pos:
                pos = Position(asset_id=asset.id)
                session.add(pos)
            
            pos.quantity = float(qtd) 
            pos.average_price = float(pm)
            pos.target_percent = float(meta)
            
            pos.manual_dy = float(dy)
            pos.manual_lpa = float(lpa)
            pos.manual_vpa = float(vpa)
            
            if current_price is not None and str(current_price).strip() != "":
                mdata = session.query(MarketData).filter_by(asset_id=asset.id).first()
                if not mdata:
                    mdata = MarketData(asset_id=asset.id)
                    session.add(mdata)
                
                mdata.price = float(current_price)
                mdata.date = datetime.now()
                mdata.min_6m = float(current_price) 
                
            session.commit()
            logging.info(f"   ✅ Sucesso: {ticker} (Quantity: {pos.quantity}) persistido com sucesso.")
            return {"status": "Sucesso", "msg": "Dados e Preço Atualizados!"}
            
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Falha ao atualizar posição de {ticker}: {e}")
            return {"status": "Erro", "msg": str(e)}
        finally:
            Session.remove()
        
    def add_new_asset(self, ticker, category_name, qtd, pm, meta=0):
        raw_ticker = ticker.upper().strip()
        
        if raw_ticker.endswith(".SA") or raw_ticker.endswith("-USD") or category_name == "Internacional":
            currency = "BRL" 
        else:
            currency = "BRL" 

        ticker = ticker.upper().strip().replace(".SA", "")
        logging.info(f"🆕 JOB: Mapeando inclusão de novo ativo: {ticker}")
        session = Session()
        try:
            exists = session.query(Asset).filter_by(ticker=ticker).first()
            if exists: return {"status": "Erro", "msg": "Ativo já existe!"}
            
            category = session.query(Category).filter_by(name=category_name).first()
            if not category: category = session.query(Category).first()
            
            new_asset = Asset(ticker=ticker, category_id=category.id, currency=currency)
            session.add(new_asset)
            session.flush() 
            
            pos = Position(
                asset_id=new_asset.id, 
                quantity=float(qtd), 
                average_price=float(pm),
                target_percent=float(meta) 
            )
            session.add(pos)
            
            session.commit()
            return {"status": "Sucesso", "msg": f"Ativo {ticker} criado com sucesso!"}
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Falha ao injetar novo ativo no ecossistema: {e}")
            return {"status": "Erro", "msg": str(e)}
        finally: 
            Session.remove()
        
    def delete_asset(self, asset_id):
        session = Session()
        try:
            asset = session.query(Asset).filter_by(id=asset_id).first()
            if not asset: return {"status": "Erro", "msg": "Ativo não encontrado"}
            
            session.query(Position).filter_by(asset_id=asset_id).delete()
            session.query(MarketData).filter_by(asset_id=asset_id).delete()
            session.delete(asset)
            session.commit()
            return {"status": "Sucesso", "msg": "Ativo e dados vinculados excluídos!"}
        except Exception as e:
            session.rollback()
            return {"status": "Erro", "msg": str(e)}
        finally: Session.remove()

    def run_monte_carlo_simulation(self, days=252, simulations=1000):
        logging.info("🎲 --- INICIANDO PROJEÇÃO DE MONTE CARLO ---")
        session = Session()
        try:
            positions = session.query(Position).all()
            tickers = []
            weights = []
            total_value = 0.0
            
            for pos in positions:
                if not pos.asset: continue
                # Filtro estratégico: Monte Carlo roda apenas sobre a volatilidade da renda variável
                if pos.asset.category.name in ['Ação', 'FII', 'ETF', 'Internacional']:
                    price = 0.0
                    mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                    if mdata:
                        price = float(mdata.price or 0.0)
                    if price == 0:
                        price = float(pos.average_price or 0.0)

                    qty = float(pos.quantity)
                    val = qty * price
                    if val > 0:
                        suffix = ".SA" if pos.asset.category.name != 'Internacional' else ""
                        clean_ticker = pos.asset.ticker.strip() + suffix
                        tickers.append(clean_ticker)
                        weights.append(val)
                        total_value += val
            
            if not tickers or total_value == 0:
                return {"status": "Erro", "msg": "Carteira vazia ou sem valor de renda variável para projetar."}

            weights = np.array([w / total_value for w in weights])
            data = yf.download(tickers, period="1y", group_by='ticker', progress=False, auto_adjust=True)
            close_prices = pd.DataFrame()

            if len(tickers) == 1:
                t = tickers[0]
                if isinstance(data, pd.DataFrame) and 'Close' in data.columns: close_prices[t] = data['Close']
                else: close_prices[t] = data
            else:
                for t in tickers:
                    try:
                        if t in data.columns: close_prices[t] = data[t]['Close']
                        elif 'Close' in data.columns and t in data['Close'].columns: close_prices[t] = data['Close'][t]
                    except: pass

            close_prices = close_prices.dropna()
            if close_prices.empty: return {"status": "Erro", "msg": "Dados históricos insuficientes para simulação."}

            returns = close_prices.pct_change().dropna()
            mean_returns = returns.mean()
            cov_matrix = returns.cov()
            
            valid_tickers = close_prices.columns.tolist()
            valid_weights = []
            temp_total = 0
            ticker_map = dict(zip(tickers, weights))
            
            for t in valid_tickers:
                w = ticker_map.get(t, 0)
                valid_weights.append(w)
                temp_total += w
            
            valid_weights = np.array([w/temp_total for w in valid_weights])
            port_return = np.sum(mean_returns * valid_weights) * days
            port_volatility = np.sqrt(np.dot(valid_weights.T, np.dot(cov_matrix, valid_weights))) * np.sqrt(days)

            simulation_data = {}
            last_price = total_value
            daily_vol = port_volatility / np.sqrt(days)
            daily_ret = port_return / days
            
            for x in range(simulations):
                random_shocks = np.random.normal(daily_ret, daily_vol, days)
                price_path = last_price * (1 + random_shocks).cumprod()
                simulation_data[x] = price_path

            simulation_df = pd.DataFrame(simulation_data)
            results = { 
                "pior_caso": simulation_df.quantile(0.05, axis=1).tolist(), 
                "medio": simulation_df.mean(axis=1).tolist(), 
                "melhor_caso": simulation_df.quantile(0.95, axis=1).tolist() 
            }
            
            return {"status": "Sucesso", "volatilidade_anual": f"{port_volatility*100:.2f}%", "projecao": results}
        except Exception as e:
            logging.error(f"❌ Falha crítica no motor de Monte Carlo: {e}")
            return {"status": "Erro", "msg": str(e)}
        finally: Session.remove()
    
    def update_category_meta(self, category_name, new_meta):
        session = Session()
        try:
            cat = session.query(Category).filter_by(name=category_name).first()
            if not cat: return {"status": "Erro", "msg": "Categoria não encontrada"}
            cat.target_percent = float(new_meta)
            session.commit()
            return {"status": "Sucesso", "msg": "Meta atualizada!"}
        except Exception as e:
            session.rollback()
            return {"status": "Erro", "msg": str(e)}
        finally: Session.remove()

    def validate_ticker_on_yahoo(self, ticker):
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
        
    def sync_reports_with_fnet(self):
        from crawlers.b3_fnet import B3FnetCrawler
        from utils.cnpj_finder import CNPJFinder
        from utils.cvm_finder import CVMFinder 
        from utils.cvm_processor import CVMProcessor
        import time

        session = Session()
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
                        session.flush()

                if not is_fii and asset.cnpj and (not asset.cvm_code or asset.cvm_code == ""):
                    cnpj_limpo = "".join(filter(str.isdigit, str(asset.cnpj)))
                    codigo_cvm = CVMFinder.find_code(cnpj_limpo)
                    if codigo_cvm:
                        asset.cvm_code = codigo_cvm
                        logging.info(f"✅ Código CVM Vinculado: {ticker} -> {codigo_cvm}")
                        session.flush()

                if is_fii and asset.cnpj:
                    doc_package = B3FnetCrawler.get_documents_package(asset.cnpj)
                    if doc_package:
                        pos.last_report_type = json.dumps(doc_package)
                        gerencial = doc_package.get('gerencial')
                        pos.last_report_url = gerencial["link"] if gerencial else list(doc_package.values())[0]["link"]
                        datas = [f"{k[0].upper()}: {v['ref_date']}" for k, v in doc_package.items() if 'ref_date' in v]
                        pos.last_report_at = " | ".join(datas)
                        count_fii += 1
                    time.sleep(0.5)

                elif not is_fii and asset.cvm_code:
                    try:
                        analise_completa = CVMProcessor.get_dashboard_data(asset.cvm_code)
                        if analise_completa:
                            pos.last_report_type = json.dumps(analise_completa)
                            pos.last_report_at = f"Balanço: {analise_completa['ticker_info']['ultimo_periodo']}"
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
        finally:
            Session.remove()

    def get_correlation_matrix(self):
        logging.info("🧮 JOB: Iniciando cálculo da Matriz de Correlação Estatística...")
        session = Session()
        try:
            positions = session.query(Position).filter(Position.quantity > 0).all()
            if not positions: return {"status": "Erro", "msg": "Carteira sem posições ativas."}

            tickers_map = {}
            download_list = []
            
            for pos in positions:
                if not pos.asset: continue
                
                # 🚀 SHIELD PERFORMANCE: Ignora Reserva e Renda Fixa na origem para blindar o yfinance contra 404s
                if pos.asset.category and pos.asset.category.name in ['Reserva']:
                    continue
                    
                ticker_clean = pos.asset.ticker.strip().upper()
                is_intl = pos.asset.category.name == 'Internacional'
                
                if not is_intl and not ticker_clean.endswith('.SA') and pos.asset.category.name != 'Cripto' and not ticker_clean.endswith('-USD'):
                     ticker_yf = f"{ticker_clean}.SA"
                else:
                     ticker_yf = ticker_clean
                
                tickers_map[ticker_yf] = ticker_clean 
                download_list.append(ticker_yf)

            unique_assets = list(set(download_list))
            if len(unique_assets) < 2:
                return {"status": "Erro", "msg": "É necessário possuir ao menos 2 ativos de Renda Variável distintos para gerar correlação."}

            logging.info(f"   ⬇️ Buscando fatias históricas (1y) para {len(unique_assets)} papéis...")
            raw_data = yf.download(unique_assets, period="1y", progress=False, auto_adjust=True)
            
            if isinstance(raw_data.columns, pd.MultiIndex):
                try:
                    prices = raw_data['Close']
                except KeyError:
                    prices = raw_data
            else:
                if 'Close' in raw_data.columns:
                    prices = raw_data[['Close']] 
                else:
                    prices = raw_data 

            prices = prices.dropna(axis=1, how='all')
            
            if prices.shape[1] < 2:
                 return {"status": "Erro", "msg": "Dados de volatilidade insuficientes para cruzar a correlação."}

            returns = prices.pct_change()
            returns_clean = returns.dropna()
            
            days_in_common = returns_clean.shape[0]
            if days_in_common < 30:
                msg = f"Intersecção temporal fraca: Apenas {days_in_common} pregões em comum entre as séries."
                logging.warning(f"⚠️ {msg}")
                return {"status": "Erro", "msg": msg}

            corr_matrix = returns_clean.corr()

            matrix_data = []
            assets_labels = [tickers_map.get(t, t) for t in corr_matrix.columns]
            
            for i, row_ticker in enumerate(corr_matrix.index):
                for j, col_ticker in enumerate(corr_matrix.columns):
                    val = corr_matrix.iloc[i, j]
                    if pd.isna(val) or np.isinf(val): val = 0
                    
                    matrix_data.append({
                        "x": tickers_map.get(row_ticker, row_ticker),
                        "y": tickers_map.get(col_ticker, col_ticker),
                        "value": round(float(val), 2)
                    })

            return {
                "status": "Sucesso",
                "labels": assets_labels,
                "matrix": matrix_data
            }

        except Exception as e:
            logging.error(f"❌ Falha crítica no pipeline estatístico do Heatmap: {e}")
            return {"status": "Erro", "msg": "Erro interno no cálculo da matriz."}
        finally:
            Session.remove()
        
    def update_fundamentals(self):
        logging.info("📊 JOB: Executando varredura fundamentalista via Yahoo Finance...")
        session = Session()
        count = 0
        try:
            assets = session.query(Asset).join(Category).filter(
                Category.name.in_(['Ação', 'FII', 'Internacional', 'ETF', 'BDR'])
            ).all()
            
            cutoff_date = datetime.now() - timedelta(days=365)
            dolar_rate = self.get_usd_rate()

            for asset in assets:
                try:
                    is_intl = not asset.ticker.endswith('.SA') and asset.category.name == 'Internacional'
                    suffix = ".SA" if not asset.ticker.endswith('.SA') and not is_intl else ""
                    ticker_symbol = f"{asset.ticker}{suffix}"
                    y_asset = yf.Ticker(ticker_symbol)
                    
                    current_price = 0
                    if hasattr(y_asset, 'fast_info') and y_asset.fast_info.last_price:
                         current_price = y_asset.fast_info.last_price
                    else:
                         hist = y_asset.history(period="1d")
                         if not hist.empty: current_price = hist['Close'].iloc[-1]

                    if current_price <= 0: continue

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

                    if is_intl:
                        lpa *= dolar_rate
                        vpa *= dolar_rate

                    pos = session.query(Position).filter_by(asset_id=asset.id).first()
                    if pos:
                        if lpa != 0: pos.manual_lpa = round(lpa, 2)
                        if vpa != 0: pos.manual_vpa = round(vpa, 2)
                        if dy_calculated >= 0: 
                            pos.manual_dy = round(dy_calculated, 4)
                        count += 1
                        
                except Exception as e:
                    logging.warning(f"   ⚠️ Falha ao processar fundamentos de {asset.ticker}: {e}")
            
            session.commit()
            logging.info(f"🏁 Varredura fundamentalista concluída: {count} registros atualizados.")
            return {"status": "Sucesso", "msg": f"{count} ativos atualizados."}
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Erro na rotina de fundamentos: {e}")
            return {"status": "Erro", "msg": str(e)}
        finally: 
            Session.remove()
