# server/crawlers/cvm_enet.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
import json
import logging
import threading
from datetime import datetime

class CVMEnetCrawler:
    URL_LISTA = "https://www.rad.cvm.gov.br/ENET/FrmGerenciarDocumentos.aspx/ListarDocumentos"
    
    # ⚡ COMPARTILHAMENTO DE CONEXÃO: Instâncias de controle para reuso seguro de sockets HTTP
    _session = None
    _lock = threading.Lock()

    @classmethod
    def _get_session(cls):
        """Inicializa e retorna uma sessão HTTP persistente com Pool expandido de Sockets"""
        with cls._lock:
            if cls._session is None:
                cls._session = requests.Session()
                
                # 🛡️ RESILIÊNCIA DE REDE: Política de retentativas automáticas com Backoff Exponencial
                # Se o servidor da CVM apresentar instabilidade, o robô aguarda e tenta novamente de forma inteligente.
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

    @classmethod
    def get_documents(cls, cvm_code):
        """Busca documentos corporativos (Demonstrativos/Fatos) na CVM de forma otimizada"""
        if not cvm_code: return None
        
        # 🎭 DISFARCE DE PEGADA DIGITAL: Cabeçalhos completos e Keep-Alive para tráfego legítimo
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://www.rad.cvm.gov.br",
            "Referer": f"https://www.rad.cvm.gov.br/ENET/Consulta/FrmGerenciarDocumentos.aspx?CodigoCVM={cvm_code}",
            "Connection": "keep-alive"
        }

        filtros = {
            "balanco": "EST_3,EST_4",
            "fatos": "IPE_4"
        }
        
        package = {}

        # CALIBRAÇÃO DINÂMICA: Mantém a janela móvel retroativa de 2 anos a partir do ano corrente
        ano_inicio = datetime.now().year - 2
        data_inicio = f"01/01/{ano_inicio}"
        data_fim = datetime.now().strftime("%d/%m/%Y")

        # Coleta a sessão controlada pelo Pool
        session = cls._get_session()

        for key, cat_id in filtros.items():
            payload = {
                "data": {
                    "idAgrupamento": 0,
                    "tipoConsultar": "C",
                    "codCVM": str(cvm_code),
                    "dataInicio": data_inicio,
                    "dataFim": data_fim,
                    "idCategoriaDocumento": cat_id,
                    "setorSetorial": "0"
                }
            }

            try:
                # ⚡ PERFORMANCE: Reaproveita handshakes TLS e conexões TCP do pool persistente em lote
                r = session.post(cls.URL_LISTA, json=payload, headers=headers, timeout=15)
                
                if r.status_code == 200:
                    response_json = r.json()
                    d_data = json.loads(response_json.get('d', '{}'))
                    docs = d_data.get('data', [])
                    
                    if docs:
                        # Ordena para pegar o protocolo mais recente de forma segura contra tipos nulos
                        doc = sorted(docs, key=lambda x: int(x.get('Protocolo', 0) or 0), reverse=True)[0]
                        
                        link_direto = (
                            f"https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?"
                            f"Tela=ext&numSequencia={doc.get('Sequencia')}&numVersao={doc.get('Versao')}&"
                            f"numProtocolo={doc.get('Protocolo')}&descTipo=IPE&CodigoInstituicao=1"
                        )
                        
                        package[key] = {
                            "link": link_direto,
                            "date": doc.get('DataEntrega'),
                            "ref_date": "ITR/DFP" if key == "balanco" else "Fato Rel.",
                            "type": doc.get('DescricaoCategoria')
                        }
                else:
                    logging.warning(f"⚠️ Resposta inesperada do ENET CVM para o código {cvm_code} [{key}]: HTTP {r.status_code}")
            except Exception as e:
                # RASTREABILIDADE: Logging estruturado com injeção de traceback para auditoria fina
                logging.error(f"❌ Erro operacional na varredura do ENET CVM para o código {cvm_code} ({key}): {e}", exc_info=True)

        return package if package else None
