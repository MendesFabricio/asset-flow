# server/routes/quant_analysis.py
from flask import Blueprint, jsonify, request
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
        # Busca posições ativas
        positions = session.query(Position).filter(Position.quantity > 0).all()
        if not positions:
            return jsonify({"status": "Sucesso", "data": []})

        total_value = 0.0
        pos_values = []
        
        for pos in positions:
            price = float(pos.asset.market_data[0].price or 0.0) if pos.asset and pos.asset.market_data else 0.0
            val = float(pos.quantity) * price
            pos_values.append((pos, val))
            total_value += val

        data = []
        for pos, val in pos_values:
            weight_pct = (val / total_value * 100) if total_value > 0 else 0.0
            target_pct = float(pos.target_percent or 0.0)
            dev = weight_pct - target_pct
            
            if abs(dev) > 2.0:
                status = "EXCEDENTE" if dev > 0 else "SUBALOCADO"
                if dev > 0:
                    action_note = f"Vender R$ {abs(dev/100 * total_value):.2f}"
                else:
                    action_note = f"Comprar R$ {abs(dev/100 * total_value):.2f}"
            else:
                status = "NORMAL"
                action_note = "Em conformidade"

            data.append({
                "ticker": pos.asset.ticker.upper() if pos.asset else "N/A",
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
            positions = session.query(Position).filter(Position.quantity > 0).all()
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
