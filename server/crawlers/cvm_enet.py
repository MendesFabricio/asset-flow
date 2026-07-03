# server/crawlers/cvm_enet.py
import requests
from requests.adapters import HTTPAdapter
# server/crawlers/cvm_enet.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry
import json
import logging
import threading
from datetime import datetime

class CVMEnetCrawler:
    URL_LISTA = "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx/ListarDocumentos"
    
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
            "Referer": f"https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx?CodigoCVM={cvm_code}",
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
                "dataDe": data_inicio,
                "dataAte": data_fim,
                "empresa": str(cvm_code),
                "setorAtividade": "-1",
                "categoriaEmissor": "-1",
                "situacaoEmissor": "-1",
                "tipoParticipante": "-1",
                "dataReferencia": "",
                "categoria": cat_id,
                "periodo": "2",
                "horaIni": "",
                "horaFim": "",
                "palavraChave": "",
                "ultimaDtRef": "false",
                "tipoEmpresa": "0",
                "token": "",
                "versaoCaptcha": ""
            }

            try:
                # ⚡ PERFORMANCE: Reaproveita handshakes TLS e conexões TCP do pool persistente em lote
                r = session.post(cls.URL_LISTA, json=payload, headers=headers, timeout=15)
                
                if r.status_code == 200:
                    response_data = r.json()
                    d_val = response_data.get('d')
                    if isinstance(d_val, str):
                        try:
                            d_data = json.loads(d_val)
                        except Exception:
                            d_data = {}
                    elif isinstance(d_val, dict):
                        d_data = d_val
                    else:
                        d_data = {}

                    dados_str = d_data.get('dados') or d_data.get('data') or ''
                    if isinstance(dados_str, str) and dados_str:
                        rows = dados_str.split('$&$&&*')
                        valid_rows = []
                        for row in rows:
                            fields = row.split('$&')
                            if len(fields) >= 11:
                                import re
                                match = re.search(r"OpenDownloadDocumentos\('(\d+)','(\d+)','([^']+)','([^']+)'\)", fields[10])
                                if match:
                                    numSeq, numVer, numProt, descT = match.groups()
                                    link = (
                                        f"https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?"
                                        f"Tela=ext&numSequencia={numSeq}&numVersao={numVer}&"
                                        f"numProtocolo={numProt}&descTipo={descT}&CodigoInstituicao=1"
                                    )
                                    
                                    d_ent = re.search(r"(\d{2}/\d{2}/\d{4})", fields[6])
                                    data_entrega = d_ent.group(1) if d_ent else "Recente"
                                    
                                    d_ref = re.search(r"(\d{2}/\d{2}/\d{4})", fields[5])
                                    data_ref = d_ref.group(1) if d_ref else "ITR/DFP"
                                    
                                    try:
                                        proto_num = int(numSeq)
                                    except Exception:
                                        proto_num = 0
                                        
                                    valid_rows.append({
                                        "proto_num": proto_num,
                                        "link": link,
                                        "date": data_entrega,
                                        "ref_date": data_ref,
                                        "type": fields[2]
                                    })
                        if valid_rows:
                            newest = sorted(valid_rows, key=lambda x: x["proto_num"], reverse=True)[0]
                            package[key] = {
                                "link": newest["link"],
                                "date": newest["date"],
                                "ref_date": newest["ref_date"],
                                "type": newest["type"]
                            }
                else:
                    logging.warning(f"⚠️ Resposta inesperada do ENET CVM para o código {cvm_code} [{key}]: HTTP {r.status_code}")
            except Exception as e:
                # RASTREABILIDADE: Logging estruturado com injeção de traceback para auditoria fina
                logging.error(f"❌ Erro operacional na varredura do ENET CVM para o código {cvm_code} ({key}): {e}", exc_info=True)

        return package if package else None
