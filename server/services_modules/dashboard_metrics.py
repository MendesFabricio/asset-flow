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

def calculate_fundamental_metrics(pos, preco):
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
            m["magic_number"] = int(math.ceil(float(Decimal('12.0') / dy)))

            annual_div_per_share = float(preco * dy)
            desired_dy = 8.0 if cat_name == "FII" else 6.0
            bazin_val = calculate_bazin_price(annual_div_per_share, desired_dy)
            if bazin_val:
                m["bazin_price"] = Decimal(str(bazin_val))
                m["mg_bazin"] = ((m["bazin_price"] - preco) / preco) * Decimal('100.0')
            gordon_val = calculate_gordon_price(annual_div_per_share, 12.0, 5.0)
            if gordon_val:
                m["gordon_price"] = Decimal(str(gordon_val))
        
        if vpa > Decimal('0.0') and preco > Decimal('0.0'):
            m["p_vp"] = preco / vpa

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
        score += 30
        motivos.append("⚖️ Abaixo do Alvo (+30)")
    else:
        score -= 10
        motivos.append("📊 Acima da Meta (-10)")

    # DY Bonus
    dy = metrics.get("renda_mensal_est", Decimal('0.0'))
    if pos.quantity and pos.quantity > 0:
        try:
            dy_percent = _extract_value(pos.manual_dy) * 100
            if dy_percent > Decimal('6.0'):
                score += 10
                motivos.append(f"💰 Bom Pagador de Dividendos (+10) [{float(dy_percent):.1f}%]")
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
        score += 30
        motivos.append("💎 Região Sobrevendida (+30)")
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
        elif mg <= Decimal('-20.0'):
            score -= 15
            motivos.append("🚨 Empresa Cara por Graham (-15)")
    elif cat_name == "FII":
        pvp = metrics.get("p_vp", Decimal('1.0'))
        if Decimal('0.0') < pvp <= Decimal('0.95'):
            score += 20
            motivos.append("🧠 Desconto Patrimonial P/VP (+20)")
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
    if cat_name in ("Ação", "FII") and mg_bazin != 0.0:
        if mg_bazin >= 15.0:
            score += 15
            motivos.append(f"🎯 Abaixo do Teto Bazin (+15) [+{mg_bazin:.1f}%]")
        elif mg_bazin <= -20.0:
            score -= 10
            motivos.append(f"📈 Acima do Teto Bazin (-10) [{mg_bazin:.1f}%]")

    # Qualidade Fundamentalista (Checklist / Radar)
    if screener_item and getattr(screener_item, "quality_score", None):
        q_score = int(screener_item.quality_score or 0)
        if q_score >= 75:
            score += 15
            motivos.append(f"🛡️ Alta Qualidade Fundamentalista (+15) [{q_score}/100]")
        elif 0 < q_score < 45:
            score -= 15
            motivos.append(f"⚠️ Qualidade Fundamentalista Baixa (-15) [{q_score}/100]")

    # Sentimento de Notícias da IA (modulador)
    ai_sent = (getattr(pos.asset, "ai_sentiment", None) or "").strip().lower()
    if ai_sent == "positivo":
        score += 10
        motivos.append("🤖 Sentimento IA Positivo (+10)")
    elif ai_sent == "negativo":
        score -= 15
        motivos.append("🤖 Alerta IA Negativo (-15)")

    if score >= 50:
        status = "COMPRA_FORTE" if score >= 70 else "COMPRAR"
        rec_text = "🟢 APORTAR FORTE" if score >= 70 else "🟢 APORTAR"
    elif score >= -15:
        status = "NEUTRO"
        rec_text = "🟡 MANTER"
    elif falta <= Decimal('0.0'):
        status = "REDUZIR"
        rec_text = "🟠 REDUZIR"
    else:
        status = "EVITAR"
        rec_text = "🔴 EVITAR"
        
    return rec_text, status, score, " • ".join(motivos), rsi
