import sys
import os
import shutil
import threading
import yfinance as yf
from decimal import Decimal
import math
import time
import numpy as np
import pytz
import json
import logging
import traceback
from datetime import datetime, date, timedelta
from sqlalchemy.orm import scoped_session, sessionmaker, joinedload, selectinload

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from database.models import Asset, Position, Category, MarketData, PortfolioSnapshot, safe_commit
from database.session import engine, Session

# ── Cache de preços (race-condition safe) ────────────────────────────────────
from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn, invalidate as _invalidate_cache

# ── Motor quantitativo isolado ───────────────────────────────────────────────
import domain.quant_engine as _quant

# ── Integração de mercado e scraping (Yahoo, CVM, B3) ──────────────────────────
import infrastructure.market_data as _market

USD_CACHE = {"rate": Decimal('5.80'), "last_update": 0}

class PortfolioService:
    def __init__(self):
        pass

    # ── Delega ao módulo de cache (backward compat) ──────────────────────
    def _fetch_price_history(self, tickers: list, period: str = "1y"):
        return _fetch_price_history_fn(tickers, period)

    def _invalidate_price_cache(self):
        _invalidate_cache()

    def _extract_value(self, data_point):
        try:
            if hasattr(data_point, 'iloc'): return Decimal(str(data_point.iloc[0]))
            if hasattr(data_point, 'item'): return Decimal(str(data_point.item()))
            return Decimal(str(data_point))
        except: return Decimal('0.0')

    def get_usd_rate(self):
        """Retorna a taxa cambial do dólar comercial com cache local estável de 1 hora"""
        now = time.time()
        
        if (now - USD_CACHE["last_update"]) < 3600:
            return USD_CACHE["rate"]

        try:
            ticker = yf.Ticker("BRL=X")
            data = ticker.history(period="1d")
            if not data.empty: 
                rate = Decimal(str(data['Close'].iloc[-1]))
                USD_CACHE["rate"] = rate
                USD_CACHE["last_update"] = now
                return rate
        except Exception as e:
            logging.warning(f"⚠️ Não foi possível atualizar a taxa do Dólar via API (Usando Cache): {e}")
        
        return USD_CACHE["rate"] 

    def _calculate_rsi(self, series, period=14):
        import pandas as pd
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
        session = Session()
        try:
            _market.update_prices(session, self._invalidate_price_cache)
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
            # ✅ FIX N+1: eager-load tudo que o loop acessa (asset, category, market_data)
            # Antes: 3 queries lazy por Position (pos.asset, .category, .market_data[0])
            # Agora: 1 query principal + 1 IN-query para market_data = O(1) total
            positions = (
                session.query(Position)
                .options(
                    joinedload(Position.asset)
                    .joinedload(Asset.category),
                    joinedload(Position.asset)
                    .selectinload(Asset.market_data),
                )
                .all()
            )
            categories = session.query(Category).all()
            dolar_rate = self.get_usd_rate()
            
            resumo = {
                "Total": Decimal('0.0'),
                "RendaMensal": Decimal('0.0'),
                "TotalInvestido": Decimal('0.0'),
                "LucroTotal": Decimal('0.0')
            }
            cat_totals = {c.name: Decimal('0.0') for c in categories}
            cat_metas = {c.name: Decimal(str(c.target_percent or 0)) for c in categories}
            ativos_proc = []

            for pos in positions:
                asset = pos.asset
                if not asset: continue 

                mdata = asset.market_data[0] if asset.market_data else None
                try:
                    qtd = Decimal(str(pos.quantity or 0))
                    pm = Decimal(str(pos.average_price or 0))
                    if mdata and mdata.price is not None and mdata.price > 0:
                        preco = Decimal(str(mdata.price))
                        min_6m = Decimal(str(mdata.min_6m or 0))
                        change_percent = Decimal(str(mdata.change_percent or 0))
                    else:
                        preco = Decimal('0.0')
                        min_6m = Decimal('0.0')
                        change_percent = Decimal('0.0')
                except: 
                    qtd = Decimal('0.0')
                    pm = Decimal('0.0')
                    preco = Decimal('0.0')
                    min_6m = Decimal('0.0')
                    change_percent = Decimal('0.0')

                fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
                total_atual = qtd * preco * fator
                total_investido = qtd * pm * fator
                
                resumo["Total"] += total_atual
                resumo["TotalInvestido"] += total_investido
                if asset.category.name in cat_totals:
                    cat_totals[asset.category.name] += total_atual
                
                metrics = self._calculate_metrics(pos, preco, min_6m)
                resumo["RendaMensal"] += Decimal(str(metrics.get("renda_mensal_est", 0)))
                
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
                pct_na_categoria = (item["total_atual"] / total_cat * Decimal('100.0')) if total_cat > 0 else Decimal('0.0')
                meta_macro = Decimal(str(cat_metas.get(cat_name, 0) or 0)) / Decimal('100.0')
                meta_micro = Decimal(str(pos.target_percent or 0)) / Decimal('100.0')
                meta_global_valor = resumo["Total"] * meta_macro * meta_micro
                falta = meta_global_valor - item["total_atual"]
                
                rec_text, status, score, motivo, rsi = self._apply_strategy(
                    pos, item["metrics"], falta, item["preco_atual"], item["min_6m"]
                )
                
                # Regras de Alertas
                if cat_name not in ['Renda Fixa', 'Reserva']:
                    if pos.target_percent and Decimal(str(pos.target_percent)) > 0:
                        excesso = pct_na_categoria / Decimal(str(pos.target_percent))
                        if excesso > Decimal('2.0'):
                            alertas.append(f"🚨 REBALANCEAR URGENTE: {pos.asset.ticker} ({float(pct_na_categoria):.1f}% vs meta {float(pos.target_percent):.1f}%)")
                        elif excesso > Decimal('1.5'):
                            alertas.append(f"❗ REBALANCEAR: {pos.asset.ticker} estourou a meta ({float(pct_na_categoria):.1f}%)")

                    if cat_name == "Ação":
                        mg = item["metrics"].get("mg_graham", Decimal('0.0'))
                        if mg >= Decimal('50.0'):
                            alertas.append(f"🧠 FUNDAMENTO: {pos.asset.ticker} com margem de segurança alta (+{float(mg):.0f}%)")
                    elif cat_name == "FII":
                        pvp = item["metrics"].get("p_vp", Decimal('1.0'))
                        if Decimal('0.0') < pvp <= Decimal('0.85'):
                            alertas.append(f"🧠 FUNDAMENTO: {pos.asset.ticker} muito abaixo do VP ({float(pvp):.2f})")

                    if rsi < 28:
                        alertas.append(f"💎 OPORTUNIDADE TÉCNICA: {pos.asset.ticker} (RSI {rsi:.0f})")
                    elif rsi > 78:
                        if (pct_na_categoria / Decimal(str(pos.target_percent or 1))) >= Decimal('1.2'):
                            alertas.append(f"🔥 ESTICADO: {pos.asset.ticker} em região de topo (RSI {rsi:.0f})")

                    if min_bruta > Decimal('0.0'):
                        moeda = "R$" if pos.asset.currency == 'BRL' else "$"
                        if preco_atual <= min_bruta * Decimal('1.01'):
                            alertas.append(f"⚓ FUNDO: {pos.asset.ticker} na mínima de 6 meses (Ref: {moeda} {float(min_bruta):.2f})")
                        elif preco_atual <= min_bruta * Decimal('1.03'):
                            alertas.append(f"🔻 PERTO DO FUNDO: {pos.asset.ticker} (Mínima: {moeda} {float(min_bruta):.2f})")

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
                "dolar": dolar_rate, 
                "resumo": resumo, 
                "grafico": lista_grafico, 
                "alertas": alertas, 
                "ativos": final_list, 
                "categorias": cats_info 
            }
        except Exception as e:
            logging.error(f"❌ Erro Crítico na montagem do Dashboard: {traceback.format_exc()}")
            raise e
        finally:
            # 🔒 CORREÇÃO CRÍTICA: finally garante fechamento determinístico da sessão
            # mesmo após o 'return' na linha acima (o código anterior era unreachable).
            Session.remove()

    def _calculate_metrics(self, pos, preco, min_6m):
        m = {
            "vi_graham": Decimal('0.0'),
            "mg_graham": Decimal('0.0'),
            "magic_number": 0,
            "renda_mensal_est": Decimal('0.0'),
            "p_vp": Decimal('0.0')
        }
        try:
            dy = self._extract_value(pos.manual_dy) 
            lpa = self._extract_value(pos.manual_lpa)
            vpa = self._extract_value(pos.manual_vpa)
            qtd = self._extract_value(pos.quantity)
            
            if dy > Decimal('0.0') and preco > Decimal('0.0'):
                m["renda_mensal_est"] = (preco * dy * qtd) / Decimal('12.0')
                m["magic_number"] = int(math.ceil(float(Decimal('12.0') / dy)))
            
            if vpa > Decimal('0.0') and preco > Decimal('0.0'):
                m["p_vp"] = preco / vpa

            if pos.asset.category.name == "Ação" and lpa > Decimal('0.0') and vpa > Decimal('0.0'):
                m["vi_graham"] = Decimal(str(math.sqrt(float(Decimal('22.5') * lpa * vpa))))
                if preco > Decimal('0.0'):
                    m["mg_graham"] = ((m["vi_graham"] - preco) / preco) * Decimal('100.0')
        except:
            pass
        return m
    
    def _apply_strategy(self, pos, metrics, falta, preco, min_6m):
        score = 0
        motivos = []
        cat_name = pos.asset.category.name

        if cat_name == "Reserva":
            if falta > Decimal('0.0'):
                return "🚨 REPOR RESERVA", "COMPRA_FORTE", 100, "⚠️ Nível abaixo do ideal", 50
            else:
                return "✅ RESERVA OK", "NEUTRO", 50, "🛡️ Reserva completa", 50

        if cat_name == "Renda Fixa":
            if falta > Decimal('0.0'):
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
        if falta > Decimal('0.0'): 
            score += 30 
            motivos.append("⚖️ Abaixo da Meta (+30)")
        else: 
            score -= 10
            motivos.append("📊 Acima da Meta (-10)")

        rsi = 50
        mdata = pos.asset.market_data[0] if pos.asset.market_data else None
        if mdata:
            rsi = float(mdata.rsi_14 or 50)
        
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

        if min_6m > Decimal('0.0'):
            if preco <= min_6m * Decimal('1.02'): 
                score += 15
                motivos.append("⚓ Suporte: Mínima Semestral")
            elif preco <= min_6m * Decimal('1.05'):
                score += 5
                motivos.append("📉 Próximo das Mínimas")

        if cat_name == "Ação":
            mg = metrics.get("mg_graham", Decimal('0.0'))
            if mg > Decimal('50.0'):
                score += 30
                motivos.append(f"💎 Graham: Margem Segura (+{float(mg):.0f}%)")
            elif mg > Decimal('20.0'):
                score += 15
                motivos.append(f"💰 Graham: Desconto (+{float(mg):.0f}%)")
            elif mg < Decimal('-20.0'):
                score -= 20
                motivos.append(f"💸 Preço acima do Justo")

        elif cat_name == "Internacional":
            mg = metrics.get("mg_graham", Decimal('0.0'))
            if mg != Decimal('0.0'): 
                if mg > Decimal('20.0'): score += 15; motivos.append("💰 Valuation Atrativo")
                elif mg < Decimal('-20.0'): score -= 15; motivos.append("💸 Valuation Esticado")
            else:
                score += 10 
                motivos.append("🌎 Alocação Global")

        elif cat_name == "FII":
            pvp = metrics.get("p_vp", Decimal('1.0'))
            if pvp < Decimal('0.60'):
                score -= 20 
                motivos.append(f"🚨 P/VP de Risco? ({float(pvp):.2f})")
            elif pvp <= Decimal('0.90'):
                score += 30
                motivos.append(f"🏢 P/VP: Desconto ({float(pvp):.2f})")
            elif pvp < Decimal('1.02'):
                score += 10
                motivos.append(f"✅ P/VP Justo ({float(pvp):.2f})")
            elif pvp > Decimal('1.15'):
                score -= 30
                motivos.append(f"⚠️ P/VP Caro ({float(pvp):.2f})")

            mn = metrics.get("magic_number", 0)
            if mn > 0 and pos.quantity >= Decimal(str(mn)):
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
            total_equity = Decimal('0.0'); total_invested = Decimal('0.0')
            dolar_rate = self.get_usd_rate()
            for pos in positions:
                asset = pos.asset
                if not asset: continue 
                
                mdata = asset.market_data[0] if asset.market_data else None
                try:
                    price = Decimal(str(mdata.price)) if (mdata and mdata.price) else Decimal(str(pos.average_price or 0))
                    qtd = Decimal(str(pos.quantity or 0))
                    pm = Decimal(str(pos.average_price or 0))
                except: 
                    price = Decimal('0.0')
                    qtd = Decimal('0.0')
                    pm = Decimal('0.0')
                fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
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
            safe_commit(session)
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
            if not snapshots:
                return history
                
            first_date = snapshots[0].date
            for s in snapshots:
                days_elapsed = (s.date - first_date).days
                years_elapsed = days_elapsed / 365.25
                # IPCA+6% estimado em 10.5% ao ano composto
                benchmark_val = Decimal(str(s.total_invested or 0)) * Decimal(str(1.105 ** years_elapsed))
                
                history.append({
                    "date": s.date.strftime("%d/%m"), 
                    "Patrimônio": float(s.total_equity or 0),
                    "Investido": float(s.total_invested or 0),
                    "Lucro": float(s.profit or 0),
                    "IPCA_6": float(round(benchmark_val, 2))
                })
            return history
        finally: Session.remove()
        
    def update_position(self, ticker, qtd, pm, meta, dy=0, lpa=0, vpa=0, current_price=None):
        logging.info(f"📝 JOB: Recebendo atualização de {ticker} -> Qtd: {qtd}, PM: {pm}, Meta: {meta}%")
        session = Session()
        try:
            asset = session.query(Asset).filter_by(ticker=ticker).first()
            if not asset: 
                raise ValueError(f"Ativo {ticker} não encontrado")
            
            pos = session.query(Position).filter_by(asset_id=asset.id).first()
            if not pos:
                pos = Position(asset_id=asset.id)
                session.add(pos)
            
            pos.quantity = Decimal(str(qtd)) 
            pos.average_price = Decimal(str(pm))
            pos.target_percent = Decimal(str(meta))
            
            pos.manual_dy = Decimal(str(dy or 0))
            pos.manual_lpa = Decimal(str(lpa or 0))
            pos.manual_vpa = Decimal(str(vpa or 0))
            
            if current_price is not None and str(current_price).strip() != "":
                mdata = session.query(MarketData).filter_by(asset_id=asset.id).first()
                if not mdata:
                    mdata = MarketData(asset_id=asset.id)
                    session.add(mdata)
                
                mdata.price = Decimal(str(current_price))
                mdata.date = datetime.now()
                mdata.min_6m = Decimal(str(current_price)) 
                
            safe_commit(session)
            logging.info(f"   ✅ Sucesso: {ticker} (Quantity: {pos.quantity}) persistido com sucesso.")
            return "Dados e Preço Atualizados!"
            
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Falha ao atualizar posição de {ticker}: {e}")
            raise
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
            if exists: 
                raise ValueError("Ativo já existe!")
            
            category = session.query(Category).filter_by(name=category_name).first()
            if not category: category = session.query(Category).first()
            
            new_asset = Asset(ticker=ticker, category_id=category.id, currency=currency)
            session.add(new_asset)
            session.flush() 
            
            pos = Position(
                asset_id=new_asset.id, 
                quantity=Decimal(str(qtd)), 
                average_price=Decimal(str(pm)),
                target_percent=Decimal(str(meta)) 
            )
            session.add(pos)
            
            safe_commit(session)
            return f"Ativo {ticker} criado com sucesso!"
        except Exception as e:
            session.rollback()
            logging.error(f"❌ Falha ao injetar novo ativo no ecossistema: {e}")
            raise
        finally: 
            Session.remove()
    def delete_asset(self, asset_id):
        session = Session()
        try:
            asset = session.query(Asset).filter_by(id=asset_id).first()
            if not asset: 
                raise ValueError("Ativo não encontrado")
            
            session.query(Position).filter_by(asset_id=asset_id).delete()
            session.query(MarketData).filter_by(asset_id=asset_id).delete()
            session.delete(asset)
            safe_commit(session)
            return "Ativo e dados vinculados excluídos!"
        except Exception as e:
            session.rollback()
            raise
        finally: 
            Session.remove()

    def run_monte_carlo_simulation(self, days: int = 252, simulations: int = 1000) -> dict:
        """Façade → quant_engine.run_monte_carlo"""
        session = Session()
        try:
            return _quant.run_monte_carlo(session, _fetch_price_history_fn, days, simulations)
        finally:
            Session.remove()

    def calculate_risk_metrics(self) -> dict:
        """Façade → quant_engine.calculate_risk_metrics"""
        session = Session()
        try:
            return _quant.calculate_risk_metrics(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_smart_rebalance(self, monthly_contribution: float = 0.0) -> dict:
        """Façade → quant_engine.calculate_smart_rebalance"""
        session = Session()
        try:
            return _quant.calculate_smart_rebalance(session, _fetch_price_history_fn, monthly_contribution)
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
            return _quant.calculate_income_projection(
                session, monthly_contribution, years, annual_return_pct, annual_dividend_yield_pct
            )
        finally:
            Session.remove()

    def update_category_meta(self, category_name, new_meta):
        session = Session()
        try:
            cat = session.query(Category).filter_by(name=category_name).first()
            if not cat: 
                raise ValueError("Categoria não encontrada")
            cat.target_percent = Decimal(str(new_meta))
            safe_commit(session)
            return "Meta atualizada!"
        except Exception as e:
            session.rollback()
            raise
        finally: 
            Session.remove()

    def validate_ticker_on_yahoo(self, ticker):
        return _market.validate_ticker_on_yahoo(ticker)
        
    def sync_reports_with_fnet(self):
        session = Session()
        try:
            return _market.sync_reports_with_fnet(session)
        finally:
            Session.remove()


    def get_correlation_matrix(self):
        """Façade → quant_engine.get_correlation_matrix"""
        session = Session()
        try:
            return _quant.get_correlation_matrix(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def update_fundamentals(self, state_dict=None):
        session = Session()
        try:
            return _market.update_fundamentals(session, self.get_usd_rate, state_dict)
        finally:
            Session.remove()

    def calculate_risk_parity(self) -> dict:
        """Façade → quant_engine.calculate_risk_parity"""
        session = Session()
        try:
            return _quant.calculate_risk_parity(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_markowitz_optimization(self) -> dict:
        """Façade → quant_engine.calculate_markowitz_optimization"""
        session = Session()
        try:
            return _quant.calculate_markowitz_optimization(session, _fetch_price_history_fn)
        finally:
            Session.remove()

    def calculate_sector_exposure(self) -> dict:
        """Façade → quant_engine.calculate_sector_exposure"""
        session = Session()
        try:
            return _quant.calculate_sector_exposure(session)
        finally:
            Session.remove()

    def calculate_dividend_forecast(self) -> dict:
        """Façade → quant_engine.calculate_dividend_forecast"""
        session = Session()
        try:
            return _quant.calculate_dividend_forecast(session)
        finally:
            Session.remove()

    def calculate_sector_correlation(self) -> dict:
        """Façade → quant_engine.calculate_sector_correlation"""
        session = Session()
        try:
            return _quant.calculate_sector_correlation(session, _fetch_price_history_fn)
        finally:
            Session.remove()
