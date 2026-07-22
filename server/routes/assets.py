from flask import Blueprint, jsonify, request
from pydantic import BaseModel, Field, ValidationError
from typing import Optional
import sys
import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed # ⚡ Injetado o motor de paralelismo

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from services import PortfolioService


def _paginate(query, page: int = 1, page_size: int = 50):
    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)
    total = query.count()
    items = query.limit(page_size).offset((page - 1) * page_size).all()
    return items, total
from utils.cvm_processor import CVMProcessor

assets_bp = Blueprint('assets', __name__)
service = PortfolioService()

# --- Schemas de Validação ---
from schemas import AssetTransactionCreate
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
    current_price: Optional[float] = Field(default=None)

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

import json
@assets_bp.route('/api/tickers', methods=['GET'])
def get_tickers():
    try:
        cache_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'tickers_cache.json')
        if not os.path.exists(cache_path):
            return jsonify([])
        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        logging.error(f"Erro ao ler tickers_cache.json: {e}")
        return jsonify([])

@assets_bp.route('/api/add_asset', methods=['POST'])
def add_asset():
    try:
        body = AssetInput(**request.json)
        
        msg = service.add_new_asset(
            body.ticker.upper(), 
            body.category, 
            body.qtd, 
            body.pm,
            body.meta
        )
        
        def _background_tasks():
            try:
                service.update_prices()
                service.take_daily_snapshot()
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar pós-inclusão de ativo em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_tasks)
             
        return jsonify({"status": "Sucesso", "msg": msg})
        
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": e.errors()}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/update_asset', methods=['POST'])
def update_asset():
    try:
        body = UpdateInput(**request.json)
        
        msg = service.update_position(
            ticker=body.ticker, 
            qtd=body.qtd, 
            pm=body.pm, 
            meta=body.meta, 
            dy=body.dy, 
            lpa=body.lpa, 
            vpa=body.vpa,
            current_price=body.current_price
        )
        
        def _background_update():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-atualização em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)
             
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "detalhe": str(e)}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500
    
@assets_bp.route('/api/validate_ticker', methods=['POST'])
def validate_ticker():
    data = request.json or {}
    ticker = data.get('ticker', '').strip()
    if not ticker:
        return jsonify({"valid": False, "msg": "Ticker vazio"}), 400
    
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
        return jsonify({"status": "Erro", "msg": "ID não informado"}), 400
    
    try:
        msg = service.delete_asset(asset_id)
        
        def _background_delete():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-exclusão em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_delete)
        
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 404
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/asset-transactions', methods=['POST'])
def add_asset_transaction():
    try:
        body = AssetTransactionCreate(**request.json)
        msg = service.add_transaction(
            ticker=body.ticker,
            tx_type=body.type,
            quantity=body.quantity,
            unit_price=body.unit_price,
            date=body.date,
            category=body.category,
            force_duplicate=body.force_duplicate
        )
        
        def _background_update():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-transação em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)

        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except ValidationError as e:
        return jsonify({"status": "Erro", "msg": "Dados inválidos", "errors": e.errors()}), 400
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/asset-transactions/<ticker>', methods=['GET'])
def get_asset_transactions(ticker):
    try:
        history = service.get_transaction_history(ticker.upper())
        return jsonify(history)
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/all-asset-transactions', methods=['GET'])
def get_all_asset_transactions():
    try:
        if not hasattr(service, 'get_all_transactions_history'):
            return jsonify([])
        history = service.get_all_transactions_history()
        return jsonify(history)
    except Exception as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 500

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
        
        # Removemos o ThreadPoolExecutor para evitar 'database is locked' com SQLite.
        # Em SQLite, o paralelismo pesado dentro de uma rota trava o Gunicorn.
        for asset in assets:
            res = _worker_process_fundamentalist_data(asset)
            if res is not None:
                results.append(res)
        
        # Mantém a ordenação alfabética por Ticker estável para o front-end
        results.sort(key=lambda x: x.get('ticker', ''))
        return jsonify(results)
        
    except Exception as e:
        logging.error(f"❌ Erro grave ao montar listagem de ativos: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500

@assets_bp.route('/api/refresh_prices', methods=['POST'])
def refresh_prices():
    def _bg_refresh():
        if service._price_lock.acquire(blocking=False):
            try:
                logging.info("⚡ Executando atualização manual de preços em background...")
                service.update_prices()
                service.take_daily_snapshot()
            except Exception as e:
                logging.error(f"⚠️ Erro no background de refresh_prices: {e}")
            finally:
                service._price_lock.release()
                
    from services import background_task_executor
    background_task_executor.submit(_bg_refresh)
    
    return jsonify({"status": "Processando", "msg": "Atualização iniciada em background."}), 202

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


@assets_bp.route('/api/corporate-action', methods=['POST'])
def corporate_action():
    try:
        body = request.json or {}
        ticker = body.get('ticker')
        action_type = body.get('type')
        
        if not ticker or not action_type:
            return jsonify({"status": "Erro", "msg": "Ticker e Tipo de Evento são obrigatórios"}), 400
            
        msg = service.add_corporate_action(ticker, action_type, body)
        
        def _background_update():
            try:
                service.take_daily_snapshot() 
            except Exception as e:
                logging.warning(f"⚠️ Falha ao computar snapshot pós-evento em background: {e}")
                
        from services import background_task_executor
        background_task_executor.submit(_background_update)
        
        return jsonify({"status": "Sucesso", "msg": msg})
    except ValueError as e:
        return jsonify({"status": "Erro", "msg": str(e)}), 400
    except Exception as e:
        logging.error(f"❌ Erro na rota corporate-action: {e}")
        return jsonify({"status": "Erro", "msg": str(e)}), 500
