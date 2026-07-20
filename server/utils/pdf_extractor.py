import fitz  # PyMuPDF
import re
import requests
import json
import logging
import os
from tempfile import NamedTemporaryFile

def extract_kpis_from_pdf(pdf_path_or_url: str, is_fii: bool = True) -> dict:
    """
    Downloads and extracts text from RI report PDFs, filters pages by keywords,
    isolates numeric tabular rows, and uses Llama 3.2 via Ollama to output structured JSON KPIs.
    """
    temp_path = None
    doc = None
    try:
        # 1. Se for uma URL, baixa o arquivo em um arquivo temporário local
        if pdf_path_or_url.startswith("http"):
            from urllib.parse import urlparse
            parsed_url = urlparse(pdf_path_or_url)
            hostname = parsed_url.hostname or ""
            
            allowed_domains = [
                ".fnet.otc.br",
                ".b3.com.br",
                ".cvm.gov.br",
                "fnet.otc.br",
                "b3.com.br",
                "cvm.gov.br",
                "dados.cvm.gov.br",
                "conteudo.cvm.gov.br"
            ]
            
            is_allowed = any(hostname == domain or hostname.endswith(domain) for domain in allowed_domains)
            if not is_allowed:
                raise Exception(f"Domínio não autorizado para download de PDF: {hostname}")

            logging.info(f"📥 Baixando PDF de RI para análise: {pdf_path_or_url}...")
            r = requests.get(pdf_path_or_url, timeout=45)
            if r.status_code != 200:
                raise Exception(f"Falha ao baixar PDF. Status: {r.status_code}")
            
            with NamedTemporaryFile(delete=False, suffix=".pdf") as f:
                f.write(r.content)
                temp_path = f.name
            target_path = temp_path
        else:
            target_path = pdf_path_or_url
            
        if not os.path.exists(target_path):
            raise Exception("Caminho do PDF não encontrado localmente.")
            
        # 2. Abre o PDF e busca páginas com palavras-chave relevantes
        doc = fitz.open(target_path)
        keywords = ["dre", "resultado", "distribuição", "rendimento", "receita", "lucro", "ebitda", "vacância", "patrimônio", "aluguel", "rating", "duration", "cdi", "ipca", "indexador", "prazo médio"] if is_fii else ["receita líquida", "ebitda", "lucro líquido", "dívida", "margem", "capex", "dre", "balanço"]
        
        target_pages = []
        for i, page in enumerate(doc):
            text_lower = page.get_text().lower()
            # Se a página contiver pelo menos 2 palavras-chave, ou for uma das primeiras 3 páginas (geralmente trazem o sumário/destaques)
            if i < 3 or sum(1 for kw in keywords if kw in text_lower) >= 2:
                target_pages.append((i, page.get_text()))
            if len(target_pages) >= 8:  # Limita a 8 páginas para economizar contexto
                break
                
        # 3. Consolida o texto e aplica Regex básicas para limpar espaçamentos múltiplos
        extracted_text_lines = []
        for idx, text in target_pages:
            # Substitui múltiplos espaços por um único espaço
            clean_text = re.sub(r'\s+', ' ', text)
            # Isola sequências numéricas que parecem dados tabulares (ex: R$ 123.456,78 ou 12,5%)
            extracted_text_lines.append(clean_text)
            
        consolidated_text = "\n".join(extracted_text_lines)[:6000] # Limite físico
        
        # 4. Injeta no prompt para o Llama 3.2:3b extrair como JSON rígido
        schema_info = (
            "Para FIIs, responda APENAS com este JSON:\n"
            "{\n"
            "  \"rendimento_distribuido\": 0.0, # valor em R$ ou percentual\n"
            "  \"valor_patrimonial\": 0.0, # valor da cota patrimonial em R$\n"
            "  \"vacancia_fisica_pct\": 0.0, # percentual de vacância física (0 a 100)\n"
            "  \"vacancia_financeira_pct\": 0.0, # percentual de vacância financeira\n"
            "  \"credit_rating\": \"\", # Rating de crédito médio (ex: AAA, AA, BBB). Vazio se não houver\n"
            "  \"duration_years\": 0.0, # Prazo médio / Duration da carteira em anos\n"
            "  \"indexer_cdi_pct\": 0.0, # % da carteira atrelada ao CDI\n"
            "  \"indexer_ipca_pct\": 0.0, # % da carteira atrelada ao IPCA\n"
            "  \"observacao_geral\": \"Breve comentário sobre os destaques\"\n"
            "}"
            if is_fii else
            "Para Ações, responda APENAS com este JSON:\n"
            "{\n"
            "  \"receita_liquida\": 0.0, # receita líquida do trimestre em R$\n"
            "  \"ebitda\": 0.0, # EBITDA em R$\n"
            "  \"lucro_liquido\": 0.0, # lucro líquido em R$\n"
            "  \"divida_liquida\": 0.0, # dívida líquida em R$\n"
            "  \"observacao_geral\": \"Breve comentário sobre os destaques\"\n"
            "}"
        )
        
        prompt = (
            f"Você é uma IA analista de Relações com Investidores (RI).\n"
            f"Analise o seguinte extrato de texto bruto do relatório trimestral e extraia os principais KPIs financeiros recentes.\n\n"
            f"{schema_info}\n\n"
            f"TEXTO DO RELATÓRIO:\n"
            f"\"\"\"\n{consolidated_text}\n\"\"\"\n\n"
            f"IMPORTANTE: Se algum indicador não for encontrado no texto, preencha com null ou 0.0. "
            f"Retorne APENAS o JSON válido sem explicações, introduções ou Markdown."
        )
        
        # Faz requisição local ao Gemini
        from infrastructure.gemini_service import MODEL_NAME
        import google.generativeai as genai
        
        try:
            model = genai.GenerativeModel(
                model_name=MODEL_NAME,
                system_instruction="Você é um parser JSON estrito de relatórios financeiros de RI. Não responda com texto livre, apenas com o JSON bruto.",
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json"
                )
            )
            response = model.generate_content(prompt)
            content = response.text.strip()
            parsed = json.loads(content)
            return {"status": "Sucesso", "kpis": parsed}
        except Exception as e:
            raise Exception(f"Gemini falhou: {e}")
            
    except Exception as e:
        logging.error(f"❌ Erro ao extrair KPIs do PDF: {e}", exc_info=True)
        return {"status": "Erro", "msg": str(e)}
    finally:
        if doc:
            doc.close()
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
