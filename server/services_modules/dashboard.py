# server/services_modules/dashboard.py
import logging
import math
import traceback
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.orm import joinedload
from database.models import Position, Asset, Category, Dividend, safe_commit
from database.session import Session

class DashboardService:
    def _prioridade_alerta(self, item):
        txt = item["titulo"] if isinstance(item, dict) else str(item)
        if "🚨" in txt: return 0  
        if "🔥" in txt: return 1  
        if "⚠️" in txt: return 2  
        if "⚡" in txt: return 3  
        if "🏆" in txt: return 4  
        if "🧠" in txt: return 5  
        if "💎" in txt: return 6  
        if "🛡️" in txt: return 7  
        if "⚓" in txt: return 8  
        if "🔻" in txt: return 9  
        if "❗" in txt: return 10 
        return 11

    def _extract_value(self, val):
        if val is None: 
            return Decimal('0.0')
        return Decimal(str(val))

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
        except Exception as calc_err:
            logging.debug(f"Erro ao calcular indicadores fundamentalistas extras: {calc_err}")
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

        if falta > Decimal('0.0'): 
            score += 30 
            motivos.append("⚖️ Abaixo da Meta (+30)")
        else: 
            score -= 10
            motivos.append("📊 Acima da Meta (-10)")

        rsi = 50.0
        try:
            mdata = pos.asset.market_data[0] if pos.asset.market_data else None
            if mdata and mdata.rsi_14 is not None:
                rsi = float(mdata.rsi_14)
        except Exception:
            pass

        if rsi < 30.0:
            score += 35
            motivos.append("💎 Região Sobrevendida (+35)")
        elif rsi > 70.0:
            score -= 20
            motivos.append("🔥 Região Sobrecomprada (-20)")

        if preco > Decimal('0.0') and min_6m > Decimal('0.0'):
            desconto = ((preco - min_6m) / min_6m) * Decimal('100.0')
            if desconto <= Decimal('15.0'):
                score += 15
                motivos.append(f"⚓ Desconto de 6 Meses (+15) [{float(desconto):.1f}%]")

        if cat_name == "Ação":
            mg = metrics.get("mg_graham", Decimal('0.0'))
            if mg >= Decimal('20.0'):
                score += 20
                motivos.append("🧠 Margem Graham de 20%+ (+20)")
        elif cat_name == "FII":
            pvp = metrics.get("p_vp", Decimal('1.0'))
            if Decimal('0.0') < pvp <= Decimal('0.92'):
                score += 20
                motivos.append("🧠 Desconto Patrimonial P/VP (+20)")

        if score >= 60:
            status = "COMPRA_FORTE" if score >= 80 else "COMPRAR"
            rec_text = "🟢 APORTAR FORTE" if score >= 80 else "🟢 APORTAR"
        elif score >= 25:
            status = "NEUTRO"
            rec_text = "🟡 MANTER"
        else:
            status = "EVITAR"
            rec_text = "🔴 EVITAR"
            
        return rec_text, status, score, " • ".join(motivos), rsi

    def get_dashboard_data(self):
        session = Session()
        try:
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
                if not asset: 
                    continue 

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
                except Exception as parse_err: 
                    qtd = Decimal('0.0')
                    pm = Decimal('0.0')
                    preco = Decimal('0.0')
                    min_6m = Decimal('0.0')
                    change_percent = Decimal('0.0')
                    logging.debug(f"Erro ao parsear dados do dashboard: {parse_err}")

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
                asset = pos.asset
                total_atual = item["total_atual"]
                total_investido = item["total_investido"]
                preco = item["preco_atual"]
                min_6m = item["min_6m"]
                change_percent = item["change_percent"]
                
                cat_name = asset.category.name if asset.category else ""
                cat_total = cat_totals.get(cat_name, Decimal('1.0'))
                pct_na_categoria = (total_atual / cat_total) * Decimal('100.0') if cat_total > 0 else Decimal('0.0')
                
                cat_target_pct = cat_metas.get(cat_name, Decimal('0.0'))
                meta_macro = cat_target_pct / Decimal('100.0')
                meta_micro = Decimal(str(pos.target_percent or 0)) / Decimal('100.0')
                meta_global_valor = resumo["Total"] * meta_macro * meta_micro
                falta = meta_global_valor - total_atual

                rec_text, status, score, motivo, rsi = self._apply_strategy(
                    pos, item["metrics"], falta, preco, min_6m
                )

                if status == "COMPRA_FORTE":
                    status_order = 0
                elif status == "COMPRAR":
                    status_order = 1
                elif status == "NEUTRO":
                    status_order = 2
                else:
                    status_order = 3

                final_list.append({
                    "id": asset.id,
                    "ticker": asset.ticker,
                    "nome": asset.name,
                    "cnpj": asset.cnpj or "",
                    "codigo_cvm": asset.cvm_code or "",
                    # --- Campos esperados pelo frontend (types.ts / AssetsTable) ---
                    "tipo": cat_name,           # frontend usa a.tipo para filtrar por aba
                    "categoria": cat_name,      # alias mantido para compatibilidade
                    "currency": asset.currency, # frontend usa currency p/ detectar USD
                    "moeda": asset.currency,
                    "fator": float(dolar_rate if asset.currency == 'USD' else 1),
                    "qtd": float(pos.quantity),         # frontend usa a.qtd
                    "quantidade": float(pos.quantity),  # alias
                    "pm": float(pos.average_price),     # frontend usa a.pm
                    "preco_medio": float(pos.average_price),
                    "preco_atual": float(preco),
                    "min_6m": float(min_6m),
                    "change_percent": float(change_percent),
                    "total_atual": float(total_atual),
                    "total_investido": float(total_investido),
                    "lucro_valor": float(total_atual - total_investido),  # frontend usa lucro_valor
                    "lucro": float(total_atual - total_investido),        # alias
                    "lucro_pct": float(((total_atual - total_investido) / total_investido * 100) if total_investido > 0 else 0),
                    "lucro_percent": float(((total_atual - total_investido) / total_investido * 100) if total_investido > 0 else 0),
                    "meta": float(pos.target_percent),           # frontend usa a.meta
                    "meta_carteira": float(pos.target_percent),  # alias
                    "pct_na_categoria": float(pct_na_categoria), # frontend usa pct_na_categoria
                    "participacao_categoria": float(pct_na_categoria),
                    "falta_comprar": float(falta) if falta > Decimal('0') else 0.0,  # frontend usa falta_comprar
                    "score": score,
                    "status": status,
                    "recomendacao": rec_text,
                    "motivo": motivo,
                    "status_order": status_order,
                    "rsi": rsi,
                    "last_report_url": pos.last_report_url,
                    "last_report_at": pos.last_report_at,
                    "last_report_type": pos.last_report_type,
                    "fundamentalist_data": pos.last_report_type,
                    **item["metrics"]
                })

                if cat_name != "Reserva" and cat_name != "Renda Fixa" and pos.target_percent > 0:
                    excesso = pct_na_categoria / Decimal(str(pos.target_percent))
                    if excesso > Decimal('2.0'):
                        alertas.append({
                            "titulo": f"🚨 REBALANCEAR URGENTE: {pos.asset.ticker}",
                            "significado": f"{pos.asset.ticker} estourou o limite máximo de segurança da carteira ({float(pct_na_categoria):.1f}% vs meta {float(pos.target_percent):.1f}%).",
                            "acao": "Suspenda novas compras deste ativo. Como a exposição ultrapassou o dobro da meta, considere vender o excesso para efetuar um rebalanceamento ativo."
                        })
                    elif excesso > Decimal('1.5'):
                        alertas.append({
                            "titulo": f"❗ REBALANCEAR: {pos.asset.ticker}",
                            "significado": f"O peso de {pos.asset.ticker} está acima da meta ideal ({float(pct_na_categoria):.1f}% vs meta {float(pos.target_percent):.1f}%).",
                            "acao": "Não realize vendas para evitar custos. Apenas direcione os novos aportes da carteira para outros ativos subalocados até diluir essa posição."
                        })

                if cat_name == "Ação":
                    mg = item["metrics"].get("mg_graham", Decimal('0.0'))
                    if mg >= Decimal('50.0'):
                        alertas.append({
                            "titulo": f"🧠 FUNDAMENTO: {pos.asset.ticker}",
                            "significado": f"Preço de mercado está com desconto expressivo de {float(mg):.0f}% em relação ao Valor Justo Graham.",
                            "acao": "Excelente oportunidade para receber novos aportes no simulador inteligente."
                        })
                elif cat_name == "FII":
                    pvp = item["metrics"].get("p_vp", Decimal('1.0'))
                    if Decimal('0.0') < pvp <= Decimal('0.85'):
                        alertas.append({
                            "titulo": f"🧠 FUNDAMENTO: {pos.asset.ticker}",
                            "significado": f"O FII está sendo negociado com desconto patrimonial atrativo (P/VP: {float(pvp):.2f}).",
                            "acao": "Forte candidato para novos aportes visando ganho de capital e yields maiores."
                        })

                if rsi < 28:
                    alertas.append({
                        "titulo": f"💎 OPORTUNIDADE TÉCNICA: {pos.asset.ticker}",
                        "significado": f"O ativo está em região de forte sobrevenda no gráfico diário (RSI {rsi:.0f}).",
                        "acao": "Aportar no ativo. Historicamente, sobrevendas agudas indicam probabilidade de repique de preços."
                    })
                elif rsi > 78:
                    if (pct_na_categoria / Decimal(str(pos.target_percent or 1))) >= Decimal('1.2'):
                        alertas.append({
                            "titulo": f"🔥 ESTICADO: {pos.asset.ticker}",
                            "significado": f"O preço de {pos.asset.ticker} está muito esticado no curto prazo (RSI {rsi:.0f}) e o peso na carteira está acima da meta.",
                            "acao": "Evite comprar agora. Aguarde uma retração técnica para novos aportes."
                        })

            try:
                corr_data = self.get_correlation_matrix(session)
                if corr_data.get("status") == "Sucesso":
                    pairs_reported = set()
                    for cell in corr_data.get("matrix", []):
                        tx, ty, val = cell["x"], cell["y"], cell["value"]
                        if tx != ty and val >= 0.82:
                            pair_key = tuple(sorted([tx, ty]))
                            if pair_key not in pairs_reported:
                                pairs_reported.add(pair_key)
                                alertas.append({
                                    "titulo": f"⚠️ CORRELAÇÃO CRÍTICA: {tx} e {ty}",
                                    "significado": f"Esses dois ativos possuem forte acoplamento de preço (EWMA: {val:.2f}), reduzindo a diversificação do portfólio.",
                                    "acao": "Evite comprar ambos no mesmo mês. Foque novos aportes em outros setores para aumentar a diversificação real."
                                })
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar alertas de correlação no Dashboard: {e}")

            try:
                risk_data = self.calculate_risk_metrics(session)
                if risk_data.get("status") == "Sucesso":
                    beta = risk_data.get("beta", 1.0)
                    sharpe = risk_data.get("sharpe_12m", 0.0)
                    var_monthly = risk_data.get("var_95_monthly_pct", 0.0)
                    mdd = risk_data.get("max_drawdown_pct", 0.0)

                    if beta > 1.35:
                        alertas.append({
                            "titulo": "⚡ SISTEMÁTICO: Carteira Agressiva",
                            "significado": f"O portfólio possui Beta sistemático de {beta:.2f}, oscilando com maior intensidade que o IBOVESPA.",
                            "acao": "Nenhuma ação de venda é necessária. Para equilibrar a volatilidade, considere direcionar novos aportes para Renda Fixa ou ativos defensivos."
                        })
                    elif beta < 0.65:
                        alertas.append({
                            "titulo": "🛡️ SISTEMÁTICO: Carteira Defensiva",
                            "significado": f"O portfólio possui Beta de {beta:.2f}, apresentando baixa sensibilidade ao comportamento do IBOVESPA.",
                            "acao": "Estrutura conservadora adequada para proteção. Caso queira acompanhar a alta do mercado, avalie aportar em ativos de Renda Variável com maior Beta."
                        })

                    if sharpe > 1.8:
                        alertas.append({
                            "titulo": "🏆 DESEMPENHO: Relação Retorno/Risco Notável",
                            "significado": f"O portfólio está gerando excelente retorno em relação ao risco corrido (Sharpe 12m: {sharpe:.2f}).",
                            "acao": "Mantenha a estratégia de aportes atual. A alocação está muito eficiente."
                        })
                    elif sharpe < 0.0:
                        alertas.append({
                            "titulo": "📉 DESEMPENHO: Sharpe Abaixo da Selic",
                            "significado": f"O retorno da carteira de renda variável foi inferior à taxa livre de risco nos últimos 12 meses.",
                            "acao": "Não venda ativos em pânico. Aproveite para focar seus novos aportes em ativos com margem de segurança (Desconto Graham)."
                        })

                    if var_monthly > 12.0:
                        alertas.append({
                            "titulo": "🔥 RISCO DE CAUDA: VaR Mensal Elevado",
                            "significado": f"Perda máxima esperada para o portfólio em cenários de estresse de até {var_monthly:.1f}% ao mês (95% confiança).",
                            "acao": "Aumente a alocação em Renda Fixa ou Reserva de Oportunidade nos próximos aportes mensais para atenuar o VaR."
                        })

                    if mdd < -25.0:
                        alertas.append({
                            "titulo": "⚠️ MÁXIMA QUEDA: Drawdown Acentuado",
                            "significado": f"O portfólio registrou recuo máximo pico-a-vale histórico de {mdd:.1f}%.",
                            "acao": "Esse é o risco inerente à renda variável. Mantenha os aportes regulares no simulador para fazer preço médio atrativo."
                        })
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar alertas de risco quantitativos no Dashboard: {e}")

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
            Session.remove()

    def get_single_asset_score_data(self, ticker):
        session = Session()
        try:
            pos = (
                session.query(Position)
                .join(Asset)
                .options(
                    joinedload(Position.asset).joinedload(Asset.category),
                    joinedload(Position.asset).selectinload(Asset.market_data)
                )
                .filter(Asset.ticker == ticker)
                .first()
            )
            if not pos:
                return None
                
            asset = pos.asset
            mdata = asset.market_data[0] if asset.market_data else None
            dolar_rate = self.get_usd_rate()
            
            try:
                qtd = Decimal(str(pos.quantity or 0))
                pm = Decimal(str(pos.average_price or 0))
                if mdata and mdata.price is not None and mdata.price > 0:
                    preco = Decimal(str(mdata.price))
                    min_6m = Decimal(str(mdata.min_6m or 0))
                else:
                    preco = Decimal('0.0')
                    min_6m = Decimal('0.0')
            except Exception:
                qtd = Decimal('0.0')
                pm = Decimal('0.0')
                preco = Decimal('0.0')
                min_6m = Decimal('0.0')
                
            fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
            total_atual = qtd * preco * fator
            
            active_positions = (
                session.query(Position)
                .join(Asset)
                .options(
                    joinedload(Position.asset).joinedload(Asset.category),
                    joinedload(Position.asset).selectinload(Asset.market_data)
                )
                .filter(Position.quantity > 0)
                .all()
            )
            
            portfolio_total = Decimal('0.0')
            category_total = Decimal('0.0')
            cat_name = asset.category.name if asset.category else ""
            
            for p in active_positions:
                pa = p.asset
                pmd = pa.market_data[0] if pa.market_data else None
                pprice = Decimal(str(pmd.price or p.average_price or 0.0)) if pmd else Decimal(str(p.average_price or 0.0))
                pfator = dolar_rate if pa.currency == 'USD' else Decimal('1.0')
                pval = Decimal(str(p.quantity or 0)) * pprice * pfator
                
                portfolio_total += pval
                if pa.category and pa.category.name == cat_name:
                    category_total += pval
                    
            metrics = self._calculate_metrics(pos, preco, min_6m)
            
            cat_target = Decimal(str(asset.category.target_percent or 0)) if asset.category else Decimal('0.0')
            meta_macro = cat_target / Decimal('100.0')
            meta_micro = Decimal(str(pos.target_percent or 0)) / Decimal('100.0')
            meta_global_valor = portfolio_total * meta_macro * meta_micro
            falta = meta_global_valor - total_atual
            
            rec_text, status, score, motivo, rsi = self._apply_strategy(
                pos, metrics, falta, preco, min_6m
            )
            
            return {
                "score": score,
                "recomendacao": rec_text,
                "status": status,
                "motivo": motivo,
                "rsi": rsi,
                **metrics
            }
        finally:
            Session.remove()
