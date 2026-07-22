import fitz
import re
import logging
from decimal import Decimal
from datetime import datetime
from utils.ticker_helper import resolve_ticker
from utils.import_shared import parse_brl_number, normalize_date, TransactionCandidate

def guess_category(ticker: str) -> str:

    """Tenta adivinhar a categoria (Ação, FII, Renda Fixa, Internacional) pelo ticker."""
    if not ticker:
        return "Ação"
    t = ticker.upper()
    if t.endswith("34") or t.endswith("39"):
        return "Internacional"
    elif t.endswith("11"):
        if t in ["KLBN11", "TAEE11", "SANB11", "BPAC11", "ALUP11", "ENGI11", "SULA11"]:
            return "Ação"
        elif t in ["B5P211", "LFTS11", "KDIF11"]:
            return "Renda Fixa"
        else:
            return "FII"
    elif t.endswith("3") or t.endswith("4") or t.endswith("5") or t.endswith("6"):
        return "Ação"
    return "Ação"

def parse_decimal(value_str):
    """Converts a Brazilian format string to Decimal (e.g. 1.234,56 -> 1234.56)."""
    try:
        clean = value_str.strip().replace('.', '').replace(',', '.')
        return Decimal(clean)
    except Exception:
        return Decimal('0')

def _find_date(clean_text: str) -> str | None:
    """Extracts the pregão date from the note text."""
    m = re.search(r'Data\s+preg.o\s+\d[\d\s]+?(\d{2}/\d{2}/\d{4})', clean_text, re.IGNORECASE)
    if m:
        return m.group(1)

    m = re.search(r'Data\s+preg.o\s+(\d{2}/\d{2}/\d{4})', clean_text, re.IGNORECASE)
    if m:
        return m.group(1)

    m = re.search(r'(\d{2}/\d{2}/\d{4})', clean_text)
    if m:
        return m.group(1)

    return None

