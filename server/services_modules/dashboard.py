# server/services_modules/dashboard.py
import logging
import traceback
from decimal import Decimal
from db.models import Category, MarketScreenerItem, get_active_positions
from utils.formatters import extract_position_metrics
from db.session import Session

from .dashboard_metrics import calculate_fundamental_metrics, apply_strategy
from .dashboard_alerts import build_alerts
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    _BRT_TZ = ZoneInfo("America/Sao_Paulo")
except Exception:
    _BRT_TZ = timezone(timedelta(hours=-3))

class DashboardService:
    def get_dashboard_data(self):
        user_id = getattr(self, 'current_user_id', None)
        dolar_rate = self.get_usd_rate()
        with Session() as session:
            try:
                positions = get_active_positions(session, user_id).all()
                categories = session.query(Category).all()
                tickers_list = [p.asset.ticker for p in positions if p.asset]
                screener_by_ticker = {
                    s.ticker: s
                    for s in session.query(MarketScreenerItem).filter(MarketScreenerItem.ticker.in_(tickers_list)).all()
                } if tickers_list else {}
                
                resumo = {
                    "Total": Decimal('0.0'),
                    "RendaMensal": Decimal('0.0'),
                    "TotalInvestido": Decimal('0.0'),
                    "LucroTotal": Decimal('0.0')
                }
                cat_totals = {c.name: Decimal('0.0') for c in categories}
                cat_metas = {c.name: Decimal(str(c.target_percent or 0)) for c in categories}
                ativos_proc = []

                for pos in positions:
                    asset = pos.asset
                    if not asset: 
                        continue 

                    mdata = (
                        max(asset.market_data, key=lambda m: (m.date or datetime.min.date(), m.id or 0))
                        if asset.market_data
                        else None
                    )
                    qtd, pm, preco, min_6m, change_percent = extract_position_metrics(pos, mdata)

                    fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
                    total_atual = qtd * preco * fator
                    total_investido = qtd * pm * fator
                    
                    resumo["Total"] += total_atual
                    resumo["TotalInvestido"] += total_investido
                    if asset.category and asset.category.name in cat_totals:
                        cat_totals[asset.category.name] += total_atual
                    
                    metrics = calculate_fundamental_metrics(pos, preco, fator=fator)
                    resumo["RendaMensal"] += Decimal(str(metrics.get("renda_mensal_est", 0)))
                    
                    ativos_proc.append({
                        "obj": pos, "total_atual": total_atual, "total_investido": total_investido,
                        "preco_atual": preco, "min_6m": min_6m, "change_percent": change_percent, "metrics": metrics,
                        "mdata_date": mdata.date.isoformat() if mdata and mdata.date else None
                    })

                resumo["LucroTotal"] = resumo["Total"] - resumo["TotalInvestido"]
                resumo.update(cat_totals)

                final_list = []
                
                for item in ativos_proc:
                    pos = item["obj"]
                    asset = pos.asset
                    total_atual = item["total_atual"]
                    total_investido = item["total_investido"]
                    preco = item["preco_atual"]
                    min_6m = item["min_6m"]
                    change_percent = item["change_percent"]
                    
                    cat_name = asset.category.name if asset.category else ""
                    cat_total = cat_totals.get(cat_name, Decimal('1.0'))
                    pct_na_categoria = (total_atual / cat_total) * Decimal('100.0') if cat_total > 0 else Decimal('0.0')
                    
                    cat_target_pct = cat_metas.get(cat_name, Decimal('0.0'))
                    meta_macro = cat_target_pct / Decimal('100.0')
                    meta_micro = Decimal(str(pos.target_percent or 0)) / Decimal('100.0')
                    meta_global_valor = resumo["Total"] * meta_macro * meta_micro
                    falta = meta_global_valor - total_atual

                    rec_text, status, score, motivo, rsi = apply_strategy(
                        pos,
                        item["metrics"],
                        falta,
                        preco,
                        min_6m,
                        screener_item=screener_by_ticker.get(asset.ticker),
                    )
                    item["rsi"] = rsi

                    if status == "COMPRA_FORTE":
                        status_order = 0
                    elif status == "COMPRAR":
                        status_order = 1
                    elif status == "NEUTRO":
                        status_order = 2
                    else:
                        status_order = 3

                    # Zero variation if not from today (America/Sao_Paulo, visible until 23:59 BRT)
                    today_str = datetime.now(_BRT_TZ).strftime('%Y-%m-%d')
                    mdata_date_str = item.get("mdata_date")
                    final_change_percent = float(change_percent) if mdata_date_str == today_str else 0.0

                    final_list.append({
                        "id": asset.id,
                        "ticker": asset.ticker,
                        "nome": asset.name,
                        "cnpj": asset.cnpj or "",
                        "codigo_cvm": asset.cvm_code or "",
                        "tipo": cat_name,
                        "categoria": cat_name,
                        "currency": asset.currency,
                        "moeda": asset.currency,
                        "fator": float(dolar_rate if asset.currency == 'USD' else 1),
                        "qtd": float(pos.quantity),
                        "quantidade": float(pos.quantity),
                        "pm": float(pos.average_price),
                        "preco_medio": float(pos.average_price),
                        "preco_atual": float(preco),
                        "min_6m": float(min_6m),
                        "change_percent": final_change_percent,
                        "total_atual": float(total_atual),
                        "total_investido": float(total_investido),
                        "lucro_valor": float(total_atual - total_investido),
                        "lucro": float(total_atual - total_investido),
                        "lucro_pct": float(((total_atual - total_investido) / total_investido * 100) if total_investido > 0 else 0),
                        "lucro_percent": float(((total_atual - total_investido) / total_investido * 100) if total_investido > 0 else 0),
                        "meta": float(pos.target_percent),
                        "meta_carteira": float(pos.target_percent),
                        "pct_na_categoria": float(pct_na_categoria),
                        "participacao_categoria": float(pct_na_categoria),
                        "falta_comprar": float(falta) if falta > Decimal('0') else 0.0,
                        "score": score,
                        "status": status,
                        "recomendacao": rec_text,
                        "motivo": motivo,
                        "status_order": status_order,
                        "rsi": rsi,
                        "manual_lpa": float(pos.manual_lpa) if pos.manual_lpa is not None else 0.0,
                        "manual_vpa": float(pos.manual_vpa) if pos.manual_vpa is not None else 0.0,
                        "manual_dy": float(pos.manual_dy) if pos.manual_dy is not None else 0.0,
                        "last_report_url": pos.last_report_url,
                        "last_report_at": pos.last_report_at,
                        "last_report_type": pos.last_report_type,
                        "mdata_date": mdata_date_str,
                        "vi_graham": float(item["metrics"].get("vi_graham", 0)),
                        "mg_graham": float(item["metrics"].get("mg_graham", 0)),
                        "bazin_price": float(item["metrics"].get("bazin_price", 0)) or (screener_by_ticker[asset.ticker].bazin_price if asset.ticker in screener_by_ticker and screener_by_ticker[asset.ticker].bazin_price else 0.0),
                        "mg_bazin": float(item["metrics"].get("mg_bazin", 0)) or (
                            round(((screener_by_ticker[asset.ticker].bazin_price - float(preco)) / float(preco)) * 100.0, 2)
                            if float(preco) > 0 and asset.ticker in screener_by_ticker and screener_by_ticker[asset.ticker].bazin_price
                            else 0.0
                        ),
                        "gordon_price": float(item["metrics"].get("gordon_price", 0)),
                        "dcf_price": screener_by_ticker[asset.ticker].dcf_price if asset.ticker in screener_by_ticker and screener_by_ticker[asset.ticker].dcf_price else 0.0,
                        "quality_score": screener_by_ticker[asset.ticker].quality_score if asset.ticker in screener_by_ticker else 0,
                        "p_vp": float(item["metrics"].get("p_vp", 0)),
                        "magic_number": int(item["metrics"].get("magic_number", 0)),
                        "renda_mensal_est": float(item["metrics"].get("renda_mensal_est", 0)),
                        "criterios_nao_avaliados": item["metrics"].get("criterios_nao_avaliados", []),
                    })

                alertas = build_alerts(ativos_proc, cat_totals, cat_metas, resumo, self, session)

                final_list.sort(key=lambda x: x["score"], reverse=True)

                lista_grafico = [{"name": k, "value": v} for k, v in cat_totals.items() if v > 0]
                cats_info = [{"name": c.name, "meta": c.target_percent} for c in categories]
                
                return { 
                    "dolar": dolar_rate, 
                    "resumo": resumo, 
                    "grafico": lista_grafico, 
                    "alertas": alertas, 
                    "ativos": final_list, 
                    "categorias": cats_info 
                }
            except Exception as e:
                logging.error(f"❌ Erro Crítico na montagem do Dashboard: {traceback.format_exc()}")
                raise e

    def get_single_asset_score_data(self, ticker):
        user_id = getattr(self, 'current_user_id', None)
        dolar_rate = self.get_usd_rate()
        with Session() as session:
            active_positions = get_active_positions(session, user_id, include_dividends=False).all()
            pos = next((p for p in active_positions if p.asset and p.asset.ticker == ticker), None)
            if not pos:
                return None

            asset = pos.asset
            mdata = asset.market_data[0] if asset.market_data else None

            try:
                qtd = Decimal(str(pos.quantity or 0))
                if mdata and mdata.price is not None and mdata.price > 0:
                    preco = Decimal(str(mdata.price))
                    min_6m = Decimal(str(mdata.min_6m or 0))
                else:
                    preco = Decimal('0.0')
                    min_6m = Decimal('0.0')
            except Exception:
                qtd = Decimal('0.0')
                preco = Decimal('0.0')
                min_6m = Decimal('0.0')

            fator = dolar_rate if asset.currency == 'USD' else Decimal('1.0')
            total_atual = qtd * preco * fator

            portfolio_total = Decimal('0.0')
            for p in active_positions:
                pa = p.asset
                pmd = pa.market_data[0] if pa.market_data else None
                pprice = Decimal(str(pmd.price or p.average_price or 0.0)) if pmd else Decimal(str(p.average_price or 0.0))
                pfator = dolar_rate if pa.currency == 'USD' else Decimal('1.0')
                portfolio_total += Decimal(str(p.quantity or 0)) * pprice * pfator
                    
            metrics = calculate_fundamental_metrics(pos, preco, fator=fator)
            
            cat_target = Decimal(str(asset.category.target_percent or 0)) if asset.category else Decimal('0.0')
            meta_macro = cat_target / Decimal('100.0')
            meta_micro = Decimal(str(pos.target_percent or 0)) / Decimal('100.0')
            meta_global_valor = portfolio_total * meta_macro * meta_micro
            falta = meta_global_valor - total_atual
            
            rec_text, status, score, motivo, rsi = apply_strategy(
                pos, metrics, falta, preco, min_6m
            )
            
            return {
                "score": score,
                "recomendacao": rec_text,
                "status": status,
                "motivo": motivo,
                "rsi": rsi,
                **metrics
            }
