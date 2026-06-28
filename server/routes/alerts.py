# server/routes/alerts.py
from flask import Blueprint, jsonify
from database.models import Asset, Position, Category, Session # ⚡ Importado a fábrica central controlada
from datetime import datetime
import logging # ⚡ Substituição de prints genéricos por logs estruturados
import re

alerts_bp = Blueprint('alerts', __name__)

@alerts_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    alerts = []
    
    # ⚡ Gerenciador de Contexto: Thread-safe nativo que abre, gerencia e fecha a sessão sem riscos
    with Session() as session:
        try:
            # Busca apenas ativos que você tem em carteira (qtd > 0)
            positions = session.query(Position).join(Asset).join(Category).filter(Position.quantity > 0).all()
            today = datetime.now()

            for pos in positions:
                asset = pos.asset
                if not asset:
                    continue
                    
                category = asset.category.name if asset.category else "Outros"
                
                # --- Market Data Seguro (Ordenado por data decrescente) ---
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

                if category in ['Ação', 'FII'] and not pos.last_report_type:
                    alerts.append(make_alert("report", "CONFIG", "Relatórios não sincronizados.", 3, "sync"))

                # =========================================================
                # ALERTA DE RELATÓRIO RECENTE / DADOS NOVOS 🆕
                # =========================================================
                if pos.last_report_at:
                    try:
                        match = re.search(r'(\d{2}/\d{2}/\d{4})', pos.last_report_at)
                        if match:
                            report_date_str = match.group(1)
                            report_date = datetime.strptime(report_date_str, '%d/%m/%Y')
                            
                            delta = today - report_date
                            if delta.days <= 15:
                                msg_prefix = "Novo Fato Relevante" if category == 'FII' else "Novo Balanço"
                                alerts.append(make_alert(
                                    "report_new", 
                                    "NOVIDADE", 
                                    f"📄 {msg_prefix} recente ({report_date_str}). Já analisou?", 
                                    2, 
                                    "view"
                                ))
                    except Exception as parse_err:
                        logging.debug(f"Falha de parse de string temporal em {asset.ticker}: {parse_err}")

                # =========================================================
                # 2. ALERTAS DE RISCO FINANCEIRO (Prejuízo, Trap)
                # =========================================================
                if category == 'Ação' and pos.manual_lpa is not None and float(pos.manual_lpa) < 0:
                    alerts.append(make_alert("lpa", "RISCO", f"Empresa com PREJUÍZO (LPA: {float(pos.manual_lpa):.2f}).", 4, "view"))

                if category in ['Ação', 'FII'] and pos.manual_dy is not None and float(pos.manual_dy) > 0.18:
                    dy_pct = float(pos.manual_dy) * 100
                    alerts.append(make_alert("dy", "RISCO", f"Dividend Trap? DY muito alto ({dy_pct:.1f}%).", 4, "view"))

                if category == 'FII' and pos.manual_vpa is not None and float(pos.manual_vpa) > 0 and current_price > 0:
                    pvp = current_price / float(pos.manual_vpa)
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
                    elif float(pos.manual_dy) == 0:
                        alerts.append(make_alert("dy", "INFO", "DY zerado. Confirme se é intencional.", 1, "edit"))

            # Ordena: Críticos > Risco > Config > Novidade > Alerta > Info
            alerts.sort(key=lambda x: x["severity"], reverse=True)
            return jsonify(alerts)
        
        except Exception as e:
            logging.error(f"❌ Erro crítico no pipeline da API de Alertas: {e}")
            return jsonify([])
