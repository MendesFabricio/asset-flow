import re
import logging

class CNPJFinder:
    @staticmethod
    def find_by_ticker(ticker):
        ticker = ticker.replace(".SA", "").strip().lower()
        # O StatusInvest separa ativos por essas categorias na URL
        categorias = ["acoes", "fundos-imobiliarios", "fiagros", "fiinfras"]
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        
        for cat in categorias:
            url = f"https://statusinvest.com.br/{cat}/{ticker}"
            try:
                from utils.http_client import get_secure_session
                session = get_secure_session()
                response = session.get(url, timeout=10)
                if response.status_code == 200:
                    # Regex para pegar o CNPJ formatado 00.000.000/0000-00
                    match = re.search(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", response.text)
                    if match:
                        cnpj_limpo = re.sub(r"\D", "", match.group(0))
                        logging.info(f"✅ CNPJ {cnpj_limpo} encontrado para {ticker.upper()} em /{cat}/")
                        return cnpj_limpo
            except:
                continue
        logging.warning(f"❌ Não foi possível encontrar CNPJ para {ticker.upper()} em nenhuma categoria.")
        return None
