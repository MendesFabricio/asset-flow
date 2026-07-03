from flask import Blueprint, jsonify
from database.models import Dividend, Asset, Session, Position # ⚡ Importada a factory controlada thread-safe
import logging
from services import PortfolioService

dividends_bp = Blueprint('dividends', __name__)
service = PortfolioService()

@dividends_bp.route('/api/dividends/history', methods=['GET'])
def get_dividend_history():
    # ⚡ Gerenciador de Contexto: Garante liberação e fechamento imediato de conexões no SQLite
    with Session() as session:
        try:
            # Busca todos os dividendos carimbados, ordenando pelos mais recentes
            history = session.query(Dividend).join(Asset).order_by(Dividend.date_com.desc()).all()
            
            results = []
            for div in history:
                results.append({
                    "ticker": div.asset.ticker if div.asset else "UNKNOWN",
                    "date": div.date_com.strftime('%Y-%m-%d') if div.date_com else None, 
                    "date_com": div.date_com.strftime('%Y-%m-%d') if div.date_com else None, 
                    "value_per_share": div.value_per_share,
                    "quantity": div.quantity_at_date,
                    "total": div.total_value,
                    "status": div.status 
                })
            return jsonify(results)
        except Exception as e:
            logging.error(f"❌ Erro crítico na extração da rota de histórico de dividendos: {e}")
            return jsonify({"error": "Falha interna ao processar histórico de proventos"}), 500

@dividends_bp.route('/api/dividends/yoc', methods=['GET'])
def get_dividend_yoc():
    """Calcula o Dividend Yield on Cost (YOC) Preditivo de cada ativo na carteira."""
    with Session() as session:
        try:
            # 1. Busca previsões de dividendos
            forecast_res = service.calculate_dividend_forecast()
            details = forecast_res.get("details", [])
            
            # Agrupa o valor projetado total por ticker
            projected_map = {}
            for f in details:
                t = f["ticker"]
                projected_map[t] = projected_map.get(t, 0.0) + f["amount"]
                
            # 2. Busca posições
            positions = session.query(Position).filter(Position.quantity > 0).all()
            
            yoc_list = []
            for pos in positions:
                if not pos.asset:
                    continue
                ticker = pos.asset.ticker.upper()
                qty = float(pos.quantity)
                avg_price = float(pos.average_price)
                cost = qty * avg_price
                
                projected_div = projected_map.get(ticker, 0.0)
                yoc = (projected_div / cost * 100) if cost > 0 else 0.0
                
                # Preço atual para fins de comparação com o DY atual
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else avg_price
                current_value = qty * price
                dy_atual = (projected_div / current_value * 100) if current_value > 0 else 0.0
                
                yoc_list.append({
                    "ticker": ticker,
                    "quantity": qty,
                    "average_price": avg_price,
                    "cost": round(cost, 2),
                    "current_price": price,
                    "current_value": round(current_value, 2),
                    "projected_dividend_12m": round(projected_div, 2),
                    "yoc": round(yoc, 2),
                    "dy_atual": round(dy_atual, 2)
                })
            yoc_list.sort(key=lambda x: x["yoc"], reverse=True)
            return jsonify(yoc_list)
        except Exception as e:
            logging.error(f"❌ Erro ao calcular YOC Preditivo: {e}", exc_info=True)
            return jsonify([]), 500

