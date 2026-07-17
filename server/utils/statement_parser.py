import os
import re
import fitz  # PyMuPDF
import logging
from decimal import Decimal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("StatementParser")

def sanitize_and_categorize(description: str, tx_type: str = "") -> tuple[str, str]:
    desc_clean = (description or "").strip()
    desc_lower = desc_clean.lower()
    type_lower = (tx_type or "").lower()
    
    # 1. Fatura / Cartão
    if "pagamento de fatura" in desc_lower or "pagamento de fatura" in type_lower:
        return desc_clean, "Fatura/Cartão"
        
    # 2. Transferências e Pessoas (Pix, DOC, TED, ou nomes de pessoas físicas em transferências)
    is_pix_or_transfer = any(k in desc_lower or k in type_lower for k in [
        "pix", "transferência", "transferencia", "pagamentos - ip", "pagamento recebido", "envio de pix"
    ])
    if is_pix_or_transfer:
        # Tenta extrair o nome da pessoa física / recebedor
        name_part = desc_clean
        if " - " in desc_clean:
            parts = desc_clean.split(" - ")
            name_part = parts[-1].strip()
        elif "pelo pix" in desc_lower:
            m = re.split(r"pelo\s+pix[\s\-:]*", desc_clean, flags=re.IGNORECASE)
            if len(m) > 1 and m[-1].strip():
                name_part = m[-1].strip()
        
        # Formata o nome limpo em Title Case e atribui categoria única Transferências/Pessoas
        if name_part and name_part.lower() not in ["transferência enviada pelo pix", "transferência recebida pelo pix", "pix", "transferência"]:
            formatted_name = " ".join(w.capitalize() for w in name_part.split())
            return f"Transação (Pix) - {formatted_name}", "Transferências/Pessoas"
        return "Transação (Pix)", "Transferências/Pessoas"
        
    # 3. Transporte
    transporte_keywords = [
        "uber", "99app", "99 pay", "99taxi", "99", "cabify", "indrive", "in drive", "autopass", "tmob", 
        "taxi", "combustivel", "posto", "estacionamento", "sem parar", "veloe", "pedagio", "metro", "onibus", 
        "bilhete", "gasolina", "etanol", "ipiranga", "shell", "br distribuidora"
    ]
    if any(k in desc_lower for k in transporte_keywords):
        return desc_clean, "Transporte"
        
    # 4. Alimentação
    alimentacao_keywords = [
        "ifood", "rappi", "coffee", "café", "cafe", "restaurante", "padaria", "supermercado", 
        "mercado", "lanchonete", "bar", "açougue", "hamburguer", "burguer", "burger", "pizzaria", 
        "carrefour", "pao de acucar", "assai", "atacadão", "dia brasil", "cacau show", "bobs", 
        "mcdonalds", "burger king", "sushi", "açaí", "acai", "doceria", "bebidas", "confeitaria", 
        "churrascaria", "subway", "giraffas", "habibs", "ze delivery"
    ]
    if any(k in desc_lower for k in alimentacao_keywords):
        return desc_clean, "Alimentação"
        
    # 5. Saúde / Farmácia
    saude_keywords = [
        "drogaria", "farma", "pague menos", "drogasil", "droga raia", "pacheco", "sao paulo", 
        "hospital", "clinica", "medico", "odonto", "laboratorio", "fleury", "ultrafarma", "consulta", "exame"
    ]
    if any(k in desc_lower for k in saude_keywords):
        return desc_clean, "Saúde/Farmácia"
        
    # 6. Assinaturas / Lazer
    assinaturas_keywords = [
        "netflix", "spotify", "amazon prime", "apple", "google", "disney", "hbo", "max", 
        "gympass", "smartfit", "youtube", "cloud", "microsoft", "cinema", "ingresso"
    ]
    if any(k in desc_lower for k in assinaturas_keywords):
        return desc_clean, "Lazer/Assinaturas"
        
    # 7. Compras / Varejo
    varejo_keywords = [
        "mercadolivre", "mercado livre", "shopee", "shein", "amazon", "magalu", "americanas", 
        "casas bahia", "zara", "renner", "riachuelo", "centauro", "netshoes"
    ]
    if any(k in desc_lower for k in varejo_keywords):
        return desc_clean, "Compras/Varejo"
        
    # 8. Investimentos / Resgates
    if any(k in desc_lower or k in type_lower for k in ["resgate", "cdb", "tesouro", "investimento", "valor adicionado na conta"]):
        return desc_clean, "Investimentos/Resgate"
        
    return desc_clean, "Outros"

