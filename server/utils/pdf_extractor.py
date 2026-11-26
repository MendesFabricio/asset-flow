import fitz  # PyMuPDF
import base64
import io
import zipfile
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
            from utils.url_validator import is_safe_url

            if not is_safe_url(pdf_path_or_url):
                raise Exception(f"URL não autorizada para download de PDF: {pdf_path_or_url}")

            logging.info(f"📥 Baixando PDF de RI para análise: {pdf_path_or_url}...")
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Accept": "application/pdf,application/octet-stream,*/*;q=0.8",
            }
            r = requests.get(pdf_path_or_url, headers=headers, timeout=45)
            if r.status_code != 200:
                raise Exception(f"Falha ao baixar PDF. Status: {r.status_code}")

            raw_bytes = r.content or b""
            if raw_bytes.startswith(b"PK"):
                with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                    pdf_name = next((n for n in zf.namelist() if n.lower().endswith(".pdf")), None)
                    if not pdf_name:
                        raise Exception("O arquivo ZIP da CVM não contém nenhum PDF interno.")
                    raw_bytes = zf.read(pdf_name)

            if not raw_bytes.lstrip().startswith(b"%PDF"):
                decoded = None
                try:
                    candidate = base64.b64decode(raw_bytes.strip(), validate=True)
                    if candidate.lstrip().startswith(b"%PDF"):
                        decoded = candidate
                except Exception:
                    decoded = None
                if decoded is not None:
                    raw_bytes = decoded
                else:
                    raise Exception(
                        "O documento de RI disponível para este ativo não é um PDF válido (pode ser HTML/ZIP ou indisponível no momento)."
                    )

            with NamedTemporaryFile(delete=False, suffix=".pdf") as f:
                f.write(raw_bytes)
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
                
        # 3. Consolida o texto preservando quebras de linha (tabelas financeiras)
        extracted_text_lines = []
        for _idx, text in target_pages:
            clean_text = "\n".join(re.sub(r'[ \t]+', ' ', ln).strip() for ln in text.splitlines() if ln.strip())
            extracted_text_lines.append(clean_text)

        consolidated_text = "\n\n".join(extracted_text_lines)[:8000]

        # 4. Schema JSON limpo (sem comentários # que quebram parsers locais)
        schema_info = (
            "Para FIIs, responda APENAS com este JSON:\n"
            "{\n"
            '  "rendimento_distribuido": null,\n'
            '  "valor_patrimonial": null,\n'
            '  "vacancia_fisica_pct": null,\n'
            '  "vacancia_financeira_pct": null,\n'
            '  "credit_rating": null,\n'
            '  "duration_years": null,\n'
            '  "indexer_cdi_pct": null,\n'
            '  "indexer_ipca_pct": null,\n'
            '  "observacao_geral": "Breve comentário sobre os destaques"\n'
            "}\n"
            "Campos FII: vacância/indexadores em % (0 a 100), duration_years > 0, valores monetários em R$."
            if is_fii else
            "Para Ações, responda APENAS com este JSON:\n"
            "{\n"
            '  "receita_liquida": null,\n'
            '  "ebitda": null,\n'
            '  "lucro_liquido": null,\n'
            '  "divida_liquida": null,\n'
            '  "observacao_geral": "Breve comentário sobre os destaques"\n'
            "}"
        )
        
        prompt = (
            f"Você é uma IA analista de Relações com Investidores (RI).\n"
            f"Analise o seguinte extrato de texto bruto do relatório trimestral e extraia os principais KPIs financeiros recentes.\n\n"
            f"{schema_info}\n\n"
            f"TEXTO DO RELATÓRIO:\n"
            f"\"\"\"\n{consolidated_text}\n\"\"\"\n\n"
            f"IMPORTANTE: Se algum indicador não for encontrado explicitamente no texto, preencha com null (NUNCA invente ou coloque 0.0). "
            f"Retorne APENAS o JSON válido sem explicações, introduções ou Markdown."
        )
        
        from infrastructure.gemini_service import generate_ai_text

        try:
            content, _provider = generate_ai_text(
                prompt=prompt,
                json_mode=True,
                temperature=0.1,
            )
            parsed = json.loads(content)
            return {"status": "Sucesso", "kpis": parsed}
        except Exception as e:
            raise Exception(f"IA falhou: {e}")
            
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
