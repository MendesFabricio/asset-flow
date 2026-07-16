# server/routes/alerts.py
import re
from flask import Blueprint, jsonify, g, request
from db.models import Asset, Position, Category
from services import Session
from datetime import datetime
import logging

alerts_bp = Blueprint('alerts', __name__)

# ⚡ Micro-otimização: make_alert definido no escopo do módulo para evitar re-alocações na execução do loop
def make_alert(asset, field, type_alert, msg, severity, action=None):
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

@alerts_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 50, type=int)
    alerts = []
    
    with Session() as session:
        try:
            positions = session.query(Position).filter_by(user_id=g.user_id).join(Asset).join(Category).filter(Position.quantity > 0).all()
            today = datetime.now()

            for pos in positions:
                asset = pos.asset
                if not asset:
                    continue
                    
                category = asset.category.name if asset.category else "Outros"
                
                mdata = None
                if asset.market_data and len(asset.market_data) > 0:
                    sorted_mdata = sorted(asset.market_data, key=lambda x: x.date, reverse=True)
                    mdata = sorted_mdata[0]

                current_price = float(mdata.price) if mdata and mdata.price else 0.0
                change_percent = float(mdata.change_percent) if mdata and mdata.change_percent else 0.0

                if current_price <= 0:
                    alerts.append(make_alert(asset, "price", "CRÍTICO", "Preço zerado. Verifique conexão/ticker.", 5, "refresh"))

                if category == 'Ação' and (not asset.cvm_code or asset.cvm_code == ""):
                    alerts.append(make_alert(asset, "cvm", "CONFIG", "Falta vincular Código CVM (Sync).", 4, "edit"))

                if category in ['Ação', 'FII'] and (not asset.cnpj or len(str(asset.cnpj)) < 14):
                    alerts.append(make_alert(asset, "cnpj", "CONFIG", "Falta cadastrar CNPJ (Sync).", 3, "edit"))

                if category in ['Ação', 'FII'] and not pos.last_report_type:
                    alerts.append(make_alert(asset, "report", "CONFIG", "Relatórios não sincronizados.", 3, "sync"))

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
                                    asset,
                                    "report_new", 
                                    "NOVIDADE", 
                                    f"📄 {msg_prefix} recente ({report_date_str}). Já analisou?", 
                                    2, 
                                    "view"
                                ))
                    except Exception as parse_err:
                        pass

                # =========================================================
                # 2. ALERTAS DE RISCO FINANCEIRO (Prejuízo, Trap)
                # =========================================================
                if category == 'Ação' and pos.manual_lpa is not None and float(pos.manual_lpa) < 0:
                    alerts.append(make_alert(asset, "lpa", "RISCO", f"Empresa com PREJUÍZO (LPA: {float(pos.manual_lpa):.2f}).", 4, "view"))

                if category in ['Ação', 'FII'] and pos.manual_dy is not None and float(pos.manual_dy) > 0.18:
                    dy_pct = float(pos.manual_dy) * 100
                    alerts.append(make_alert(asset, "dy", "RISCO", f"Dividend Trap? DY muito alto ({dy_pct:.1f}%).", 4, "view"))

                if category == 'FII' and pos.manual_vpa is not None and float(pos.manual_vpa) > 0 and current_price > 0:
                    pvp = current_price / float(pos.manual_vpa)
                    if pvp > 1.25:
                        alerts.append(make_alert(asset, "pvp", "ALERTA", f"FII caro (P/VP {pvp:.2f}). Risco de correção.", 3, "view"))

                # =========================================================
                # 3. ALERTAS DE MERCADO (Volatilidade)
                # =========================================================
                if change_percent < -3.0:
                    alerts.append(make_alert(asset, "change", "OPORTUNIDADE", f"Queda forte ({change_percent:.2f}%).", 2, "view"))
                
                if change_percent > 5.0:
                    alerts.append(make_alert(asset, "change", "ALERTA", f"Alta forte ({change_percent:.2f}%).", 2, "view"))

                # =========================================================
                # ALERTAS DE SPLIT/INPLIT (Desdobramento/Grupamento) 📈📉
                # =========================================================
                if category in ['Ação', 'FII']:
                    # Split Alert (Desdobramento Confirmado)
                    if asset.upcoming_split:
                        try:
                            split_date_str, ratio = asset.upcoming_split.split(":")
                            d_parts = split_date_str.split("-")
                            formatted_date = f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]}"
                            alerts.append(make_alert(asset, "split", "CRÍTICO", f"Desdobramento (Split) confirmado de {ratio}x em {formatted_date}.", 5, "view"))
                        except Exception:
                            pass

                    # Inplit Alert (Grupamento / Penny Stock)
                    if asset.currency == "BRL" and current_price > 0 and current_price < 1.0:
                        alerts.append(make_alert(asset, "inplit", "CRÍTICO", f"Penny stock (R$ {current_price:.2f}). Risco de grupamento obrigatório (Inplit) pela B3.", 5, "view"))

                # =========================================================
                # 4. DADOS (Avisos Suaves)
                # =========================================================
                if category in ['Ação', 'FII']:
                    if pos.manual_dy is None:
                        alerts.append(make_alert(asset, "dy", "DADOS", "Falta cadastrar DY.", 1, "edit"))

                # =========================================================
                # 5. ALERTA DE DATA-COM PRÓXIMA (3 Dias)
                # =========================================================
                from routes.calendar import CALENDAR_CACHE
                user_cache = CALENDAR_CACHE.get(g.user_id, {})
                if user_cache.get("data"):
                    for evt in user_cache["data"]:
                        try:
                            evt_date = datetime.strptime(evt["date"], "%Y-%m-%d").date()
                            delta = (evt_date - today.date()).days
                            if 0 <= delta <= 3 and evt["ticker"] == asset.ticker:
                                alerts.append({
                                    "id": f"{asset.id}_datacom_{evt['date']}",
                                    "asset_id": asset.id,
                                    "ticker": asset.ticker,
                                    "field": "datacom",
                                    "type": "PROVENTO",
                                    "message": f"⏰ Data-COM em {delta} dias ({evt_date.strftime('%d/%m')}). Valor: R$ {evt['value_per_share']:.4f}/cota.",
                                    "severity": 3,
                                    "action": "view"
                                })
                        except Exception:
                            pass

            # Ordena: Críticos > Risco > Config > Novidade > Alerta > Info
            alerts.sort(key=lambda x: x["severity"], reverse=True)
            total = len(alerts)
            start = (page - 1) * page_size
            end = start + page_size
            page_items = alerts[start:end]
            return jsonify({
                "items": page_items,
                "total": total,
                "page": page,
                "page_size": page_size
            })
        
        except Exception as e:
            logging.error(f"❌ Erro crítico no pipeline da API de Alertas: {e}")
            return jsonify({"items": [], "total": 0, "page": page, "page_size": page_size})
