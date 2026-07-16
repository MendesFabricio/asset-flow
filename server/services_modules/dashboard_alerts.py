import logging
from decimal import Decimal

def _prioridade_alerta(item):
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

def build_alerts(ativos_proc, cat_totals, cat_metas, resumo, dashboard_service_instance, session):
    alertas = []
    
    for item in ativos_proc:
        pos = item["obj"]
        asset = pos.asset
        total_atual = item["total_atual"]
        cat_name = asset.category.name if asset.category else ""
        cat_total = cat_totals.get(cat_name, Decimal('1.0'))
        pct_na_categoria = (total_atual / cat_total) * Decimal('100.0') if cat_total > 0 else Decimal('0.0')
        rsi = item.get("rsi", 50.0)

        if cat_name != "Reserva" and cat_name != "Renda Fixa" and pos.target_percent > 0:
            excesso = pct_na_categoria / Decimal(str(pos.target_percent))
            if excesso > Decimal('2.0'):
                alertas.append({
                    "titulo": f"🚨 REBALANCEAR URGENTE: {asset.ticker}",
                    "significado": f"{asset.ticker} estourou o limite máximo de segurança da carteira ({float(pct_na_categoria):.1f}% vs meta {float(pos.target_percent):.1f}%).",
                    "acao": "Suspenda novas compras deste ativo. Como a exposição ultrapassou o dobro da meta, considere vender o excesso para efetuar um rebalanceamento ativo."
                })
            elif excesso > Decimal('1.5'):
                alertas.append({
                    "titulo": f"❗ REBALANCEAR: {asset.ticker}",
                    "significado": f"O peso de {asset.ticker} está acima da meta ideal ({float(pct_na_categoria):.1f}% vs meta {float(pos.target_percent):.1f}%).",
                    "acao": "Não realize vendas para evitar custos. Apenas direcione os novos aportes da carteira para outros ativos subalocados até diluir essa posição."
                })

        if cat_name == "Ação":
            mg = item["metrics"].get("mg_graham", Decimal('0.0'))
            if mg >= Decimal('50.0'):
                alertas.append({
                    "titulo": f"🧠 FUNDAMENTO: {asset.ticker}",
                    "significado": f"Preço de mercado está com desconto expressivo de {float(mg):.0f}% em relação ao Valor Justo Graham.",
                    "acao": "Excelente oportunidade para receber novos aportes no simulador inteligente."
                })
        elif cat_name == "FII":
            pvp = item["metrics"].get("p_vp", Decimal('1.0'))
            if Decimal('0.0') < pvp <= Decimal('0.85'):
                alertas.append({
                    "titulo": f"🧠 FUNDAMENTO: {asset.ticker}",
                    "significado": f"O FII está sendo negociado com desconto patrimonial atrativo (P/VP: {float(pvp):.2f}).",
                    "acao": "Forte candidato para novos aportes visando ganho de capital e yields maiores."
                })

        if rsi < 28:
            alertas.append({
                "titulo": f"💎 OPORTUNIDADE TÉCNICA: {asset.ticker}",
                "significado": f"O ativo está em região de forte sobrevenda no gráfico diário (RSI {rsi:.0f}).",
                "acao": "Aportar no ativo. Historicamente, sobrevendas agudas indicam probabilidade de repique de preços."
            })
        elif rsi > 78:
            if (pct_na_categoria / Decimal(str(pos.target_percent or 1))) >= Decimal('1.2'):
                alertas.append({
                    "titulo": f"🔥 ESTICADO: {asset.ticker}",
                    "significado": f"O preço de {asset.ticker} está muito esticado no curto prazo (RSI {rsi:.0f}) e o peso na carteira está acima da meta.",
                    "acao": "Evite comprar agora. Aguarde uma retração técnica para novos aportes."
                })

    try:
        corr_data = dashboard_service_instance.get_correlation_matrix(session, allow_compute=False)
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
        risk_data = dashboard_service_instance.calculate_risk_metrics(session, allow_compute=False)
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
                    "significado": "O retorno da carteira de renda variável foi inferior à taxa livre de risco nos últimos 12 meses.",
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

    alertas.sort(key=_prioridade_alerta)
    return alertas
