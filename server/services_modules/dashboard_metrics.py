import math
from decimal import Decimal
from domain.valuation.calculator import (
    calculate_bazin_price,
    calculate_gordon_price,
    calculate_graham_price,
)

def _extract_value(val):
    if val is None: 
        return Decimal('0.0')
    return Decimal(str(val))

def calculate_fundamental_metrics(pos, preco, fator=Decimal('1.0')):
    m = {
        "vi_graham": Decimal('0.0'),
        "mg_graham": Decimal('0.0'),
        "bazin_price": Decimal('0.0'),
        "mg_bazin": Decimal('0.0'),
        "gordon_price": Decimal('0.0'),
        "magic_number": 0,
        "renda_mensal_est": Decimal('0.0'),
        "p_vp": Decimal('0.0')
    }
    try:
        dy = _extract_value(pos.manual_dy) 
        lpa = _extract_value(pos.manual_lpa)
        vpa = _extract_value(pos.manual_vpa)
        qtd = _extract_value(pos.quantity)
        cat_name = pos.asset.category.name if pos.asset and pos.asset.category else ""
        
        if dy > Decimal('0.0') and preco > Decimal('0.0'):
            m["renda_mensal_est"] = (preco * dy * qtd) / Decimal('12.0')
            if cat_name == "FII":
                m["magic_number"] = int(math.ceil(float(Decimal('12.0') / dy)))

            annual_div_per_share = float(preco * dy)
            desired_dy = 8.0 if cat_name == "FII" else 6.0
            bazin_val = calculate_bazin_price(annual_div_per_share, desired_dy)
            if bazin_val:
                m["bazin_price"] = Decimal(str(bazin_val))
                m["mg_bazin"] = ((m["bazin_price"] - preco) / preco) * Decimal('100.0')
            if cat_name == "Ação":
                gordon_val = calculate_gordon_price(annual_div_per_share, 12.0, 5.0)
                if gordon_val:
                    m["gordon_price"] = Decimal(str(gordon_val))
        
        if vpa > Decimal('0.0') and preco > Decimal('0.0'):
            m["p_vp"] = (preco * _extract_value(fator)) / vpa

        if cat_name == "Ação" and lpa > Decimal('0.0') and vpa > Decimal('0.0'):
            vi = calculate_graham_price(float(lpa), float(vpa))
            if vi:
                m["vi_graham"] = Decimal(str(vi))
                if preco > Decimal('0.0'):
                    m["mg_graham"] = ((m["vi_graham"] - preco) / preco) * Decimal('100.0')
    except Exception:
        pass
    return m

