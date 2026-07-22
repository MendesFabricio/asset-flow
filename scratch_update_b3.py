import re

with open('server/utils/b3_parser.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_types = '''
        # Tipos que consideramos Operações/Reconciliação
        transaction_types = ['Transferência - Liquidação', 'Resgate']
        
        # Tipos de eventos corporativos (Sugestões)
        corporate_event_types = ['Leilão de Fração', 'Fração em Ativos', 'Bonificação em Ativos', 'Desdobramento', 'Grupamento', 'Cisão', 'Direito de Subscrição', 'Atualização']

        # Regex agrupa qualquer um desses tipos
        op_pattern = r"(Rendimento|Dividendo|Juros Sobre Capital Próprio|Transferência - Liquidação|Leilão de Fração|Resgate|Fração em Ativos|Bonificação em Ativos|Desdobramento|Grupamento|Cisão|Direito de Subscrição|Atualização)\s+([A-Z0-9]{4,6})\s+-\s+(.*?)\s+(\d+(?:,\d+)?)\s+R\$\s*([\d,.-]+)\s+R\$\s*([\d,.-]+)"

        dividends = []
        transactions = []
        corporate_events = []
'''
content = re.sub(
    r'        # Tipos que consideramos Operações/Reconciliação.*?transactions = \[\]\n',
    new_types, content, flags=re.DOTALL
)

new_append = '''                if op_name in dividend_types:
                    dividends.append({
                        "ticker": ticker,
                        "type": op_name,
                        "date": current_date,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "description": formatted_desc
                    })
                elif op_name in transaction_types:
                    transactions.append({
                        "ticker": ticker,
                        "type": op_name,
                        "date": current_date,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "description": formatted_desc
                    })
                elif op_name in corporate_event_types:
                    corporate_events.append({
                        "ticker": ticker,
                        "type": op_name,
                        "date": current_date,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "total_value": total_value,
                        "description": formatted_desc
                    })'''
content = re.sub(
    r'                if op_name in dividend_types:.*?\"description\": formatted_desc\n                    \}\)',
    new_append, content, flags=re.DOTALL
)

new_ret = '''        logging.warning(f"[B3] Parsed {len(dividends)} proventos, {len(transactions)} transactions and {len(corporate_events)} corporate events.")

        return {
            "status": "Sucesso",
            "dividends": dividends,
            "transactions": transactions,
            "corporate_events_suggestions": corporate_events
        }'''
content = re.sub(
    r'        logging.warning\(f"\[B3\] Parsed \{len\(dividends\)\} proventos and \{len\(transactions\)\} transactions."\)\n\n        return \{\n            "status": "Sucesso",\n            "dividends": dividends,\n            "transactions": transactions\n        \}',
    new_ret, content, flags=re.DOTALL
)

with open('server/utils/b3_parser.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