def categorize_transaction(description: str, tx_type: str = "") -> str:
    _, category = sanitize_and_categorize(description, tx_type)
    return category

def detect_reference_month(filename: str, period_str: str, transactions: list) -> tuple[str, str]:
    months_map = {
        "JAN": ("01", "Janeiro"), "JANEIRO": ("01", "Janeiro"),
        "FEV": ("02", "Fevereiro"), "FEVEREIRO": ("02", "Fevereiro"),
        "MAR": ("03", "Março"), "MARCO": ("03", "Março"), "MARÇO": ("03", "Março"),
        "ABR": ("04", "Abril"), "ABRIL": ("04", "Abril"),
        "MAI": ("05", "Maio"), "MAIO": ("05", "Maio"),
        "JUN": ("06", "Junho"), "JUNHO": ("06", "Junho"),
        "JUL": ("07", "Julho"), "JULHO": ("07", "Julho"),
        "AGO": ("08", "Agosto"), "AGOSTO": ("08", "Agosto"),
        "SET": ("09", "Setembro"), "SETEMBRO": ("09", "Setembro"),
        "OUT": ("10", "Outubro"), "OUTUBRO": ("10", "Outubro"),
        "NOV": ("11", "Novembro"), "NOVEMBRO": ("11", "Novembro"),
        "DEZ": ("12", "Dezembro"), "DEZEMBRO": ("12", "Dezembro"),
    }
    
    upper_fname = (filename or "").upper()
    for key, (num, label) in months_map.items():
        m = re.search(rf"(?:^|[^A-Z]){key}[^0-9]*(\d{{4}})", upper_fname)
        if m:
            year = m.group(1)
            return f"{num}/{year}", f"{label}/{year}"
        if re.search(rf"(?:^|[^A-Z]){key}(?:[^A-Z]|$)", upper_fname):
            ym = re.search(r"(20\d\d)", upper_fname)
            year = ym.group(1) if ym else "2025"
            return f"{num}/{year}", f"{label}/{year}"
            
    upper_period = (period_str or "").upper()
    for key, (num, label) in months_map.items():
        if re.search(rf"(?:^|[^A-Z]){key}(?:[^A-Z]|$)", upper_period):
            ym = re.search(r"(20\d\d)", upper_period)
            year = ym.group(1) if ym else "2025"
            return f"{num}/{year}", f"{label}/{year}"
            
    counts = {}
    for tx in transactions:
        dt = tx.get("date", "")
        for key, (num, label) in months_map.items():
            if re.search(rf"(?:^|[^A-Z]){key}(?:[^A-Z]|$)", dt.upper()):
                ym = re.search(r"(20\d\d)", dt)
                year = ym.group(1) if ym else "2025"
                month_key = (f"{num}/{year}", f"{label}/{year}")
                counts[month_key] = counts.get(month_key, 0) + 1
                break
        m_slash = re.search(r"\d{2}/(\d{2})/(\d{4})", dt)
        if m_slash:
            num = m_slash.group(1)
            year = m_slash.group(2)
            label = next((lbl for (n, lbl) in months_map.values() if n == num), f"Mês {num}")
            month_key = (f"{num}/{year}", f"{label}/{year}")
            counts[month_key] = counts.get(month_key, 0) + 1
            
    if counts:
        most_common = max(counts.items(), key=lambda x: x[1])[0]
        return most_common[0], most_common[1]
        
    return "09/2025", "Setembro/2025"

