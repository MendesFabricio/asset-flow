# server/services.py
import sys
import os
import shutil
import yfinance as yf
import math
import pandas as pd
import time
import numpy as np
import pytz 
from datetime import datetime, date, timedelta
from sqlalchemy.orm import scoped_session, sessionmaker
import traceback

FNET_CACHE = {}
PENDING_REQUESTS = set() # <--- ESSENCIAL PARA NÃO TRAVAR
CACHE_EXPIRATION = 3600

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.models import Asset, Position, Category, MarketData, PortfolioSnapshot, engine

session_factory = sessionmaker(bind=engine)
Session = scoped_session(session_factory)
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
        """Retorna taxa do dólar com cache de 1 hora"""
        now = time.time()
        
        # 1. Se faz menos de 1 hora (3600s) que atualizou, usa o cache
        if (now - USD_CACHE["last_update"]) < 3600:
            return USD_CACHE["rate"]

        try:
            ticker = yf.Ticker("BRL=X")
            data = ticker.history(period="1d")
            if not data.empty: 
                rate = float(data['Close'].iloc[-1])
                
                # 2. Atualiza o cache global
                USD_CACHE["rate"] = rate
                USD_CACHE["last_update"] = now
                return rate
        except Exception as e:
            print(f"⚠️ Erro ao buscar Dólar: {e}")
        
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
        print("🔄 JOB: Atualizando Preços...", flush=True)
        session = Session()
        try:
            assets = session.query(Asset).filter(Asset.ticker != 'Nubank Caixinha').all()
            tickers_map = {}; download_list = []

            for asset in assets:
                ticker_raw = asset.ticker.strip().upper()
                
                # REGRA 2: Se tiver mais de 7 caracteres ou espaço, é manual.
                if len(ticker_raw) > 7 or " " in ticker_raw:
                    print(f"   ℹ️ {ticker_raw} ignorado (Regra: Manual/Longo)", flush=True)
                    continue

                # REGRA 3: Preparação para validar na bolsa (Yahoo)
                is_intl = asset.category and asset.category.name == 'Internacional'
                
                # Se for internacional, mas for o VWRA11 ou um BDR (termina em 39, 34, 11), precisa do .SA
                needs_sa = False
                if not ticker_raw.endswith('.SA'):
                    if not is_intl:
                        needs_sa = True # Ações e FIIs BR precisam
                    elif ticker_raw == 'VWRA11' or any(ticker_raw.endswith(s) for s in ['39', '34', '33', '11']):
                        needs_sa = True # Ativos BR dolarizados listados na B3
                
                symbol = f"{ticker_raw}.SA" if needs_sa else ticker_raw
                
                tickers_map[symbol] = asset
                download_list.append(symbol)

            if not download_list:
                return

            # REGRA 3 (Continuação): O yfinance valida se existe. 
            # Se não existir na bolsa, ele retorna um erro ou DataFrame vazio.
            batch_data = yf.download(download_list, period="6mo", group_by='ticker', threads=True, progress=False, auto_adjust=True)

            count_ok = 0
            for symbol, asset in tickers_map.items():
                try:
                    # Verifica se o Yahoo retornou dados para este ticker
                    hist = pd.DataFrame()
                    if len(download_list) == 1:
                        hist = batch_data
                    else:
                        if symbol in batch_data.columns:
                            hist = batch_data[symbol]
                    
                    hist = hist.dropna(how='all')
                    
                    # Se o Yahoo não encontrou (Regra 3), pulamos silenciosamente
                    if hist.empty or 'Close' not in hist.columns:
                        continue

                    # Se chegou aqui, o ativo existe na bolsa e é automático
                    current_price = float(hist['Close'].iloc[-1])
                    absolute_min_6m = float(hist['Low'].min())

                    change_pct = 0.0
                    if len(hist) >= 2:
                        prev_close = float(hist['Close'].iloc[-2]) # Penúltimo fechamento
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
            print(f"🏁 Atualizados: {count_ok} ativos de bolsa.", flush=True)
        except Exception as e:
            session.rollback()
            print(f"❌ Erro: {e}")
        finally:
            Session.remove()

    def _prioridade_alerta(self, txt):
        """Define a ordem de importância dos alertas no Radar."""
        if "🚨" in txt: return 0  # Risco Crítico
        if "🧠" in txt: return 1  # Valor Intrínseco
        if "💎" in txt: return 2  # Oportunidade Técnica
        if "⚓" in txt: return 3  # Suporte Histórico
        if "🔻" in txt: return 4  # Suporte Perto
        if "❗" in txt: return 5  # Ajuste de Carteira
        if "🔥" in txt: return 6  # Alerta de Topo
        return 7

    def record_confirmed_dividends(self):
        """Evita que o backend trave por falta desta função"""
        print("📅 [SERVICE] A verificar dividendos...", flush=True)
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

            # Primeiro Passo: Processamento Numérico Base
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

            # Segundo Passo: Inteligência de Estratégia e Alertas
            final_list = []
            alertas = []
            
            
            for item in ativos_proc:
                pos = item["obj"]
                cat_name = pos.asset.category.name
                total_cat = cat_totals.get(cat_name, 1)
                min_bruta = item["min_6m"]
                preco_atual = item["preco_atual"]

                last_report = None
                if pos.last_report_url:
                    last_report = {
                        "link": pos.last_report_url,
                        "date": pos.last_report_at,
                        "type": pos.last_report_type
                    }
                
                # Cálculos de Meta
                pct_na_categoria = (item["total_atual"] / total_cat * 100) if total_cat > 0 else 0
                meta_macro = cat_metas.get(cat_name, 0) / 100
                meta_micro = (pos.target_percent or 0) / 100
                meta_global_valor = resumo["Total"] * meta_macro * meta_micro
                falta = meta_global_valor - item["total_atual"]
                
                # Aplicação da Estratégia (Retorna Score e Motivos)
                rec_text, status, score, motivo, rsi = self._apply_strategy(
                    pos, item["metrics"], falta, item["preco_atual"], item["min_6m"]
                )
                
            # --- Geração de Alertas Baseada em Severidade ---
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
                        # Aqui mostramos o valor bruto da mínima que estava no banco
                            alertas.append(f"⚓ FUNDO: {pos.asset.ticker} na mínima de 6 meses (Ref: {moeda} {min_bruta:.2f})")
                        elif preco_atual <= min_bruta * 1.03:
                            alertas.append(f"🔻 PERTO DO FUNDO: {pos.asset.ticker} (Mínima: {moeda} {min_bruta:.2f})")

                fundamentalist_info = None
                if cat_name == 'Ação' and pos.asset.cvm_code:
                    try:
                        # Apenas lê o que já foi salvo durante a sincronização
                        fundamentalist_info = json.loads(pos.last_report_type)
                    except:
                        fundamentalist_info = None

                # Construção da lista de ativos para a tabela do Frontend
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

            # Ordenações Finais
            final_list.sort(key=lambda x: x["score"], reverse=True)
            alertas.sort(key=self._prioridade_alerta)

            # Preparação de dados de gráficos e categorias
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
            print(f"❌ Erro Crítico no Dashboard: {traceback.format_exc()}")
            return {"status": "Erro", "msg": str(e)}
        finally:
            Session.remove()



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

        # ======================================================
        # 1. LÓGICA ESPECÍFICA: RESERVA & RENDA FIXA
        # ======================================================
        if cat_name == "Reserva":
            if falta > 0:
                return "🚨 REPOR RESERVA", "COMPRA_FORTE", 100, "⚠️ Nível abaixo do ideal", 50
            else:
                return "✅ RESERVA OK", "NEUTRO", 50, "🛡️ Reserva completa", 50

        if cat_name == "Renda Fixa":
            # Renda fixa é puramente alocação (Score Capado em 85 para não distorcer o global)
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

        # ======================================================
        # 2. LÓGICA GERAL: RENDA VARIÁVEL
        # ======================================================
        
        # --- Critério 1: Alocação (Peso Aumentado para 30) ---
        # Aumentei o peso do rebalanceamento para competir melhor com valuation
        if falta > 0: 
            score += 30 
            motivos.append("⚖️ Abaixo da Meta (+30)")
        else: 
            score -= 10
            motivos.append("📊 Acima da Meta (-10)")

        # --- Critério 2: RSI (Momento) ---
        rsi = 50
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        if mdata:
            rsi = mdata.rsi_14 or 50
        
        if cat_name == "Cripto":
            motivos.append("⚡ Ativo de Volatilidade Alta") # Tag de consciência
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

        # --- Critério 3: Price Action (Mínimas) ---
        if min_6m > 0:
            if preco <= min_6m * 1.02: 
                score += 15
                motivos.append("⚓ Suporte: Mínima Semestral")
            elif preco <= min_6m * 1.05:
                score += 5
                motivos.append("📉 Próximo das Mínimas")

        # --- Critério 4: Análise Fundamentalista ---
        
        # >>> AÇÕES (Graham) <<<
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

        # >>> INTERNACIONAL (ETFs/Stocks) - Lógica Adaptada <<<
        elif cat_name == "Internacional":
            # ETFs geralmente não têm Graham confiável via API comum.
            # Focamos em DY ou Price Action, ou usamos um peso neutro se não tiver dados.
            # Se for Stock individual com Graham, usa. Se for ETF, ignora Graham para não punir.
            mg = metrics.get("mg_graham", 0)
            if mg != 0: # Só aplica se tiver dados reais
                if mg > 20: score += 15; motivos.append("💰 Valuation Atrativo")
                elif mg < -20: score -= 15; motivos.append("💸 Valuation Esticado")
            else:
                # Se não tem Graham (comum em ETFs), damos um bônus neutro para não ficar atrás de Ações
                score += 10 
                motivos.append("🌎 Alocação Global")

        # >>> FIIs (P/VP) <<<
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

        # ======================================================
        # 3. NORMALIZAÇÃO FINAL (Clamp 0-100)
        # ======================================================
        score = max(0, min(score, 100)) # Garante que nunca passe de 100 nem seja negativo

        # Definição de Status baseada no Score Final Normalizado
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
        except Exception as e: print(f"❌ Erro backup: {e}")

    def take_daily_snapshot(self):
        print("📸 JOB: Snapshot...")
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
        except: session.rollback()
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
        """
        Atualiza os dados de posição de um ativo.
        CORREÇÃO: Agora mapeia 'qtd' do frontend para 'quantity' do Model.
        """
        print(f"📝 JOB: Atualizando {ticker} -> Qtd: {qtd}, PM: {pm}, Meta: {meta}%")
        session = Session()
        try:
            # 1. Busca o ativo pelo ticker
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset: 
                return {"status": "Erro", "msg": f"Ativo {ticker} não encontrado"}
            
            # 2. Busca ou cria a posição vinculada (Tabela 'positions' no seu model)
            pos = session.query(Position).filter_by(asset_id=asset.id).first()
            if not pos:
                pos = Position(asset_id=asset.id)
                session.add(pos)
            
            # 3. MAPEAMENTO CORRETO PARA O MODEL
            # No seu models.py a coluna chama-se 'quantity', não 'qtd'
            pos.quantity = float(qtd) 
            pos.average_price = float(pm)
            pos.target_percent = float(meta)
            
            # Atualiza indicadores manuais
            pos.manual_dy = float(dy)
            pos.manual_lpa = float(lpa)
            pos.manual_vpa = float(vpa)
            
            # 4. Tratamento de Preço Manual
            if current_price is not None and str(current_price).strip() != "":
                mdata = session.query(MarketData).filter_by(asset_id=asset.id).first()
                if not mdata:
                    mdata = MarketData(asset_id=asset.id)
                    session.add(mdata)
                
                mdata.price = float(current_price)
                mdata.date = datetime.now() # Usando date do seu import
                mdata.min_6m = float(current_price) 
                
            session.commit()
            print(f"✅ Sucesso: {ticker} (Quantity: {pos.quantity}) salvo no banco.")
            return {"status": "Sucesso", "msg": "Dados e Preço Atualizados!"}
            
        except Exception as e:
            session.rollback()
            print(f"❌ Erro ao atualizar: {str(e)}")
            return {"status": "Erro", "msg": str(e)}
        finally:
            Session.remove()
        
    def add_new_asset(self, ticker, category_name, qtd, pm, meta=0):
        """
        Cria um novo ativo e sua posição inicial.
        """
        raw_ticker = ticker.upper().strip()
        
        # Lógica Inteligente de Moeda
        if raw_ticker.endswith(".SA"):
            currency = "BRL"  # Ex: WEGE3.SA, BDRs
        elif raw_ticker.endswith("-USD"):
            currency = "BRL"  # Ex: BTC-USD
        elif category_name == "Internacional":
            currency = "BRL" 
        else:
            currency = "BRL"  # Padrão para Ação, FII, Cripto genérico, ETF

        ticker = ticker.upper().strip().replace(".SA", "")
        print(f"🆕 JOB: Criando novo Ativo: {ticker}")
        session = Session()
        try:
            exists = session.query(Asset).filter_by(ticker=ticker).first()
            if exists: return {"status": "Erro", "msg": "Ativo já existe!"}
            
            category = session.query(Category).filter_by(name=category_name).first()
            if not category: category = session.query(Category).first()
            
            new_asset = Asset(ticker=ticker, category_id=category.id, currency=currency)
            session.add(new_asset)
            session.flush() # Garante que o new_asset.id seja gerado antes da Position
            
            # Criando a posição inicial com os nomes de colunas corretos do Model
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
            print(f"❌ Erro ao adicionar ativo: {e}")
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
        print("🎲 --- INICIANDO MONTE CARLO ---")
        session = Session()
        try:
            positions = session.query(Position).all()
            tickers = []
            weights = []
            total_value = 0.0
            
            for pos in positions:
                if not pos.asset: continue
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
                return {"status": "Erro", "msg": "Carteira vazia ou sem valor."}

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
            if close_prices.empty: return {"status": "Erro", "msg": "Dados insuficientes."}

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
            print(f"Erro validação: {e}")
            return {"valid": False, "ticker": None}
        
    def sync_reports_with_fnet(self):
        from crawlers.b3_fnet import B3FnetCrawler
        from utils.cnpj_finder import CNPJFinder
        from utils.cvm_finder import CVMFinder 
        from utils.cvm_processor import CVMProcessor
        import json
        import time

        session = Session()
        try:
            # 1. Busca ativos (FIIs e Ações)
            assets_to_sync = session.query(Position).join(Asset).join(Category).filter(
                Category.name.in_(["FII", "Ação"])
            ).all()

            count_fii = 0
            count_acao = 0

            for pos in assets_to_sync:
                asset = pos.asset
                ticker = asset.ticker.replace(".SA", "").strip().upper()
                is_fii = asset.category.name == "FII"
                
                # --- PASSO 1: GARANTIR CNPJ ---
                if not asset.cnpj or len(str(asset.cnpj)) < 14:
                    cnpj_encontrado = CNPJFinder.find_by_ticker(ticker)
                    if cnpj_encontrado:
                        asset.cnpj = cnpj_encontrado
                        session.flush()

                # --- PASSO 2: GARANTIR CÓDIGO CVM (Para Ações) ---
                if not is_fii and asset.cnpj and (not asset.cvm_code or asset.cvm_code == ""):
                    cnpj_limpo = "".join(filter(str.isdigit, str(asset.cnpj)))
                    codigo_cvm = CVMFinder.find_code(cnpj_limpo)
                    if codigo_cvm:
                        asset.cvm_code = codigo_cvm
                        print(f"✅ Código CVM Vinculado: {ticker} -> {codigo_cvm}")
                        session.flush()

                # --- PASSO 3: PROCESSAMENTO ---
                if is_fii and asset.cnpj:
                    # Tenta chamar a função (garantindo o nome exato do b3_fnet.py)
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
                        # 1. Gera a análise pesada apenas UMA vez aqui
                        analise_completa = CVMProcessor.get_dashboard_data(asset.cvm_code)
                        
                        if analise_completa:
                            # 2. SALVA o JSON pronto no banco de dados
                            pos.last_report_type = json.dumps(analise_completa)
                            pos.last_report_at = f"Balanço: {analise_completa['ticker_info']['ultimo_periodo']}"
                            count_acao += 1
                            print(f"📊 Análise persistida no banco: {ticker}")
                    except Exception as e:
                        print(f"⚠️ Erro ao processar CVM para {ticker}: {e}")

            session.commit()
            return {
                "status": "Sucesso", 
                "msg": f"FIIs: {count_fii} ativos. Ações: {count_acao} fundamentadas."
            }

        except Exception as e:
            session.rollback()
            print(f"🔥 Erro na sincronia: {traceback.format_exc()}")
            return {"status": "Erro", "msg": str(e)}
        finally:
            Session.remove()

    def get_correlation_matrix(self):
        print("🧮 JOB: Calculando Matriz de Correlação (Blindada)...")
        session = Session()
        try:
            # 1. Pega ativos com quantidade > 0
            positions = session.query(Position).filter(Position.quantity > 0).all()
            if not positions: return {"status": "Erro", "msg": "Carteira vazia."}

            # 2. Prepara lista de tickers
            tickers_map = {}
            download_list = []
            
            for pos in positions:
                if not pos.asset: continue
                ticker_clean = pos.asset.ticker.strip().upper()
                is_intl = pos.asset.category.name == 'Internacional'
                
                # Regra de Sufixo
                if not is_intl and not ticker_clean.endswith('.SA') and pos.asset.category.name != 'Cripto' and not ticker_clean.endswith('-USD'):
                     ticker_yf = f"{ticker_clean}.SA"
                else:
                     ticker_yf = ticker_clean
                
                tickers_map[ticker_yf] = ticker_clean 
                download_list.append(ticker_yf)

            # Validação Mínima de Ativos
            unique_assets = list(set(download_list))
            if len(unique_assets) < 2:
                return {"status": "Erro", "msg": "Precisa de pelo menos 2 ativos distintos para correlação."}

            # 3. Download Batch Seguro
            print(f"   ⬇️ Baixando histórico para {len(unique_assets)} ativos...")
            
            # auto_adjust=True: Já traz o preço ajustado por dividendos/splits (Fundamental!)
            raw_data = yf.download(unique_assets, period="1y", progress=False, auto_adjust=True)
            
            # --- BLINDAGEM 1: MultiIndex vs SingleIndex ---
            # O yfinance muda o retorno dependendo se baixou 1 ou N ativos, ou se falhou alguns.
            if isinstance(raw_data.columns, pd.MultiIndex):
                # Caso padrão: N ativos -> Temos nível 'Price' e nível 'Ticker'
                # Tentamos pegar 'Close', se não tiver (auto_adjust mata o Close as vezes), pegamos 'Adj Close' ou a coluna única
                try:
                    prices = raw_data['Close']
                except KeyError:
                    # Fallback se auto_adjust=True retornar apenas colunas diretas
                    prices = raw_data
            else:
                # Caso onde o MultiIndex colapsou (ex: só 1 ativo válido retornou)
                if 'Close' in raw_data.columns:
                    prices = raw_data[['Close']] # Mantém DataFrame
                else:
                    prices = raw_data # Assume que o que veio já é preço

            # 4. Limpeza e Validação Estatística
            # Remove colunas inteiramente vazias (ativos que falharam no download)
            prices = prices.dropna(axis=1, how='all')
            
            if prices.shape[1] < 2:
                 return {"status": "Erro", "msg": "Não foi possível obter dados para pelo menos 2 ativos."}

            # Calcula retornos e alinha datas (Inner Join das datas)
            returns = prices.pct_change()
            returns_clean = returns.dropna()
            
            # --- BLINDAGEM 2: Suficiência de Dados ---
            # Se a interseção de datas for muito pequena (ex: IPO recente), a correlação é ruído.
            days_in_common = returns_clean.shape[0]
            
            if days_in_common < 30:
                msg = f"Dados insuficientes: Apenas {days_in_common} dias em comum entre os ativos."
                print(f"⚠️ {msg}")
                return {"status": "Erro", "msg": msg}

            # Cálculo de Pearson
            corr_matrix = returns_clean.corr()

            # 5. Formatação JSON
            matrix_data = []
            assets_labels = [tickers_map.get(t, t) for t in corr_matrix.columns]
            
            for i, row_ticker in enumerate(corr_matrix.index):
                for j, col_ticker in enumerate(corr_matrix.columns):
                    val = corr_matrix.iloc[i, j]
                    
                    # Trata NaN/Infinity
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
            print(f"❌ Erro crítico na correlação: {e}")
            import traceback
            traceback.print_exc() # Imprime a pilha de erro no terminal do servidor
            return {"status": "Erro", "msg": "Erro interno no cálculo."}
        finally:
            Session.remove()
            

    def update_fundamentals(self):
        print("📊 JOB: Calculando Fundamentos...")
        session = Session()
        count = 0
        try:
            assets = session.query(Asset).join(Category).filter(
                Category.name.in_(['Ação', 'FII', 'Internacional', 'ETF', 'BDR'])
            ).all()
            
            # 1. Definimos o corte de 365 dias sem fuso horário (naive)
            cutoff_date = datetime.now() - timedelta(days=365)
            dolar_rate = self.get_usd_rate()

            for asset in assets:
                try:
                    is_intl = not asset.ticker.endswith('.SA') and asset.category.name == 'Internacional'
                    suffix = ".SA" if not asset.ticker.endswith('.SA') and not is_intl else ""
                    ticker_symbol = f"{asset.ticker}{suffix}"
                    y_asset = yf.Ticker(ticker_symbol)
                    
                    # Busca de preço atualizada
                    current_price = 0
                    if hasattr(y_asset, 'fast_info') and y_asset.fast_info.last_price:
                         current_price = y_asset.fast_info.last_price
                    else:
                         hist = y_asset.history(period="1d")
                         if not hist.empty: current_price = hist['Close'].iloc[-1]

                    if current_price <= 0: continue

                    # --- CORREÇÃO DO DIVIDEND YIELD ---
                    divs = y_asset.dividends
                    total_divs_val = 0.0
                    
                    if not divs.empty:
                        # 2. Removemos o fuso horário dos dividendos para bater com o cutoff_date
                        divs.index = divs.index.tz_localize(None)
                        
                        # 3. Filtramos e somamos garantindo conversão float
                        divs_last_12m = divs[divs.index >= cutoff_date]
                        total_divs_val = float(divs_last_12m.sum())

                    dy_calculated = total_divs_val / current_price if current_price > 0 else 0
                    
                    # Busca Info Fundamentalista
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
                        # Atualiza o DY se ele for maior que zero ou se já houver um valor
                        if dy_calculated >= 0: 
                            pos.manual_dy = round(dy_calculated, 4)
                        count += 1
                        
                except Exception as e:
                    print(f"   ⚠️ Falha em {asset.ticker}: {e}")
            
            session.commit()
            return {"status": "Sucesso", "msg": f"{count} ativos atualizados."}
        except Exception as e:
            session.rollback()
            return {"status": "Erro", "msg": str(e)}
        finally: 
            Session.remove()