@dividends_bp.route('/api/dividends/analytics', methods=['GET'])
def get_dividend_analytics():
    """Calcula estatísticas de dividendos para o portfólio (DY Forward, Payout, Regularidade)"""
    with Session() as session:
        try:
            forecast_res = service.calculate_dividend_forecast()
            details = forecast_res.get("details", [])
            
            projected_map = {}
            for f in details:
                t = f["ticker"]
                projected_map[t] = projected_map.get(t, 0.0) + f["amount"]
                
            positions = session.query(Position).filter(Position.quantity > 0).all()
            analytics = []
            
            for pos in positions:
                if not pos.asset:
                    continue
                cat = pos.asset.category.name if pos.asset.category else ""
                if cat in ["Reserva"]:
                    continue
                    
                ticker = pos.asset.ticker.upper()
                qty = float(pos.quantity)
                avg_price = float(pos.average_price)
                
                # Preço atual
                mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                price = float(mdata.price or 0) if mdata else avg_price
                
                projected_div = projected_map.get(ticker, 0.0)
                
                # DY Forward
                if pos.manual_dy and float(pos.manual_dy) > 0:
                    dy_forward = float(pos.manual_dy) * 100
                else:
                    current_value = qty * price
                    dy_forward = (projected_div / current_value * 100) if current_value > 0 else 0.0
                
                # Payout histórico estimado (DPA / LPA)
                payout = None
                manual_lpa = float(pos.manual_lpa) if pos.manual_lpa else 0.0
                if manual_lpa > 0:
                    dpa = (projected_div / qty) if qty > 0 else 0.0
                    if dpa <= 0 and pos.manual_dy:
                        dpa = float(pos.manual_dy) * price
                    payout = (dpa / manual_lpa) * 100
                    payout = min(100.0, round(payout, 2))
                
                # Consistência de Pagamento Score (número de trimestres com distribuição nos últimos 3 anos)
                divs = pos.asset.dividends
                quarters = set()
                for d in divs:
                    if d.date_com:
                        q_key = (d.date_com.year, (d.date_com.month - 1) // 3 + 1)
                        quarters.add(q_key)
                
                # Score de 0 a 100 (12 trimestres = 100%)
                num_quarters = len(quarters)
                regularity_score = min(100, int(num_quarters * 8.33))
                if regularity_score == 0 and pos.manual_dy and float(pos.manual_dy) > 0:
                    # Fallback suave se não tivermos histórico mas tiver cadastro manual
                    regularity_score = 60
                
                analytics.append({
                    "ticker": ticker,
                    "dy_forward": round(dy_forward, 2),
                    "payout_historico": payout,
                    "regularidade_score": regularity_score,
                    "num_quarters": num_quarters
                })
                
            return jsonify(analytics)
        except Exception as e:
            logging.error(f"Erro ao calcular analíticas de dividendos: {e}", exc_info=True)
            return jsonify([]), 500

@dividends_bp.route('/api/dividends/yoc-history', methods=['GET'])
def get_yoc_history():
    """Retorna a série histórica de Yield on Cost por ativo"""
    with Session() as session:
        try:
            positions = session.query(Position).filter(Position.quantity > 0).all()
            results = {}
            
            for pos in positions:
                if not pos.asset:
                    continue
                cat = pos.asset.category.name if pos.asset.category else ""
                if cat in ["Reserva"]:
                    continue
                    
                ticker = pos.asset.ticker.upper()
                avg_price = float(pos.average_price)
                if avg_price <= 0:
                    continue
                
                divs = pos.asset.dividends
                year_map = {}
                for d in divs:
                    if d.date_com:
                        yr = d.date_com.year
                        year_map[yr] = year_map.get(yr, 0.0) + float(d.value_per_share)
                
                history = []
                for yr in sorted(year_map.keys()):
                    total_dpa = year_map[yr]
                    yoc = (total_dpa / avg_price) * 100
                    history.append({
                        "year": yr,
                        "dpa": round(total_dpa, 4),
                        "yoc": round(yoc, 2)
                    })
                
                # Fallback se não houver histórico de proventos no SQLite, simula com o DY cadastrado
                if not history and pos.manual_dy and float(pos.manual_dy) > 0:
                    current_year = 2026
                    mdata = pos.asset.market_data[0] if pos.asset.market_data else None
                    price = float(mdata.price or 0) if mdata else avg_price
                    dpa_est = float(pos.manual_dy) * price
                    yoc_est = (dpa_est / avg_price) * 100
                    history = [
                        {"year": current_year - 2, "dpa": round(dpa_est * 0.9, 4), "yoc": round(yoc_est * 0.9, 2)},
                        {"year": current_year - 1, "dpa": round(dpa_est * 0.95, 4), "yoc": round(yoc_est * 0.95, 2)},
                        {"year": current_year, "dpa": round(dpa_est, 4), "yoc": round(yoc_est, 2)}
                    ]
                
                if history:
                    results[ticker] = history
                    
            return jsonify(results)
        except Exception as e:
            logging.error(f"Erro ao calcular histórico de YOC: {e}", exc_info=True)
            return jsonify({}), 500

@dividends_bp.route('/api/dividends/seasonality', methods=['GET'])
def get_dividend_seasonality():
    """Retorna uma matriz de sazonalidade mensal dos dividendos recebidos no portfólio"""
    with Session() as session:
        try:
            divs = session.query(Dividend).all()
            matrix = {}
            
            for d in divs:
                if d.date_com:
                    yr = d.date_com.year
                    mo = d.date_com.month
                    val = float(d.total_value)
                    
                    if yr not in matrix:
                        matrix[yr] = {m: 0.0 for m in range(1, 13)}
                    matrix[yr][mo] += val
            
            # Formata para o frontend
            years_list = sorted(matrix.keys(), reverse=True)
            data = []
            
            for yr in years_list:
                row = {"year": yr}
                for m in range(1, 13):
                    row[f"m{m}"] = round(matrix[yr][m], 2)
                data.append(row)
                
            # Fallback se não houver dados, gera matriz vazia para evitar quebras
            if not data:
                current_year = 2026
                data = [
                    {"year": current_year, **{f"m{m}": 0.0 for m in range(1, 13)}},
                    {"year": current_year - 1, **{f"m{m}": 0.0 for m in range(1, 13)}}
                ]
                
            return jsonify(data)
        except Exception as e:
            logging.error(f"Erro ao calcular sazonalidade de proventos: {e}", exc_info=True)
            return jsonify([]), 500
