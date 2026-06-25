from flask import Blueprint, jsonify, request
from pydantic import BaseModel, Field, ValidationError
import sys
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed # ⚡ Injetado o motor de paralelismo

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService
from utils.cvm_processor import CVMProcessor

assets_bp = Blueprint('assets', __name__)
service = PortfolioService()

# --- Schemas de Validação ---
class AssetInput(BaseModel):
    ticker: str = Field(..., min_length=1, strip_whitespace=True)
    category: str = Field(..., min_length=1)
    qtd: float = Field(ge=0, default=0)
    pm: float = Field(ge=0, default=0)
    meta: float = Field(ge=0, default=0)

class UpdateInput(BaseModel):
    ticker: str
    qtd: float = Field(ge=0)
    pm: float = Field(ge=0)
    meta: float = Field(ge=0, le=100, default=0)
    dy: float = Field(default=0)
    lpa: float = Field(default=0)
    vpa: float = Field(default=0)
    current_price: float = Field(default=None)

# --- Funções Auxiliares de Threading ---

def _worker_process_fundamentalist_data(asset):
    """🛠️ TRABALHADOR PARALELO: Processa a carga pesada de dados CVM fora da thread principal do Flask"""
    try:
        # Tenta converter o objeto SQLAlchemy para dicionário de forma segura
        asset_dict = asset.to_dict() if hasattr(asset, 'to_dict') else dict(asset)
        
        tipo = getattr(asset, 'tipo', asset_dict.get('tipo', ''))
        cvm_code = getattr(asset, 'cvm_code', asset_dict.get('cvm_code', None))
        ticker = getattr(asset, 'ticker', asset_dict.get('ticker', 'UNKNOWN'))

        if tipo == 'Ação' and cvm_code:
            try:
                # Executa a leitura física/requisição do JSON da CVM em paralelo
                asset_dict['fundamentalist_data'] = CVMProcessor.get_dashboard_data(cvm_code)
            except Exception as e:
                logging.warning(f"⚠️ Falha controlada ao obter dados CVM do papel {ticker}: {e}")
                asset_dict['fundamentalist_data'] = None
        else:
            asset_dict['fundamentalist_data'] = None
            
        return asset_dict
    except Exception as e:
        logging.error(f"❌ Erro estrutural ao processar mapeamento de ativo nas threads: {e}")
        return None

# --- Rotas ---

@assets_bp.route('/api/simulation')
def simulation():
    try:
        result = service.run_monte_carlo_simulation()
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/add_asset', methods=['POST'])
def add_asset():
    try:
        body = AssetInput(**request.json)
        
        result = service.add_new_asset(
            body.ticker.upper(), 
            body.category, 
            body.qtd, 
            body.pm,
            body.meta
        )
        
        if result["status"] == "Sucesso":
             try: 
                 service.update_prices()
                 service.take_daily_snapshot()
             except Exception as e: 
                 logging.warning(f"⚠️ Falha ao computar pós-inclusão de ativo: {e}")
             
        return jsonify(result)
        
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": e.errors()}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/update_asset', methods=['POST'])
def update_asset():
    try:
        body = UpdateInput(**request.json)
        
        result = service.update_position(
            ticker=body.ticker, 
            qtd=body.qtd, 
            pm=body.pm, 
            meta=body.meta, 
            dy=body.dy, 
            lpa=body.lpa, 
            vpa=body.vpa,
            current_price=body.current_price
        )
        
        if result["status"] == "Sucesso":
             service.take_daily_snapshot() 
             
        return jsonify(result)
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "detalhe": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    
@assets_bp.route('/api/validate_ticker', methods=['POST'])
def validate_ticker():
    data = request.json or {}
    ticker = data.get('ticker', '').strip()
    if not ticker:
        return jsonify({"valid": False, "msg": "Ticker vazio"})
    
    result = service.validate_ticker_on_yahoo(ticker)
    
    if not result['valid']:
        return jsonify({
            "valid": True, 
            "ticker": ticker.upper(), 
            "manual": True, 
            "msg": "Ativo não encontrado no Yahoo. Será cadastrado como Manual."
        })
    return jsonify(result)