def extract_brokerage_note_transactions(pdf_path: str) -> dict:
    doc = None
    try:
        doc = fitz.open(pdf_path)
        transactions = []
        current_date = None

        # ─────────────────────────────────────────────────────────────
        # PADRÃO 1 (NOVO 2025+): Cobre B3 RV e RF
        # ─────────────────────────────────────────────────────────────
        pattern_new = re.compile(
            r'B3\s+(RV|RF)\s+LISTADO?\s+([CV])\s+(VISTA|FRACIONARIO|OPCAO DE COMPRA|OPCAO DE VENDA|OPCAO|OPCOES|EXERC OPCAO|OPC|EXERC)\s+'
            r'(.*?)\s+'                     # Nome + Tipo (ex: KLABIN S/A UNT N2)
            r'(?:@\s*)?'                    # Ignora o @ de Taxa de Transferência se houver
            r'(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([DC])',
            re.IGNORECASE
        )

        # ─────────────────────────────────────────────────────────────
        # PADRÃO 2 (ANTIGO RV)
        # ─────────────────────────────────────────────────────────────
        pattern_old_rv = re.compile(
            r'([\d.,]+)\s+([DC])\s+([\d.,]+)\s+(\d+)\s+'
            r'(?:ON|PN|CI|BDR|DR|UNT|ETF|FII|CALL|PUT)?(?:\s+(?:NM|N1|N2|N3|N5|MA|ER|FS))?\s+'
            r'([\w\/][\w\/\s]{0,40}?)\s+'
            r'(FRACIONARIO|VISTA|OPCAO DE COMPRA|OPCAO DE VENDA|OPCAO|OPCOES|EXERC OPCAO|OPC|EXERC)\s+([CV])\s+B3',
            re.IGNORECASE
        )

        # ─────────────────────────────────────────────────────────────
        # PADRÃO 3 (EasyNvest RF)
        # ─────────────────────────────────────────────────────────────
        pattern_rf = re.compile(
            r'B3\s+RF\s+LISTA\s+([CV])\s+(VISTA|FRACIONARIO|OPCAO DE COMPRA|OPCAO DE VENDA|OPCAO|OPCOES|OPC)\s+'
            r'([\w][\w\s\/]{1,50}?)\s+'
            r'(\d+)\s+([\d.,]+)\s+([DC])\s+([\d.,]+)',
            re.IGNORECASE
        )

        # ─────────────────────────────────────────────────────────────
        # PADRÃO 4 (CLEAR/XP SINACOR)
        # Ex: "1-BOVESPA C FRACIONARIO JHSF PART ONEDNM 50 8,33 416,50 D"
        # ─────────────────────────────────────────────────────────────
        pattern_clear = re.compile(
            r'1-BOVESPA\s+([CV])\s+(VISTA|FRACIONARIO|OPCAO DE COMPRA|OPCAO DE VENDA|OPCAO|OPCOES|EXERC OPCAO|OPC|EXERC)\s+'
            r'(.*?)\s+'
            r'(\d+)\s+([\d.,]+)\s+([\d.,]+)\s+([DC])',
            re.IGNORECASE
        )

        for page in doc:
            text = page.get_text()
            clean_text = " ".join(text.split())

            # Detecta se há uma nova data de pregão nesta página.
            # Se for uma nota que se estende por várias páginas sem cabeçalho, mantém current_date.
            page_date = _find_date(clean_text)
            if page_date:
                current_date = page_date
            
            # Converter data da página atual para formato ISO
            iso_date = None
            if current_date:
                try:
                    dt = datetime.strptime(current_date, "%d/%m/%Y")
                    iso_date = dt.strftime("%Y-%m-%d")
                except Exception:
                    iso_date = current_date

            logging.warning(f"[OCR] Page sample: {clean_text[:300]}")
            found_any = False

            # Tenta padrão NOVO (RV/RF 2025)
            new_matches = list(pattern_new.finditer(clean_text))
            for m in new_matches:
                found_any = True
                market = m.group(1).upper() + " " + m.group(3).upper() # RV VISTA
                cv = m.group(2).upper()
                name = m.group(4).strip()
                quantity = int(m.group(5).replace('.', ''))
                unit_price = float(parse_brl_number(m.group(6)))
                total_value = float(parse_brl_number(m.group(7)))
                op_type = "BUY" if cv == "C" else "SELL"
                ticker = resolve_ticker(name)
                transactions.append({
                    "ticker": ticker,
                    "name": name,
                    "type": op_type,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "total_value": total_value,
                    "date": iso_date,
                    "market_type": market,
                    "category": guess_category(ticker)
                })

            # Tenta padrão ANTIGO (RV)
            if not found_any:
                old_matches = list(pattern_old_rv.finditer(clean_text))
                for m in old_matches:
                    found_any = True
                    unit_price = float(parse_brl_number(m.group(1)))
                    total_value = float(parse_brl_number(m.group(3)))
                    quantity = int(m.group(4).replace('.', ''))
                    name = m.group(5).strip()
                    cv = m.group(7).upper()
                    op_type = "BUY" if cv == "C" else "SELL"
                    ticker = resolve_ticker(name)
                    transactions.append({
                        "ticker": ticker,
                        "name": name,
                        "type": op_type,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "date": iso_date,
                        "market_type": "RV",
                        "category": guess_category(ticker)
                    })

            # Tenta padrão EasyNvest RF
            if not found_any:
                rf_matches = list(pattern_rf.finditer(clean_text))
                for m in rf_matches:
                    found_any = True
                    cv = m.group(1).upper()
                    name = m.group(3).strip()
                    quantity = int(m.group(4).replace('.', ''))
                    total_value = float(parse_brl_number(m.group(5)))
                    unit_price = float(parse_brl_number(m.group(7)))
                    op_type = "BUY" if cv == "C" else "SELL"
                    ticker = resolve_ticker(name)
                    transactions.append({
                        "ticker": ticker,
                        "name": name,
                        "type": op_type,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "date": iso_date,
                        "market_type": "RF",
                        "category": guess_category(ticker)
                    })

            # Tenta padrão CLEAR/XP SINACOR
            if not found_any:
                clear_matches = list(pattern_clear.finditer(clean_text))
                for m in clear_matches:
                    found_any = True
                    cv = m.group(1).upper()
                    market = m.group(2).upper()
                    name = m.group(3).strip()
                    quantity = int(m.group(4).replace('.', ''))
                    unit_price = float(parse_brl_number(m.group(5)))
                    total_value = float(parse_brl_number(m.group(6)))
                    op_type = "BUY" if cv == "C" else "SELL"
                    ticker = resolve_ticker(name)
                    transactions.append({
                        "ticker": ticker,
                        "name": name,
                        "type": op_type,
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "date": iso_date,
                        "market_type": "RV " + market,
                        "category": guess_category(ticker)
                    })

        # Agrupar transações idênticas (mesmo ativo, tipo, preço e data)
        # Isso soma execuções parciais da B3 no mesmo preço, evitando perda de dados e falsas duplicatas
        grouped_txs = {}
        for tx in transactions:
            key = (tx['name'], tx['type'], tx['unit_price'], tx['date'])
            if key not in grouped_txs:
                grouped_txs[key] = tx.copy()
            else:
                grouped_txs[key]['quantity'] += tx['quantity']
                grouped_txs[key]['total_value'] += tx['total_value']
                grouped_txs[key]['total_value'] = round(grouped_txs[key]['total_value'], 2)

        unique_txs = list(grouped_txs.values())

        logging.warning(f"[OCR] Total unique transactions: {len(unique_txs)}")

        return {
            "status": "Sucesso",
            "date": current_date, # Retorna a última data lida como referência
            "transactions": unique_txs
        }

    except Exception as e:
        logging.error(f"Erro no parse de nota de corretagem: {e}", exc_info=True)
        return {"status": "Erro", "msg": str(e)}
    finally:
        if doc:
            doc.close()
