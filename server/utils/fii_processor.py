import requests
import xml.etree.ElementTree as ET
import logging
import zipfile
import io
from datetime import datetime

class FIIProcessor:
    @staticmethod
    def parse_informe_mensal(url):
        """
        Baixa e processa o XML do Informe Mensal Estruturado da B3.
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
            
            response = requests.get(url, headers=headers, timeout=20)
            if response.status_code != 200: return None

            content = response.content
            xml_content = None

            try:
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    file_name = z.namelist()[0]
                    xml_content = z.read(file_name)
            except zipfile.BadZipFile:
                xml_content = content
            except Exception: return None

            root = ET.fromstring(xml_content)
            
            # Nós
            resumo = root.find('.//Resumo')
            dados_gerais = root.find('.//DadosGerais')
            cotistas_node = root.find('.//Cotistas')
            info_ativo = root.find('.//InformacoesAtivo')
            info_passivo = root.find('.//InformacoesPassivo') # <--- NOVO
            
            data = {}

            # 1. Dados Patrimoniais e Ativo Total
            total_ativo = 0
            if resumo is not None:
                pl_elem = resumo.find('PatrimonioLiquido')
                cotas_elem = resumo.find('NumCotasEmitidas')
                ativo_elem = resumo.find('Ativo') # <--- NOVO: Ativo Total
                
                pl = float(pl_elem.text) if pl_elem is not None else 0
                cotas = float(cotas_elem.text) if cotas_elem is not None else 0
                total_ativo = float(ativo_elem.text) if ativo_elem is not None else 0
                
                vpa = pl / cotas if cotas > 0 else 0
                
                data['patrimonio_liquido'] = pl
                data['ativo_total'] = total_ativo
                data['numero_cotas'] = cotas
                data['vpa'] = round(vpa, 2)
                
                rent_node = resumo.find('RentEfetivaMensal')
                if rent_node is not None:
                    dy_mes = rent_node.find('DividendYieldMes')
                    if dy_mes is not None and dy_mes.text:
                        data['dy_mensal_xml'] = float(dy_mes.text) * 100 

            # 2. Dívida e Alavancagem (Passivo)
            total_passivo = 0
            if info_passivo is not None:
                passivo_elem = info_passivo.find('TotalPassivo')
                if passivo_elem is not None and passivo_elem.text:
                    total_passivo = float(passivo_elem.text)
            
            data['total_passivo'] = total_passivo
            
            # Cálculo de Alavancagem (Passivo / Ativo)
            alavancagem = (total_passivo / total_ativo * 100) if total_ativo > 0 else 0
            data['alavancagem'] = round(alavancagem, 2)

            # 3. Cotistas
            if cotistas_node is not None:
                data['numero_cotistas'] = int(cotistas_node.get('total', 0))

            # 4. Caixa
            if info_ativo is not None:
                necessidades = info_ativo.find('TotalNecessidadesLiq')
                disponibilidades = 0
                if necessidades is not None:
                    disp_node = necessidades.find('Disponibilidades')
                    tit_pub = necessidades.find('TitulosPublicos')
                    fundos_rf = necessidades.find('FundosRendaFixa')
                    
                    val_disp = float(disp_node.text) if disp_node is not None and disp_node.text else 0
                    val_tit = float(tit_pub.text) if tit_pub is not None and tit_pub.text else 0
                    val_rf = float(fundos_rf.text) if fundos_rf is not None and fundos_rf.text else 0
                    
                    disponibilidades = val_disp + val_tit + val_rf

                data['disponibilidades'] = disponibilidades
                cotas = data.get('numero_cotas', 0)
                data['caixa_por_cota'] = disponibilidades / cotas if cotas > 0 else 0
                
                pct_caixa = (disponibilidades / data.get('patrimonio_liquido', 1) * 100)
                data['percentual_caixa'] = round(pct_caixa, 2)

            # 5. Segmento
            if dados_gerais is not None:
                try:
                    seg = dados_gerais.find('.//SegmentoAtuacao')
                    gest = dados_gerais.find('.//TipoGestao')
                    data['segmento'] = seg.text if seg is not None else "N/D"
                    data['gestao'] = gest.text if gest is not None else "N/D"
                except:
                    data['segmento'] = "N/D"; data['gestao'] = "N/D"

            # Estrutura Final
            dashboard_data = {
                "ticker_info": {
                    "vpa": data.get('vpa'),
                    "cotistas": data.get('numero_cotistas'),
                    "patrimonio": data.get('patrimonio_liquido'),
                    "segmento": data.get('segmento', 'N/A'),
                    "gestao": data.get('gestao', 'N/A'),
                    "caixa_pct": data.get('percentual_caixa', 0),
                    "alavancagem": data.get('alavancagem', 0) # <--- NOVO
                },
                "indicadores": {
                    "P/VP": 0, 
                    "DY Mensal (XML)": f"{data.get('dy_mensal_xml', 0):.2f}%",
                    "VPA": f"R$ {data.get('vpa', 0):.2f}",
                    "Caixa": f"R$ {data.get('disponibilidades', 0):,.2f}",
                    "Dívida (Passivo)": f"R$ {data.get('total_passivo', 0):,.2f}", # <--- NOVO
                    "Alavancagem": f"{data.get('alavancagem', 0):.2f}%", # <--- NOVO
                    "Cotas": f"{data.get('numero_cotas', 0):,.0f}"
                },
                "raw_xml_data": data
            }
            
            return dashboard_data

        except Exception as e:
            print(f"Erro parser FII: {e}")
            return None

    @staticmethod
    def process_evolution(history_links):
        """
        Processa histórico com filtro de data para evitar lixo antigo (2017/2018).
        """
        evolution = []
        print(f"📊 Processando histórico FII ({len(history_links)} meses)...", flush=True)
        
        current_year = datetime.now().year

        for item in history_links:
            try:
                # --- FILTRO DE DATA ---
                # Formato esperado do crawler: DD/MM/YYYY ou YYYY-MM-DD
                date_str = str(item['date']).split(' ')[0]
                year = 0
                
                if '/' in date_str: # DD/MM/YYYY
                    year = int(date_str.split('/')[-1])
                elif '-' in date_str: # YYYY-MM-DD
                    year = int(date_str.split('-')[0])
                
                # Ignora se for muito antigo (mais de 3 anos atrás)
                if year > 0 and year < (current_year - 3):
                    continue

                # Processa
                data = FIIProcessor.parse_informe_mensal(item['link_dl'])
                
                if data and 'raw_xml_data' in data:
                    raw = data['raw_xml_data']
                    
                    label = date_str[:7]
                    if '/' in date_str:
                        parts = date_str.split('/')
                        if len(parts) == 3:
                            meses = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
                            try:
                                mes_idx = int(parts[1])
                                label = f"{meses[mes_idx]}/{parts[2][2:]}"
                            except: pass

                    evolution.append({
                        "label": label,
                        "receita": raw.get('vpa', 0),          
                        "lucro": raw.get('dy_mensal_xml', 0),  
                        "fco": raw.get('caixa_por_cota', 0),   
                    })
            except Exception as e:
                continue
        
        return evolution