@assets_bp.route('/api/delete_asset', methods=['POST'])
def delete_asset():
    data = request.json or {}
    asset_id = data.get('id')
    
    if not asset_id:
        return jsonify({"status": "Erro", "msg": "ID não informado"})
    
    result = service.delete_asset(asset_id)
    return jsonify(result)

@assets_bp.route('/api/assets')
def get_assets():
    """🚀 ROTA OTIMIZADA: Carrega e monta os dados fundamentalistas de toda a carteira em paralelo"""
    try:
        # Se get_all_assets não existir ou for dinâmico, o PortfolioService gerencia
        if hasattr(service, 'get_all_assets'):
            assets = service.get_all_assets()
        else:
            # Fallback seguro caso o método real seja via posições do dashboard
            dash_data = service.get_dashboard_data()
            return jsonify(dash_data.get("ativos", []))
            
        results = []
        
        # ⚡ Divide o processamento síncrono pesado em um Pool de até 10 Workers paralelos
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(_worker_process_fundamentalist_data, asset) for asset in assets]
            
            for future in as_completed(futures):
                res = future.result()
                if res is not None:
                    results.append(res)
        
        # Mantém a ordenação alfabética por Ticker estável para o front-end
        results.sort(key=lambda x: x.get('ticker', ''))
        return jsonify(results)
        
    except Exception as e:
        logging.error(f"❌ Erro grave ao montar listagem de ativos: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    
@assets_bp.route('/api/correlation', methods=['GET'])
def correlation():
    data = service.get_correlation_matrix()
    return jsonify(data)

@assets_bp.route('/api/refresh_prices', methods=['POST'])
def refresh_prices():
    try:
        logging.info("⚡ Recebido comando de atualização manual via Dashboard.")
        service.update_prices()
        service.take_daily_snapshot()
        return jsonify({"status": "Sucesso", "msg": "Preços e Variações atualizados!"})
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/risk-metrics', methods=['GET'])
def risk_metrics():
    """
    Retorna métricas institucionais de risco do portfólio vs. IBOVESPA:
    Beta, Alpha (Jensen), Sharpe, Sortino, Calmar e Maximum Drawdown.
    Usa cache de histórico compartilhado com Monte Carlo para evitar rede redundante.
    """
    try:
        result = service.calculate_risk_metrics()
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro nas métricas de risco: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/smart-rebalance', methods=['POST'])
def smart_rebalance():
    """
    Motor de Rebalanceamento Inteligente com Correlação.
    Recebe aporte_mensal (R$) e retorna sugestões de compra por ativo,
    ponderadas pelo gap de alocação e penalidade de correlação.

    Body JSON: { "aporte_mensal": 1500.0 }
    """
    try:
        body = request.get_json(silent=True) or {}
        aporte = float(body.get("aporte_mensal", 0.0))
        result = service.calculate_smart_rebalance(monthly_contribution=aporte)
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro no smart-rebalance: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/project-income', methods=['POST'])
def project_income():
    """
    Projeção de Independência Financeira via juros compostos.
    Retorna timeline anual de patrimônio e renda projetada,
    marcos de FI (anos para atingir R$3k, R$5k, R$10k/mês etc.)

    Body JSON: {
      "aporte_mensal": 2000.0,
      "anos": 20,
      "retorno_anual_pct": 12.0,
      "dy_anual_pct": 6.0
    }
    """
    try:
        body = request.get_json(silent=True) or {}
        result = service.calculate_income_projection(
            monthly_contribution=float(body.get("aporte_mensal", 1000.0)),
            years=int(body.get("anos", 20)),
            annual_return_pct=float(body.get("retorno_anual_pct", 12.0)),
            annual_dividend_yield_pct=float(body.get("dy_anual_pct", 6.0)),
        )
        return jsonify(result)
    except Exception as e:
        logging.error(f"❌ Erro na projeção de income: {e}", exc_info=True)
        return jsonify({"status": "Erro", "msg": str(e)}), 500