def parse_brl_amount(amount_str: str) -> float:
    try:
        clean = amount_str.strip().replace("R$", "").replace("+", "").strip()
        # Se for - X,XX ou -X,XX
        is_neg = False
        if clean.startswith("-"):
            is_neg = True
            clean = clean[1:].strip()
        
        # Formato BR: 2.683,00 -> 2683.00
        clean = clean.replace(".", "").replace(",", ".")
        val = float(clean)
        return -val if is_neg else val
    except Exception as e:
        logger.warning(f"Erro ao converter montante '{amount_str}': {e}")
        return 0.0

def parse_statement(file_path: str, filename: str) -> dict:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        result = parse_pdf_statement(file_path)
    elif ext in [".xlsx", ".xls", ".csv"]:
        result = parse_excel_or_csv_statement(file_path)
    elif ext == ".docx":
        result = parse_word_statement(file_path)
    else:
        try:
            result = parse_pdf_statement(file_path)
        except Exception:
            raise ValueError(f"Formato de arquivo não suportado: {ext}")
            
    detected_month, detected_month_label = detect_reference_month(
        filename, result.get("period", ""), result.get("transactions", [])
    )
    result["detected_month"] = detected_month
    result["detected_month_label"] = detected_month_label
    return result

def parse_pdf_statement(file_path: str) -> dict:
    doc = fitz.open(file_path)
    full_lines = []
    for page in doc:
        text = page.get_text()
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        full_lines.extend(lines)
        
    doc.close()
    
    period_str = ""
    saldo_inicial = 0.0
    rendimento_liquido = 0.0
    total_entradas = 0.0
    total_saidas = 0.0
    saldo_final = 0.0
    
    # 1. Busca resumo e período
    joined_header = " ".join(full_lines[:35])
    period_match = re.search(r"(\d{2}\s+(?:DE\s+)?[A-Z]{3,9}\s+(?:DE\s+)?\d{4})\s*(?:a|-|e|à|até)?\s*(\d{2}\s+(?:DE\s+)?[A-Z]{3,9}\s+(?:DE\s+)?\d{4})", joined_header, re.IGNORECASE)
    if period_match:
        period_str = f"{period_match.group(1)} a {period_match.group(2)}"
    elif re.search(r"\d{2}/\d{2}/\d{4}\s+a\s+\d{2}/\d{2}/\d{4}", joined_header):
        m = re.search(r"(\d{2}/\d{2}/\d{4}\s+a\s+\d{2}/\d{2}/\d{4})", joined_header)
        if m:
            period_str = m.group(1)
            
    amount_regex = re.compile(r"^([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})$")
    
    # Seção de resumo Nubank costuma ter as 5 labels seguidas dos 5 valores
    for i, line in enumerate(full_lines[:50]):
        if line.lower() == "saldo inicial":
            # Procura os próximos 5 valores monetários a partir daqui
            amounts_found = []
            for candidate in full_lines[i:]:
                if amount_regex.match(candidate):
                    amounts_found.append(parse_brl_amount(candidate))
                if len(amounts_found) == 5:
                    break
            if len(amounts_found) >= 5:
                saldo_inicial = amounts_found[0]
                rendimento_liquido = amounts_found[1]
                total_entradas = amounts_found[2]
                total_saidas = -abs(amounts_found[3]) if amounts_found[3] != 0 else 0.0
                saldo_final = amounts_found[4]
            break
            
    # Fallback se não pegou no bloco principal de 5
    if saldo_inicial == 0 and total_entradas == 0 and total_saidas == 0:
        for i, line in enumerate(full_lines[:50]):
            if line.lower() == "saldo inicial" and i + 1 < len(full_lines) and amount_regex.match(full_lines[i+1]):
                saldo_inicial = parse_brl_amount(full_lines[i + 1])
            elif line.lower() == "total de entradas" and i + 1 < len(full_lines) and amount_regex.match(full_lines[i+1]):
                total_entradas = parse_brl_amount(full_lines[i + 1])
            elif line.lower() == "total de saídas" and i + 1 < len(full_lines) and amount_regex.match(full_lines[i+1]):
                total_saidas = -abs(parse_brl_amount(full_lines[i + 1]))
            elif line.lower() in ["saldo final do período", "saldo final"] and i + 1 < len(full_lines) and amount_regex.match(full_lines[i+1]):
                saldo_final = parse_brl_amount(full_lines[i + 1])
            
    # 2. Extração detalhada de Movimentações (Nubank e similares)
    transactions = []
    current_date = ""
    
    # Expressão regular para identificar datas de movimentação: ex "04 SET 2025" ou "04/09/2025"
    date_regex = re.compile(r"^(\d{2}\s+[A-Z]{3}\s+\d{4}|\d{2}/\d{2}/\d{4})$", re.IGNORECASE)
    # Expressão regular para valores no formato brasileiro: ex "18,35", "2.324,00", "- 18,35", "+ 150,00"
    amount_regex = re.compile(r"^([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})$")
    
    known_action_headers = [
        "transferência enviada pelo pix",
        "transferência recebida pelo pix",
        "transferência recebida",
        "transferência enviada",
        "compra no débito",
        "pagamento de fatura",
        "resgate de empréstimo",
        "valor adicionado na conta por cartão",
        "compra no crédito",
        "pagamento recebido"
    ]
    
    i = 0
    while i < len(full_lines):
        line = full_lines[i]
        
        # Checa se é uma linha de data (ou se começa com data e está na seção de movimentações)
        if date_regex.match(line):
            current_date = line
            i += 1
            continue
            
        # Pula cabeçalhos repetidos dentro da seção de movimentações
        if line.lower() in ["total de saídas", "total de entradas"]:
            # Se a próxima linha for o subtotal do dia (ex: "- 18,35" ou "+ 150,00"), pulamos ela também
            if i + 1 < len(full_lines) and amount_regex.match(full_lines[i + 1]):
                i += 2
                continue
            i += 1
            continue
            
        # Verifica se a linha atual corresponde ao início de uma movimentação (tipo/ação)
        matched_action = None
        for header in known_action_headers:
            if line.lower().startswith(header):
                matched_action = line
                break
                
        if matched_action:
            # Temos uma transação! Coletamos a descrição até encontrar a linha de valor monetário
            j = i + 1
            desc_parts = []
            amount_val = None
            while j < min(i + 15, len(full_lines)):
                candidate = full_lines[j]
                if amount_regex.match(candidate):
                    amount_val = parse_brl_amount(candidate)
                    break
                # Se encontrarmos outra data ou outra ação conhecida, paramos
                if date_regex.match(candidate) or any(candidate.lower().startswith(h) for h in known_action_headers):
                    break
                desc_parts.append(candidate)
                j += 1
                
            if amount_val is not None:
                description = " - ".join([p.strip() for p in desc_parts if p.strip()])
                if not description:
                    description = matched_action
                
                # Classificação do tipo de movimentação
                tx_type = "outros"
                raw_lower = matched_action.lower()
                if "débito" in raw_lower:
                    tx_type = "debito"
                elif "pagamento de fatura" in raw_lower:
                    tx_type = "credito_pago"
                elif "transferência enviada" in raw_lower:
                    tx_type = "pix_out"
                elif "transferência recebida" in raw_lower or "transferência recebida" in raw_lower:
                    tx_type = "pix_in"
                elif "resgate" in raw_lower or "valor adicionado" in raw_lower:
                    tx_type = "investimento"
                elif "crédito" in raw_lower:
                    tx_type = "credito_compra"
                    
                clean_desc, category = sanitize_and_categorize(description, matched_action)
                
                # Para saídas, garantimos que o sinal de análise está alinhado com a ação
                if tx_type in ["debito", "credito_pago", "pix_out"] and amount_val > 0:
                    signed_val = -amount_val
                else:
                    signed_val = amount_val
                    
                transactions.append({
                    "id": len(transactions) + 1,
                    "date": current_date,
                    "description": clean_desc,
                    "value": abs(amount_val),
                    "type": tx_type,
                    "category": category,
                    "raw_type": matched_action,
                    "signed_value": signed_val
                })
                i = j + 1
                continue
                
        i += 1
        
    # Calcula somatórios por tipo a partir dos itens extraídos
    total_debito = sum(t["value"] for t in transactions if t["type"] == "debito")
    total_credito_pago = sum(t["value"] for t in transactions if t["type"] == "credito_pago")
    total_pix_enviado = sum(t["value"] for t in transactions if t["type"] == "pix_out")
    total_pix_recebido = sum(t["value"] for t in transactions if t["type"] == "pix_in")
    
    return {
        "period": period_str,
        "summary": {
            "saldo_inicial": saldo_inicial,
            "rendimento_liquido": rendimento_liquido,
            "total_entradas": total_entradas,
            "total_saidas": total_saidas,
            "saldo_final": saldo_final
        },
        "breakdown": {
            "total_debito": total_debito,
            "total_credito_pago": total_credito_pago,
            "total_pix_enviado": total_pix_enviado,
            "total_pix_recebido": total_pix_recebido
        },
        "transactions": transactions
    }

