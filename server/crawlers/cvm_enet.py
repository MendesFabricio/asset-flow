import requests
import json
import logging
from datetime import datetime

class CVMEnetCrawler:
    # ⚡ Mantido o endpoint correto de consulta da RAD CVM
    URL_LISTA = "https://www.rad.cvm.gov.br/ENET/FrmGerenciarDocumentos.aspx/ListarDocumentos"

    @staticmethod
    def get_documents(cvm_code):
        if not cvm_code: return None
        
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://www.rad.cvm.gov.br",
            "Referer": f"https://www.rad.cvm.gov.br/ENET/Consulta/FrmGerenciarDocumentos.aspx?CodigoCVM={cvm_code}"
        }

        filtros = {
            "balanco": "EST_3,EST_4",
            "fatos": "IPE_4"
        }
        
        package = {}

        # ⚡ CALIBRAÇÃO DINÂMICA: Define uma janela móvel retroativa de 2 anos a partir do ano atual
        # Evita que o código fique obsoleto ou traga lixo histórico excessivo
        ano_inicio = datetime.now().year - 2
        data_inicio = f"01/01/{ano_inicio}"
        data_fim = datetime.now().strftime("%d/%m/%Y")

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
                # ⚡ CORREÇÃO DO CRÍTICO: Alterado de URL_API (inexistente) para URL_LISTA
                r = requests.post(CVMEnetCrawler.URL_LISTA, json=payload, headers=headers, timeout=15)
                
                if r.status_code == 200:
                    response_json = r.json()
                    d_data = json.loads(response_json.get('d', '{}'))
                    docs = d_data.get('data', [])
                    
                    if docs:
                        # Ordena para pegar o protocolo mais recente (maior número)
                        doc = sorted(docs, key=lambda x: int(x['Protocolo']), reverse=True)[0]
                        
                        link_direto = (
                            f"https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?"
                            f"Tela=ext&numSequencia={doc['Sequencia']}&numVersao={doc['Versao']}&"
                            f"numProtocolo={doc['Protocolo']}&descTipo=IPE&CodigoInstituicao=1"
                        )
                        
                        package[key] = {
                            "link": link_direto,
                            "date": doc['DataEntrega'],
                            "ref_date": "ITR/DFP" if key == "balanco" else "Fato Rel.",
                            "type": doc['DescricaoCategoria']
                        }
            except Exception as e:
                logging.warning(f"⚠️ Erro no barramento do CVM Crawler ({key}) para o código {cvm_code}: {e}")

        return package if package else None
