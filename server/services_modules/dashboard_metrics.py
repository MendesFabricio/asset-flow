import math
from decimal import Decimal

def _extract_value(val):
    if val is None: 
        return Decimal('0.0')
    return Decimal(str(val))

def calculate_fundamental_metrics(pos, preco):
    m = {
        "vi_graham": Decimal('0.0'),
        "mg_graham": Decimal('0.0'),
        "magic_number": 0,
        "renda_mensal_est": Decimal('0.0'),
        "p_vp": Decimal('0.0')
    }
    try:
        dy = _extract_value(pos.manual_dy) 
        lpa = _extract_value(pos.manual_lpa)
        vpa = _extract_value(pos.manual_vpa)
        qtd = _extract_value(pos.quantity)
        
        if dy > Decimal('0.0') and preco > Decimal('0.0'):
            m["renda_mensal_est"] = (preco * dy * qtd) / Decimal('12.0')
            m["magic_number"] = int(math.ceil(float(Decimal('12.0') / dy)))
        
        if vpa > Decimal('0.0') and preco > Decimal('0.0'):
            m["p_vp"] = preco / vpa

        if pos.asset.category and pos.asset.category.name == "Ação" and lpa > Decimal('0.0') and vpa > Decimal('0.0'):
            m["vi_graham"] = Decimal(str(math.sqrt(float(Decimal('22.5') * lpa * vpa))))
            if preco > Decimal('0.0'):
                m["mg_graham"] = ((m["vi_graham"] - preco) / preco) * Decimal('100.0')
    except Exception:
        pass
    return m

def apply_strategy(pos, metrics, falta, preco, min_6m):
    score = 0
    motivos = []
    cat_name = pos.asset.category.name if pos.asset.category else ""

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
        ta = pos.asset.technical_data
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
    elif cat_name == "Cripto":
        if preco > Decimal('0.0') and min_6m > Decimal('0.0'):
            desconto = ((preco - min_6m) / min_6m) * Decimal('100.0')
            if Decimal('15.0') < desconto <= Decimal('35.0'):
                score += 15
                motivos.append(f"⛏️ Acúmulo Estratégico Crypto (+15) [{float(desconto):.1f}% da mínima]")

    if score >= 50:
        status = "COMPRA_FORTE" if score >= 70 else "COMPRAR"
        rec_text = "🟢 APORTAR FORTE" if score >= 70 else "🟢 APORTAR"
    elif score >= -15:
        status = "NEUTRO"
        rec_text = "🟡 MANTER"
    else:
        status = "EVITAR"
        rec_text = "🔴 EVITAR"
        
    return rec_text, status, score, " • ".join(motivos), rsi
