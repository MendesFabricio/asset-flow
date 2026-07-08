import pandas as pd
import io
import logging

class CVMFinder:
    @staticmethod
    def find_code(cnpj_limpo):
        if not cnpj_limpo or len(cnpj_limpo) != 14:
            return None

        url_csv = "https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv"
        try:
            from utils.http_client import get_secure_session
            session = get_secure_session()
            response = session.get(url_csv, timeout=20)
            if response.status_code == 200:
                # O CSV da CVM é Latin-1 e separado por ';'
                df = pd.read_csv(io.StringIO(response.text), sep=';', encoding='latin1')
                
                # Limpeza do CNPJ (remove pontos, traços e barras)
                df['CNPJ_CIA'] = df['CNPJ_CIA'].str.replace(r'\D', '', regex=True)
                
                # 1. Filtra pelo CNPJ desejado
                resultado = df[df['CNPJ_CIA'] == cnpj_limpo]
                
                if resultado.empty:
                    return None

                # 2. Tenta encontrar o registro onde a coluna 'SIT' é 'ATIVO'
                ativo = resultado[resultado['SIT'] == 'ATIVO']
                
                if not ativo.empty:
                    # Se achar ativo, retorna ele imediatamente
                    return str(ativo.iloc[0]['CD_CVM']).zfill(6)
                
                # 3. Se não tiver nenhum 'ATIVO' (ex: empresa fechada), 
                # ordena pela Data de Registro (DT_REG) para pegar o mais recente.
                if 'DT_REG' in resultado.columns:
                    resultado['DT_REG'] = pd.to_datetime(resultado['DT_REG'], format='%d/%m/%Y', errors='coerce')
                    mais_recente = resultado.sort_values('DT_REG', ascending=False).iloc[0]
                    return str(mais_recente['CD_CVM']).zfill(6)
                
                # Fallback final: pega o primeiro da lista
                return str(resultado.iloc[0]['CD_CVM']).zfill(6)

        except Exception as e:
            logging.error(f"⚠️ Erro ao buscar código CVM: {e}")
        
        return None
