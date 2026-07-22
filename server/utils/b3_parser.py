import fitz
import re
import logging
from decimal import Decimal
from datetime import datetime
from utils.ticker_helper import get_canonical_ticker
from utils.import_shared import parse_brl_number

def extract_broker(desc: str) -> str:
    d = desc.upper()
    if "CLEAR" in d: return "Clear Corretora"
    if "NU INVEST" in d or "NUBANK" in d or "EASYINVEST" in d: return "Nu Investimentos"
    if "RICO" in d: return "Rico Investimentos"
    if "XP INVESTIMENTOS" in d or ("XP" in d and "CLEAR" not in d and "RICO" not in d): return "XP Investimentos"
    if "INTER" in d: return "Banco Inter"
    if "BTG" in d: return "BTG Pactual"
    if "ITAU" in d or "ITAÚ" in d: return "Itaú Corretora"
    if "AGORA" in d or "ÁGORA" in d: return "Ágora Investimentos"
    if "GENIAL" in d: return "Genial Investimentos"
    if "ORAMA" in d or "ÓRAMA" in d: return "Órama Investimentos"
    if "TORO" in d: return "Toro Investimentos"
    if "BANCO DO BRASIL" in d or "BB BANCO" in d: return "Banco do Brasil"
    if "BRADESCO" in d or "AGORA CTVM" in d: return "Bradesco/Ágora"
    if "SANTANDER" in d: return "Santander"
    if "MODAL" in d: return "Modalmais"
    if "WARREN" in d: return "Warren"
    if "C6" in d: return "C6 Bank"
    if "SAFRA" in d: return "Banco Safra"
    if "GUIDE" in d: return "Guide Investimentos"
    if "NOVA FUTURA" in d: return "Nova Futura"
    
    words = desc.split()
    if len(words) > 2:
        suffix = " ".join(words[-3:]).title()
        return suffix.replace(" S.a.", "").replace(" S.A.", "").replace(" - Ctvm", "").replace(" Dtvm", "").strip()
    return desc.title()

def extract_page_vector_indicators(page):
    """
    Identifica bolinhas/ícones verdes (Entrada/Credito/BUY) e vermelhos (Saída/Debito/SELL)
    no PDF da B3 baseado na cor de preenchimento (fill/color RGB).
    Retorna uma lista de tuplas (y_center, "BUY"|"SELL").
    """
    indicators = []
    try:
        drawings = page.get_drawings()
        for dw in drawings:
            rect = dw.get("rect")
            if not rect: continue
            x0, y0, x1, y1 = rect
            w = x1 - x0
            h = y1 - y0
            # Bolinhas coloridas são pequenas (ex: entre 2px e 40px)
            if 2 <= w <= 40 and 2 <= h <= 40:
                fill = dw.get("fill") or dw.get("color")
                if fill and isinstance(fill, (list, tuple)) and len(fill) >= 3:
                    r, g, b = fill[0], fill[1], fill[2]
                    y_mid = (y0 + y1) / 2.0
                    # Verde (Entrada / Credito -> BUY)
                    if g > 0.35 and g > r * 1.1:
                        indicators.append((y_mid, "BUY"))
                    # Vermelho (Saída / Debito -> SELL)
                    elif r > 0.35 and r > g * 1.1:
                        indicators.append((y_mid, "SELL"))
    except Exception as e:
        logging.warning(f"Erro ao extrair vetores da página B3: {e}")
    return indicators