def parse_excel_or_csv_statement(file_path: str) -> dict:
    try:
        import pandas as pd
    except ImportError:
        raise ValueError("Pandas não instalado para ler planilhas.")
        
    df = pd.read_excel(file_path) if file_path.endswith((".xlsx", ".xls")) else pd.read_csv(file_path)
    
    # Identifica colunas prováveis
    col_date = next((c for c in df.columns if any(w in str(c).lower() for w in ["data", "date", "dia"])), df.columns[0])
    col_desc = next((c for c in df.columns if any(w in str(c).lower() for w in ["descri", "histórico", "historico", "estabelecimento", "lançamento"])), df.columns[1] if len(df.columns) > 1 else df.columns[0])
    col_val = next((c for c in df.columns if any(w in str(c).lower() for w in ["valor", "montante", "quantia", "amount", "saída", "entrada"])), df.columns[-1])
    
    transactions = []
    total_entradas = 0.0
    total_saidas = 0.0
    total_debito = 0.0
    
    for idx, row in df.iterrows():
        val_raw = row[col_val]
        if pd.isna(val_raw):
            continue
        val = float(val_raw) if isinstance(val_raw, (int, float)) else parse_brl_amount(str(val_raw))
        if val == 0:
            continue
            
        desc = str(row[col_desc]).strip() if not pd.isna(row[col_desc]) else "Transação"
        dt = str(row[col_date]).strip() if not pd.isna(row[col_date]) else ""
        
        tx_type = "debito" if val < 0 else "pix_in"
        clean_desc, category = sanitize_and_categorize(desc, tx_type)
        
        if val < 0:
            total_saidas += val
            total_debito += abs(val)
        else:
            total_entradas += val
            
        transactions.append({
            "id": len(transactions) + 1,
            "date": dt,
            "description": clean_desc,
            "value": abs(val),
            "type": tx_type,
            "category": category,
            "raw_type": "Planilha",
            "signed_value": val
        })
        
    return {
        "period": "Período da Planilha",
        "summary": {
            "saldo_inicial": 0.0,
            "rendimento_liquido": 0.0,
            "total_entradas": total_entradas,
            "total_saidas": total_saidas,
            "saldo_final": total_entradas + total_saidas
        },
        "breakdown": {
            "total_debito": total_debito,
            "total_credito_pago": 0.0,
            "total_pix_enviado": total_saidas if total_saidas < 0 else 0.0,
            "total_pix_recebido": total_entradas
        },
        "transactions": transactions
    }

def parse_word_statement(file_path: str) -> dict:
    # Leitura básica de DOCX parágrafos se disponível
    try:
        import docx
        doc = docx.Document(file_path)
        text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])
        # Processa as linhas como texto simples
        return parse_pdf_statement(file_path) # Fallback / reuse regex
    except Exception:
        raise ValueError("Suporte a Word .docx indisponível ou arquivo inválido.")
