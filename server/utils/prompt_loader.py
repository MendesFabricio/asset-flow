import os
import logging

_PROMPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'prompts'))

def load_prompt(filename: str) -> str:
    """
    Carrega o conteúdo de um arquivo de prompt versionado na pasta server/prompts/.
    """
    filepath = os.path.join(_PROMPTS_DIR, filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logging.error(f"❌ Erro ao carregar prompt '{filename}' de {filepath}: {e}")
        return ""