def apply_strategy(pos, metrics, falta, preco, min_6m, screener_item=None):
    score = 0
    motivos = []
    cat_name = pos.asset.category.name if pos.asset and pos.asset.category else ""

    if cat_name == "Reserva":
        if falta > Decimal('0.0'):
            return "🚨 REPOR RESERVA", "COMPRA_FORTE", 100, "⚠️ Nível abaixo do ideal", 50
        else:
            return "✅ RESERVA OK", "NEUTRO", 50, "🛡️ Reserva completa", 50

    if cat_name == "Renda Fixa":
        if falta > Decimal('0.0'):
            score = 60 
            motivos.append("💰 Aporte Mensal / Rebalanceamento (+60)")
            status = "COMPRAR"
            rec_text = "🟢 APORTAR"
        else:
            score = 40
            motivos.append("⚖️ Alocação Atingida")
            status = "AGUARDAR"
            rec_text = "🟡 MANTER"
        return rec_text, status, score, " • ".join(motivos), 50

    if falta > Decimal('0'):
        score += 25
        motivos.append("⚖️ Abaixo do Alvo (+25)")
    else:
        score -= 20
        motivos.append("📊 Acima da Meta (-20)")

    # DY Bonus
    if pos.quantity and pos.quantity > 0:
        try:
            dy_percent = _extract_value(pos.manual_dy) * 100
            if dy_percent > Decimal('6.0'):
                score += 8
                motivos.append(f"💰 Bom Pagador de Dividendos (+8) [{float(dy_percent):.1f}%]")
        except Exception:
            pass

    rsi = 50.0
    try:
        if pos.asset.market_data and pos.asset.market_data[0].rsi_14 is not None:
            rsi = float(pos.asset.market_data[0].rsi_14)
        else:
            ta = getattr(pos.asset, 'technical_data', None)
            if ta:
                import json
                df = json.loads(ta.raw_data)
                if df and isinstance(df, list):
                    last = df[-1]
                    rsi = float(last.get('rsi_14', 50.0))
    except Exception:
        pass

    if rsi < 30.0:
        score += 20
        motivos.append("💎 Região Sobrevendida (+20)")
    elif rsi > 70.0:
        score -= 20
        motivos.append("🔥 Região Sobrecomprada (-20)")

    if preco > Decimal('0.0') and min_6m > Decimal('0.0'):
        desconto = ((preco - min_6m) / min_6m) * Decimal('100.0')
        if desconto <= Decimal('15.0'):
            score += 10
            motivos.append(f"⚓ Desconto de 6 Meses (+10) [{float(desconto):.1f}%]")

    criterios_nao_avaliados = []
    mg_graham = metrics.get("mg_graham", Decimal('0.0'))
    pvp = metrics.get("p_vp", Decimal('0.0'))

    if cat_name == "Ação":
        if mg_graham == Decimal('0.0'):
            criterios_nao_avaliados.append("Graham (LPA/VPA)")
        elif mg_graham >= Decimal('20.0'):
            score += 15
            motivos.append("🧠 Margem Graham de 20%+ (+15)")
        elif mg_graham <= Decimal('-20.0'):
            score -= 15
            motivos.append("🚨 Empresa Cara por Graham (-15)")
    elif cat_name == "FII":
        if pvp <= Decimal('0.0'):
            criterios_nao_avaliados.append("P/VP")
        elif pvp <= Decimal('0.95'):
            score += 15
            motivos.append("🧠 Desconto Patrimonial P/VP (+15)")
        elif pvp >= Decimal('1.05'):
            score -= 15
            motivos.append("🚨 FII com Ágio P/VP (-15)")
        try:
            if pos.last_report_type:
                import json
                rep = json.loads(pos.last_report_type)
                lev = (rep.get("credit_risk") or {}).get("leverage_pct")
                if lev is not None and float(lev) > 30.0:
                    score -= 15
                    motivos.append(f"🏦 Alavancagem FII Elevada (-15) [{float(lev):.1f}%]")
        except Exception:
            pass
    elif cat_name == "Cripto":
        if preco > Decimal('0.0') and min_6m > Decimal('0.0'):
            desconto = ((preco - min_6m) / min_6m) * Decimal('100.0')
            if Decimal('15.0') < desconto <= Decimal('35.0'):
                score += 15
                motivos.append(f"⛏️ Acúmulo Estratégico Crypto (+15) [{float(desconto):.1f}% da mínima]")

    # Preço Teto Bazin (Ações e FIIs)
    mg_bazin = float(metrics.get("mg_bazin") or 0.0)
    if mg_bazin == 0.0 and screener_item and getattr(screener_item, "bazin_price", None) and preco > Decimal('0.0'):
        mg_bazin = ((float(screener_item.bazin_price) - float(preco)) / float(preco)) * 100.0
    if cat_name in ("Ação", "FII"):
        if mg_bazin == 0.0:
            criterios_nao_avaliados.append("Teto Bazin")
        elif mg_bazin >= 15.0:
            score += 10
            motivos.append(f"🎯 Abaixo do Teto Bazin (+10) [+{mg_bazin:.1f}%]")
        elif mg_bazin <= -20.0:
            score -= 10
            motivos.append(f"📈 Acima do Teto Bazin (-10) [{mg_bazin:.1f}%]")

    # Qualidade Fundamentalista (Checklist / Radar) — 0 deve ser penalizado (nao ignorado por truthiness)
    q_raw = getattr(screener_item, "quality_score", None) if screener_item is not None else None
    if q_raw is not None:
        q_score = int(q_raw)
        if q_score >= 75:
            score += 10
            motivos.append(f"🛡️ Alta Qualidade Fundamentalista (+10) [{q_score}/100]")
        elif q_score < 45:
            score -= 15
            motivos.append(f"⚠️ Qualidade Fundamentalista Baixa (-15) [{q_score}/100]")
    elif cat_name in ("Ação", "FII"):
        criterios_nao_avaliados.append("Qualidade Fundamentalista")

    # Sentimento de Notícias da IA (modulador leve — não cruza corte de compra sozinho)
    ai_sent = (getattr(pos.asset, "ai_sentiment", None) or "").strip().lower()
    score_before_ai = score
    if ai_sent == "positivo":
        score += 4
        motivos.append("🤖 Sentimento IA Positivo (+4)")
        buy_cutoff = 55 if falta > Decimal('0.0') else 52
        if score_before_ai < buy_cutoff <= score:
            score = buy_cutoff - 1
    elif ai_sent == "negativo":
        score -= 6
        motivos.append("🤖 Alerta IA Negativo (-6)")
    elif not ai_sent:
        criterios_nao_avaliados.append("Sentimento IA")

    metrics["criterios_nao_avaliados"] = criterios_nao_avaliados
    score = max(-100, min(100, score))

    # Regras de integridade de sinal por classe
    if cat_name == "Ação":
        has_valuation = (mg_graham != Decimal('0.0')) or (mg_bazin != 0.0)
        is_expensive_veto = (mg_graham <= Decimal('-20.0')) or (mg_bazin <= -20.0)
    elif cat_name == "FII":
        has_valuation = (pvp > Decimal('0.0')) or (mg_bazin != 0.0)
        is_expensive_veto = (pvp >= Decimal('1.05')) or (mg_bazin <= -20.0)
    else:
        has_valuation = True
        is_expensive_veto = False

    if not has_valuation:
        if score < -15 and falta <= Decimal('0.0'):
            status = "REDUZIR"
            rec_text = "🟠 REDUZIR"
        elif score < -15:
            status = "EVITAR"
            rec_text = "🔴 EVITAR"
        else:
            status = "INCONCLUSIVO"
            rec_text = "⚪ INCONCLUSIVO"
            motivos.append("📋 Sem Valuation Calculável")
    elif falta > Decimal('0.0') and score >= 75:
        status = "COMPRA_FORTE"
        rec_text = "🟢 APORTAR FORTE"
    elif falta > Decimal('0.0') and score >= 55:
        status = "COMPRAR"
        rec_text = "🟢 APORTAR"
    elif falta <= Decimal('0.0') and score >= 52:
        status = "COMPRAR"
        rec_text = "🟢 OPORTUNIDADE"
    elif score >= -15:
        status = "NEUTRO"
        rec_text = "🟡 MANTER"
    elif falta <= Decimal('0.0'):
        status = "REDUZIR"
        rec_text = "🟠 REDUZIR"
    else:
        status = "EVITAR"
        rec_text = "🔴 EVITAR"

    if is_expensive_veto and status in ("COMPRA_FORTE", "COMPRAR"):
        status = "NEUTRO"
        rec_text = "🟡 MANTER"
        motivos.append("🛑 Veto Valuation Caro")

    return rec_text, status, score, " • ".join(motivos), rsi