def extract_b3_extract_transactions(file_stream, filename=""):
    """
    Parseia o Extrato de Movimentação da B3 (PDF).
    Agrupa blocos de texto por faixa de coordenada Y (linhas da tabela) para
    mapear cada operação com 100% de precisão ao seu indicador de cor (Verde = BUY / Vermelho = SELL).
    """
    doc = None
    try:
        doc = fitz.open(stream=file_stream.read(), filetype="pdf")
        
        meses = {
            "janeiro": "01", "fevereiro": "02", "março": "03", "abril": "04",
            "maio": "05", "junho": "06", "julho": "07", "agosto": "08",
            "setembro": "09", "outubro": "10", "novembro": "11", "dezembro": "12"
        }

        dividend_types = ['Rendimento', 'Dividendo', 'Juros Sobre Capital Próprio']
        transaction_types = [
            'Transferência - Liquidação', 'Resgate', 'Compra Opção de Compra', 'Venda Opção de Venda',
            'Compra Opção', 'Venda Opção', 'Opção de Compra', 'Opção de Venda', 'Exercício de Opção'
        ]
        corporate_event_types = ['Leilão de Fração', 'Fração em Ativos', 'Bonificação em Ativos', 'Desdobramento', 'Grupamento', 'Cisão', 'Atualização']

        op_pattern = r"(Rendimento|Dividendo|Juros Sobre Capital Próprio|Transferência - Liquidação|Leilão de Fração|Resgate|Fração em Ativos|Bonificação em Ativos|Desdobramento|Grupamento|Cisão|Atualização|Compra Opção de Compra|Venda Opção de Venda|Compra Opção|Venda Opção|Opção de Compra|Opção de Venda|Exercício de Opção)\s+([A-Z0-9]{4,8})\s+-\s+(.*?)\s+(\d+(?:,\d+)?)\s+R\$\s*([\d,.-]+)\s+R\$\s*([\d,.-]+)"
        date_pattern = r"(\d{2}) de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})"

        dividends = []
        transactions = []
        corporate_events = []
        current_date_page = None

        for page in doc:
            indicators = extract_page_vector_indicators(page)
            blocks = page.get_text("blocks")
            
            rows = []
            
            for b in blocks:
                x0, y0, x1, y1, text, block_no, block_type = b
                clean_text = text.replace('\n', ' ').strip()
                if not clean_text or "Extrato de Movimentação" in clean_text or "acesse investidor" in clean_text:
                    continue
                
                dt_match = re.search(date_pattern, clean_text)
                if dt_match:
                    dd, mes_str, yyyy = dt_match.groups()
                    current_date_page = f"{yyyy}-{meses[mes_str]}-{dd}"
                    continue
                
                y_mid = (y0 + y1) / 2.0
                found_row = None
                for r_dict in rows:
                    if abs(r_dict["y_mid"] - y_mid) < 15.0:
                        found_row = r_dict
                        break
                        
                if found_row:
                    found_row["text"] += " " + clean_text
                    found_row["y_mid"] = (found_row["y_mid"] + y_mid) / 2.0
                else:
                    rows.append({
                        "y_mid": y_mid,
                        "text": clean_text,
                        "date": current_date_page
                    })
                    
            rows.sort(key=lambda r: r["y_mid"])
            
            for r_dict in rows:
                row_text = r_dict["text"]
                row_y = r_dict["y_mid"]
                tx_date = r_dict.get("date")
                
                for match in re.finditer(op_pattern, row_text):
                    op_name, ticker_raw, description, qty_str, price_str, total_str = match.groups()
                    ticker = get_canonical_ticker(ticker_raw.strip().upper())
                    qty = float(parse_brl_number(qty_str))
                    unit_price = float(parse_brl_number(price_str))
                    total_value = float(parse_brl_number(total_str))
                    broker_name = extract_broker(description)

                    if op_name in dividend_types:
                        dividends.append({
                            "ticker": ticker,
                            "type": op_name,
                            "date": tx_date,
                            "quantity": qty,
                            "unit_price": unit_price,
                            "total_value": total_value,
                            "description": broker_name
                        })
                    elif op_name in transaction_types:
                        if unit_price == 0 and total_value == 0:
                            continue

                        # Associa com a bolinha colorida exata daquela linha Y
                        tx_type = None
                        min_dist = 25.0
                        for y_ind, direction in indicators:
                            dist = abs(y_ind - row_y)
                            if dist < min_dist:
                                min_dist = dist
                                tx_type = direction
                                
                        if not tx_type:
                            op_upper = op_name.upper()
                            row_upper = row_text.upper()
                            if "DEBITO" in row_upper or "SAIDA" in row_upper or "VENDA" in op_upper:
                                tx_type = "SELL"
                            else:
                                tx_type = "BUY"

                        transactions.append({
                            "ticker": ticker,
                            "type": tx_type,
                            "original_type": op_name,
                            "date": tx_date,
                            "quantity": qty,
                            "unit_price": unit_price,
                            "total_value": total_value,
                            "description": broker_name
                        })
                    elif op_name in corporate_event_types:
                        corporate_events.append({
                            "ticker": ticker,
                            "type": op_name,
                            "date": tx_date,
                            "quantity": qty,
                            "unit_price": unit_price,
                            "total_value": total_value,
                            "description": broker_name
                        })
            
        logging.warning(f"[B3] Parsed {len(dividends)} proventos, {len(transactions)} transactions and {len(corporate_events)} corporate events.")

        return {
            "status": "Sucesso",
            "dividends": dividends,
            "transactions": transactions,
            "corporate_events_suggestions": corporate_events
        }

    except Exception as e:
        logging.error(f"Erro no parse de extrato b3: {e}", exc_info=True)
        return {
            "status": "Erro",
            "msg": str(e),
            "dividends": [],
            "transactions": [],
            "corporate_events_suggestions": []
        }
