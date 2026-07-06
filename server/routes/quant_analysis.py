# server/routes/quant_analysis.py
from flask import Blueprint, jsonify, request, g
import sys
import os
import json
import logging
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService
from database.session import Session
from database.models import SystemCache, Position

quant_bp = Blueprint('quant', __name__)
service = PortfolioService()

@quant_bp.route('/api/quant/kelly-criterion', methods=['GET'])
def get_kelly_criterion():
    try:
        res = service.calculate_kelly_criterion()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao calcular Critério de Kelly: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@quant_bp.route('/api/quant/attribution-analysis', methods=['GET'])
def get_attribution_analysis():
    try:
        res = service.calculate_alpha_attribution()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao calcular Atribuição de Alpha: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@quant_bp.route('/api/quant/rebalance-bands', methods=['GET'])
def get_rebalance_bands():
    session = Session()
    try:
        # Busca posições ativas do usuário logado
        positions = session.query(Position).filter_by(user_id=g.user_id).filter(Position.quantity > 0).all()
        if not positions:
            return jsonify({"status": "Sucesso", "data": []})

        entire_portfolio_value = 0.0
        for pos in positions:
            price = float(pos.asset.market_data[0].price or 0.0) if pos.asset and pos.asset.market_data else 0.0
            entire_portfolio_value += float(pos.quantity) * price

        data = []
        for pos in positions:
            if not pos.asset:
                continue
            cat = pos.asset.category.name if pos.asset.category else ""
            if cat in ["Reserva"]:
                continue
                
            price = float(pos.asset.market_data[0].price or 0.0) if pos.asset.market_data else 0.0
            val = float(pos.quantity) * price
            
            weight_pct = (val / entire_portfolio_value * 100) if entire_portfolio_value > 0 else 0.0
            
            cat_target = float(pos.asset.category.target_percent or 0.0)
            asset_target = float(pos.target_percent or 0.0)
            target_pct = (cat_target / 100.0) * asset_target
            
            dev = weight_pct - target_pct
            
            if abs(dev) > 2.0:
                status = "EXCEDENTE" if dev > 0 else "SUBALOCADO"
                if dev > 0:
                    action_note = f"Vender R$ {abs(dev/100 * entire_portfolio_value):.2f}"
                else:
                    action_note = f"Comprar R$ {abs(dev/100 * entire_portfolio_value):.2f}"
            else:
                status = "NORMAL"
                action_note = "Em conformidade"

            data.append({
                "ticker": pos.asset.ticker.upper(),
                "weight_pct": round(weight_pct, 2),
                "target_pct": round(target_pct, 2),
                "deviation_pct": round(dev, 2),
                "status": status,
                "action_note": action_note
            })

        # Ordena pelo desvio absoluto decrescente
        data.sort(key=lambda x: abs(x["deviation_pct"]), reverse=True)
        return jsonify({"status": "Sucesso", "data": data})
    except Exception as e:
        logging.error(f"❌ Erro ao calcular bandas de rebalanceamento: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()

@quant_bp.route('/api/quant/dca-lump-sum', methods=['GET'])
def get_dca_lump_sum():
    ticker = request.args.get('ticker', '').strip().upper()
    initial_amount_str = request.args.get('initial_amount', '10000')
    monthly_contribution_str = request.args.get('monthly_contribution', '1000')
    
    try:
        initial_amount = float(initial_amount_str)
        monthly_contribution = float(monthly_contribution_str)
    except ValueError:
        return jsonify({"status": "Erro", "msg": "Valores numéricos inválidos para simulação."}), 400

    if not ticker:
        # Fallback: pega a maior posição de renda variável ou IBOV se não houver ativos
        session = Session()
        try:
            positions = session.query(Position).filter_by(user_id=g.user_id).filter(Position.quantity > 0).all()
            active_tickers = [p.asset.ticker.upper() for p in positions if p.asset and p.asset.category and p.asset.category.name not in ["Renda Fixa", "Reserva"]]
            if active_tickers:
                ticker = active_tickers[0]
            else:
                ticker = "BOVA11"
        finally:
            Session.remove()

    try:
        from infrastructure.price_cache import fetch_price_history
        from domain.quant_engine import _to_yf_ticker
        
        # Resolve ticker YF
        yf_ticker = _to_yf_ticker(ticker, "Ação")
        raw = fetch_price_history([yf_ticker], period="1y")
        
        import pandas as pd
        import numpy as np
        
        prices_df = (
            raw.xs("Close", axis=1, level=1)
            if isinstance(raw.columns, pd.MultiIndex)
            else (raw["Close"] if "Close" in raw.columns else raw)
        )
        if yf_ticker in prices_df.columns:
            prices_series = prices_df[yf_ticker].dropna()
        else:
            prices_series = prices_df.dropna()

        if len(prices_series) < 30:
            return jsonify({"status": "Erro", "msg": f"Histórico de preços insuficiente para o ticker {ticker}."}), 404

        prices = prices_series.tolist()
        dates = [str(d.date()) for d in prices_series.index]
        
        # 1. Simulação Lump Sum
        p_start = float(prices[0])
        p_end = float(prices[-1])
        lump_shares = initial_amount / p_start
        lump_final_val = lump_shares * p_end
        lump_profit = lump_final_val - initial_amount
        lump_return_pct = (lump_profit / initial_amount) * 100

        # 2. Simulação DCA (Aporte inicial + aporte mensal a cada 21 dias úteis)
        dca_shares = initial_amount / p_start
        dca_invested = initial_amount
        dca_history = []
        
        for idx in range(len(prices)):
            price_t = float(prices[idx])
            
            # Aporte mensal regular (a cada 21 dias úteis)
            if idx > 0 and idx % 21 == 0:
                dca_shares += monthly_contribution / price_t
                dca_invested += monthly_contribution
                
            dca_val = dca_shares * price_t
            lump_val = lump_shares * price_t
            
            dca_history.append({
                "date": dates[idx],
                "lump_sum_val": round(lump_val, 2),
                "dca_val": round(dca_val, 2),
                "dca_invested": round(dca_invested, 2)
            })

        dca_final_val = dca_shares * p_end
        dca_profit = dca_final_val - dca_invested
        dca_return_pct = (dca_profit / dca_invested) * 100 if dca_invested > 0 else 0.0

        return jsonify({
            "status": "Sucesso",
            "ticker": ticker,
            "lump_sum": {
                "invested": round(initial_amount, 2),
                "final_value": round(lump_final_val, 2),
                "profit": round(lump_profit, 2),
                "return_pct": round(lump_return_pct, 2)
            },
            "dca": {
                "invested": round(dca_invested, 2),
                "final_value": round(dca_final_val, 2),
                "profit": round(dca_profit, 2),
                "return_pct": round(dca_return_pct, 2)
            },
            "history": dca_history
        })
        
    except Exception as e:
        logging.error(f"❌ Erro ao simular DCA vs Lump Sum para {ticker}: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@quant_bp.route('/api/quant/efficient-frontier', methods=['GET'])
def get_efficient_frontier():
    session = Session()
    try:
        cache_record = session.query(SystemCache).filter_by(key="efficient_frontier").first()
        if cache_record:
            return jsonify(json.loads(cache_record.value))
            
        logging.info("📈 Cache de Fronteira Eficiente frio. Calculando síncrono...")
        res = service.calculate_efficient_frontier_points()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao buscar Fronteira Eficiente: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()

@quant_bp.route('/api/quant/sharpe-rolling', methods=['GET'])
def get_sharpe_rolling():
    try:
        res = service.calculate_rolling_sharpe()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao calcular Sharpe móvel: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@quant_bp.route('/api/quant/momentum-ranking', methods=['GET'])
def get_momentum_ranking():
    try:
        res = service.calculate_momentum_ranking()
        return jsonify(res)
    except Exception as e:
        logging.error(f"❌ Erro ao calcular Ranking de Momentum: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500


def calculate_local_fear_greed(session):
    from database.models import Position, Asset, Category, MarketData
    from sqlalchemy.orm import joinedload
    
    positions = session.query(Position).options(
        joinedload(Position.asset).joinedload(Asset.category),
        joinedload(Position.asset).selectinload(Asset.market_data)
    ).filter(Position.user_id == g.user_id, Position.quantity > 0).all()
    
    variable_assets = []
    total_var_value = 0.0
    for p in positions:
        if p.asset and p.asset.category and p.asset.category.name in ["Ação", "FII", "Cripto"]:
            mdata = p.asset.market_data[0] if p.asset.market_data else None
            price = float(mdata.price or p.average_price or 0.0) if mdata else float(p.average_price or 0.0)
            val = float(p.quantity) * price
            variable_assets.append((p.asset, val, mdata, price))
            total_var_value += val
            
    if not variable_assets:
        return {"score": 50, "label": "Neutro", "avg_rsi": 50, "above_sma_pct": 50, "drawdown_score": 50}
        
    weighted_rsi = 0.0
    above_sma_count = 0
    total_weight = 0.0
    
    for asset, val, mdata, price in variable_assets:
        weight = val / total_var_value if total_var_value > 0 else 0.0
        rsi = float(mdata.rsi_14 or 50.0) if mdata else 50.0
        weighted_rsi += rsi * weight
        
        sma = float(mdata.sma_20 or price) if mdata and mdata.sma_20 else price
        if price >= sma:
            above_sma_count += 1
            
    above_sma_pct = (above_sma_count / len(variable_assets)) * 100 if variable_assets else 50.0
    
    avg_change = 0.0
    for asset, val, mdata, price in variable_assets:
        change = abs(float(mdata.change_percent or 0.0)) if mdata else 0.0
        avg_change += change
    avg_change = avg_change / len(variable_assets) if variable_assets else 0.0
    
    weighted_change = 0.0
    for asset, val, mdata, price in variable_assets:
        change = float(mdata.change_percent or 0.0) if mdata else 0.0
        weighted_change += change * (val / total_var_value) if total_var_value > 0 else 0.0
        
    drawdown_score = 50.0 + (weighted_change * 3) - (avg_change * 1.5)
    drawdown_score = max(0.0, min(100.0, drawdown_score))
    
    final_score = 0.4 * weighted_rsi + 0.3 * above_sma_pct + 0.3 * drawdown_score
    final_score = max(0.0, min(100.0, final_score))
    
    if final_score < 25:
        label = "Medo Extremo"
    elif final_score < 45:
        label = "Medo"
    elif final_score <= 55:
        label = "Neutro"
    elif final_score <= 75:
        label = "Ganância"
    else:
        label = "Ganância Extrema"
        
    return {
        "score": round(final_score, 1),
        "label": label,
        "avg_rsi": round(weighted_rsi, 1),
        "above_sma_pct": round(above_sma_pct, 1),
        "drawdown_score": round(drawdown_score, 1)
    }


@quant_bp.route('/api/quant/fear-greed', methods=['GET'])
def get_fear_greed():
    session = Session()
    try:
        res = calculate_local_fear_greed(session)
        return jsonify({"status": "Sucesso", "data": res})
    except Exception as e:
        logging.error(f"Erro ao calcular Fear & Greed Local: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


@quant_bp.route('/api/quant/reports', methods=['GET'])
def list_reports():
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        reports_dir = os.path.join(base_dir, '..', 'data', 'reports', str(g.user_id))
        os.makedirs(reports_dir, exist_ok=True)
        
        files = []
        for f in os.listdir(reports_dir):
            if f.endswith(".pdf"):
                path = os.path.join(reports_dir, f)
                stat = os.stat(path)
                files.append({
                    "filename": f,
                    "size_bytes": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        files.sort(key=lambda x: x["created_at"], reverse=True)
        return jsonify({"status": "Sucesso", "reports": files})
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@quant_bp.route('/api/quant/download-report', methods=['GET'])
def download_report():
    filename = request.args.get('filename', '').strip()
    filename = os.path.basename(filename)
    if not filename.endswith(".pdf"):
        return jsonify({"status": "Erro", "msg": "Apenas downloads de arquivos PDF são permitidos."}), 400
        
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        reports_dir = os.path.join(base_dir, '..', 'data', 'reports', str(g.user_id))
        filepath = os.path.join(reports_dir, filename)
        
        if not os.path.exists(filepath):
            return jsonify({"status": "Erro", "msg": "Arquivo solicitado não encontrado."}), 404
            
        from flask import send_file
        return send_file(filepath, as_attachment=True, download_name=filename, mimetype='application/pdf')
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500


@quant_bp.route('/api/quant/generate-report', methods=['POST'])
def generate_report():
    session = Session()
    try:
        from utils.pdf_generator import generate_monthly_report_pdf
        
        dash_data = service.get_dashboard_data()
        fg_data = calculate_local_fear_greed(session)
        
        dash_data["fear_greed_score"] = fg_data["score"]
        dash_data["fear_greed_label"] = fg_data["label"]
        
        from domain.quant_engine import calculate_risk_metrics
        from infrastructure.price_cache import fetch_price_history as _fetch_price_history_fn
        risk = calculate_risk_metrics(session, _fetch_price_history_fn)
        if risk.get("status") == "Sucesso":
            dash_data["beta"] = risk.get("beta")
            dash_data["sharpe"] = risk.get("sharpe_12m")
            dash_data["var_95"] = risk.get("var_95_monthly_pct")
            
        # Consulta de Recebíveis Ativos do usuário logado
        receivables_list = []
        from database.models import LoanInstallment
        installments = session.query(LoanInstallment).filter(LoanInstallment.user_id == g.user_id, LoanInstallment.status.in_(["ABERTA", "ATRASADA"]), LoanInstallment.is_deleted == False).all()
        for inst in installments:
            receivables_list.append({
                "descricao": inst.loan.descricao,
                "devedor": inst.loan.debtor.nome if inst.loan.debtor else "Desconhecido",
                "valor_parcela": float(inst.valor_parcela),
                "status": inst.status,
                "parcela_atual": int(inst.numero_parcela),
                "total_parcelas": int(inst.loan.total_parcelas),
                "vencimento_dia": int(inst.data_vencimento.day)
            })
        dash_data["recebiveis"] = receivables_list

        dash_data["comentario_ia"] = "Sua carteira está bem distribuída. Recomendamos verificar os ativos com recomendação de COMPRAR na aba 'Análise Quant' e ajustar os desvios."
        
        date_str = datetime.now().strftime("%Y-%m-%d_%H-%M")
        filename = f"relatorio_patrimonial_{date_str}.pdf"
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        reports_dir = os.path.join(base_dir, '..', 'data', 'reports', str(g.user_id))
        filepath = os.path.join(reports_dir, filename)
        
        success = generate_monthly_report_pdf(filepath, dash_data)
        if success:
            return jsonify({"status": "Sucesso", "filename": filename, "msg": "Relatório patrimonial gerado com sucesso!"})
        else:
            return jsonify({"status": "Erro", "msg": "Erro ao compilar PDF do relatório."}), 500
    except Exception as e:
        logging.error(f"Erro ao gerar relatório patrimonial PDF: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()


@quant_bp.route('/api/ai/analyze-pdf', methods=['POST'])
def analyze_pdf_endpoint():
    body = request.get_json(silent=True) or {}
    ticker = body.get('ticker', '').strip().upper()
    if not ticker:
        return jsonify({"status": "Erro", "msg": "Ticker do ativo é obrigatório."}), 400
        
    session = Session()
    try:
        position = session.query(Position).join(Position.asset).filter(Position.user_id == g.user_id, Asset.ticker == ticker).first()
        if not position or not position.last_report_url:
            return jsonify({"status": "Erro", "msg": f"Nenhum link de relatório de RI disponível para o ativo {ticker}."}), 404
            
        url = position.last_report_url
        is_fii = position.asset.category.name == "FII"
        
        from utils.pdf_extractor import extract_kpis_from_pdf
        res = extract_kpis_from_pdf(url, is_fii)
        return jsonify(res)
    except Exception as e:
        logging.error(f"Erro ao processar relatório RI PDF de {ticker}: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    finally:
        Session.remove()
