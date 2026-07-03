# server/crawlers/b3_fnet.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
from datetime import datetime
import threading
import logging

class B3FnetCrawler:
    URL_API = "https://fnet.bmfbovespa.com.br/fnet/publico/pesquisarGerenciadorDocumentosDados"
    
    # ⚡ COMPARTILHAMENTO DE CONEXÃO: Instâncias de controle para reuso de sockets HTTP
    _session = None
    _lock = threading.Lock()

    @classmethod
    def _get_session(cls):
        """Inicializa e retorna uma sessão HTTP persistente com Pool expandido de Sockets"""
        with cls._lock:
            if cls._session is None:
                cls._session = requests.Session()
                
                # 🛡️ RESILIÊNCIA DE REDE: Política de retentativas automáticas com Backoff Exponencial
                # Se o servidor da B3 retornar lag, o robô aguarda 1s, depois 2s, depois 4s antes de desistir.
                retry_strategy = Retry(
                    total=3,
                    backoff_factor=1,
                    status_forcelist=[429, 500, 502, 503, 504],
                    raise_on_status=False
                )
                
                # Configura o adaptador com capacidade para gerenciar conexões concorrentes em threads paralelas
                adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
                cls._session.mount("https://", adapter)
                cls._session.mount("http://", adapter)
                
        return cls._session

    @staticmethod
    def _parse_date(date_str):
        if not date_str: return datetime.min
        for fmt in ('%d/%m/%Y %H:%M', '%d/%m/%Y'):
            try: 
                return datetime.strptime(date_str, fmt)
            except ValueError: 
                continue
        return datetime.min

    @classmethod
    def get_documents_package(cls, cnpj):
        """Busca documentos (Gerencial/Mensal) no FNET usando CNPJ de forma otimizada"""
        if not cnpj: return None
        clean_cnpj = "".join(filter(str.isdigit, str(cnpj)))
        
        # 🎭 DISFARCE DE PEGADA DIGITAL: Cabeçalhos completos simulando uma navegação legítima de desktop
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "X-Requested-With": "XMLHttpRequest",
            "Connection": "keep-alive"
        }
        
        package = {}
        # Categorias FNET: 7=Gerencial, 6=Mensal, 1=Fato Relevante
        categorias = {"gerencial": 7, "mensal": 6, "fato_relevante": 1}
        
        # Coleta a sessão controlada pelo Pool
        session = cls._get_session()

        for key, cat_id in categorias.items():
            params = {
                "d": 1, "s": 0, "l": 200, "tipoFundo": 1, "situacao": "A",
                "cnpjFundo": clean_cnpj, "idCategoriaDocumento": cat_id,
                "order[0][column]": 5, "order[0][dir]": "desc"
            }
            try:
                # ⚡ PERFORMANCE: Requisição utiliza a mesma conexão TCP persistente em Keep-Alive
                r = session.get(cls.URL_API, params=params, headers=headers, timeout=15)
                
                if r.status_code == 200:
                    data_list = r.json().get('data', [])
                    if data_list:
                        # Se for a categoria 'mensal', filtra para pegar apenas "Informe Mensal Estruturado"
                        if key == "mensal":
                            filtered = [d for d in data_list if "mensal" in (d.get('tipoDocumento') or d.get('categoriaDocumento') or '').lower()]
                            if filtered:
                                data_list = filtered

                        # Pega o documento mais recente baseado no ID e Data de Entrega
                        sorted_list = sorted(
                            data_list, 
                            key=lambda x: (int(x.get('id', 0) or 0), cls._parse_date(x.get('dataEntrega'))), 
                            reverse=True
                        )
                        doc = sorted_list[0]
                        package[key] = {
                            "link": f"https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id={doc.get('id')}",
                            "date": str(doc.get('dataEntrega') or ""),    
                            "ref_date": str(doc.get('dataReferencia') or ""), 
                            "type": str(doc.get('tipoDocumento') or doc.get('categoriaDocumento') or "")  
                        }
                else:
                    logging.warning(f"⚠️ Resposta inesperada do barramento FNET para o CNPJ {clean_cnpj} [{key}]: HTTP {r.status_code}")
            except Exception as e:
                # 🔍 RASTREABILIDADE: Troca do print cru por logging estruturado com traceback completo
                logging.error(f"❌ Erro operacional na varredura do FNET para o CNPJ {clean_cnpj} ({key}): {e}", exc_info=True)
                
        return package if package else None
