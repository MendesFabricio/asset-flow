# server/routes/alerts.py
from flask import Blueprint, jsonify
from sqlalchemy.orm import Session
from database.models import Asset, Position, Category, engine
from datetime import datetime, timedelta
import re

alerts_bp = Blueprint('alerts', __name__)

@alerts_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    session = Session(bind=engine)
    alerts = []
    
    try:
        # Busca apenas ativos que você tem em carteira (qtd > 0)
        positions = session.query(Position).join(Asset).join(Category).filter(Position.quantity > 0).all()
        
        today = datetime.now()

        for pos in positions:
            asset = pos.asset
            category = asset.category.name
            
            # --- CORREÇÃO 1: Market Data Seguro (Ordenado por data decrescente) ---
            mdata = None
            if asset.market_data and len(asset.market_data) > 0:
                sorted_mdata = sorted(asset.market_data, key=lambda x: x.date, reverse=True)
                mdata = sorted_mdata[0]

            current_price = float(mdata.price) if mdata and mdata.price else 0.0
            change_percent = float(mdata.change_percent) if mdata and mdata.change_percent else 0.0
            
            # Helper para criar ID único e evitar colisão no React
            def make_alert(field, type_alert, msg, severity, action=None):
                return {
                    "id": f"{asset.id}_{field}_{type_alert}",
                    "asset_id": asset.id,
                    "ticker": asset.ticker,
                    "field": field,
                    "type": type_alert,
                    "message": msg,
                    "severity": severity,
                    "action": action
                }

            # =========================================================
            # 1. ALERTAS DE CADASTRO E SISTEMA (Configuração)
            # =========================================================
            
            if current_price <= 0:
                alerts.append(make_alert("price", "CRÍTICO", "Preço zerado. Verifique conexão/ticker.", 5, "refresh"))

            if category == 'Ação' and (not asset.cvm_code or asset.cvm_code == ""):
                alerts.append(make_alert("cvm", "CONFIG", "Falta vincular Código CVM (Sync).", 4, "edit"))

            if category in ['Ação', 'FII'] and (not asset.cnpj or len(str(asset.cnpj)) < 14):
                alerts.append(make_alert("cnpj", "CONFIG", "Falta cadastrar CNPJ (Sync).", 3, "edit"))

            # Se não tem relatório NENHUM (nunca baixou)
            if category in ['Ação', 'FII'] and not pos.last_report_type:
                alerts.append(make_alert("report", "CONFIG", "Relatórios não sincronizados.", 3, "sync"))

            # =========================================================
            # NOVO: ALERTA DE RELATÓRIO RECENTE / DADOS NOVOS 🆕
            # =========================================================
            
            # Tenta extrair a data do texto "last_report_at" (Ex: "Balanço: 30/09/2025")
            if pos.last_report_at:
                try:
                    # Procura padrão DD/MM/YYYY no texto
                    match = re.search(r'(\d{2}/\d{2}/\d{4})', pos.last_report_at)
                    if match:
                        report_date_str = match.group(1)
                        report_date = datetime.strptime(report_date_str, '%d/%m/%Y')
                        
                        # Se o relatório tem menos de 15 dias, é "fresco"
                        delta = today - report_date
                        if delta.days <= 15:
                            msg_prefix = "Novo Fato Relevante" if category == 'FII' else "Novo Balanço"
                            alerts.append(make_alert(
                                "report_new", 
                                "NOVIDADE", 
                                f"📄 {msg_prefix} recente ({report_date_str}). Já analisou?", 
                                2, # Severidade média (chama atenção mas não assusta)
                                "view" # Botão para abrir detalhes
                            ))
                except:
                    pass # Se falhar o parse da data, ignora silenciosamente

            # =========================================================
            # 2. ALERTAS DE RISCO FINANCEIRO (Prejuízo, Trap)
            # =========================================================

            if category == 'Ação' and pos.manual_lpa and pos.manual_lpa < 0:
                alerts.append(make_alert("lpa", "RISCO", f"Empresa com PREJUÍZO (LPA: {pos.manual_lpa}).", 4, "view"))

            if category in ['Ação', 'FII'] and pos.manual_dy and pos.manual_dy > 0.18:
                dy_pct = pos.manual_dy * 100
                alerts.append(make_alert("dy", "RISCO", f"Dividend Trap? DY muito alto ({dy_pct:.1f}%).", 4, "view"))

            if category == 'FII' and pos.manual_vpa and pos.manual_vpa > 0 and current_price > 0:
                pvp = current_price / pos.manual_vpa
                if pvp > 1.25:
                    alerts.append(make_alert("pvp", "ALERTA", f"FII caro (P/VP {pvp:.2f}). Risco de correção.", 3, "view"))

            # =========================================================
            # 3. ALERTAS DE MERCADO (Volatilidade)
            # =========================================================

            if change_percent < -3.0:
                alerts.append(make_alert("change", "OPORTUNIDADE", f"Queda forte ({change_percent:.2f}%).", 2, "view"))
            
            if change_percent > 5.0:
                alerts.append(make_alert("change", "ALERTA", f"Alta forte ({change_percent:.2f}%).", 2, "view"))

            # =========================================================
            # 4. DADOS (Avisos Suaves)
            # =========================================================
            
            if category in ['Ação', 'FII']:
                if pos.manual_dy is None:
                    alerts.append(make_alert("dy", "DADOS", "Falta cadastrar DY.", 1, "edit"))
                elif pos.manual_dy == 0:
                    alerts.append(make_alert("dy", "INFO", "DY zerado. Confirme se é intencional.", 1, "edit"))

        # Ordena: Críticos > Risco > Config > Novidade > Alerta > Info
        alerts.sort(key=lambda x: x["severity"], reverse=True)

        return jsonify(alerts)
    
    except Exception as e:
        print(f"🔥 Erro crítico no Alerts API: {e}")
        return jsonify([]) 
    finally:
        session.close()
