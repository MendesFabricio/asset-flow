import pandas as pd
import requests
import zipfile
import os
import time
import tempfile
import logging
from datetime import datetime


def _format_brl_compact(val: float) -> str:
    abs_val = abs(val)
    sign = "-" if val < 0 else ""
    if abs_val >= 1_000_000_000:
        return f"{sign}R$ {abs_val / 1_000_000_000:,.2f} bi".replace(",", "X").replace(".", ",").replace("X", ".")
    if abs_val >= 1_000_000:
        return f"{sign}R$ {abs_val / 1_000_000:,.2f} mi".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{sign}R$ {abs_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


class CVMProcessor:
    # ⚡ ESCOPO PROTEGIDO: Mapeamento padrão de contas CVM (DRE/BPA/BPP/DFC)
    CONTAS_MAP = {
        '1': 'ativo_total', '3.01': 'receita', '3.03': 'lucro_bruto',
        '3.05': 'ebit', '3.06': 'resultado_financeiro', '3.11': 'lucro_liquido',
        '1.01.01': 'caixa', '2.03': 'patrimonio_liquido',
        '2.01.04': 'divida_cp', '2.02.01': 'divida_lp',
        '6.01': 'fco', '6.02': 'capex', '6.01.01.04': 'depreciacao'
    }

    @staticmethod
    def _ensure_cvm_zip(cache_dir: str, ano: int, ano_atual: int) -> str | None:
        zip_path = os.path.join(cache_dir, f"itr_cia_aberta_{ano}.zip")
        fallback_zip = os.path.join(tempfile.gettempdir(), "cvm_cache", f"itr_cia_aberta_{ano}.zip")
        if os.path.exists(fallback_zip) and (
            not os.path.exists(zip_path) or os.path.getmtime(fallback_zip) > os.path.getmtime(zip_path)
        ):
            zip_path = fallback_zip
        url = f"https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_{ano}.zip"

        should_download = not os.path.exists(zip_path)
        if not should_download and ano >= ano_atual - 1:
            ttl_seconds = 6 * 3600 if ano == ano_atual else 7 * 24 * 3600
            age = time.time() - os.path.getmtime(zip_path)
            if age > ttl_seconds:
                try:
                    head = requests.head(url, timeout=10, allow_redirects=True)
                    if head.status_code == 200:
                        remote_len = head.headers.get("Content-Length")
                        if remote_len and int(remote_len) != os.path.getsize(zip_path):
                            should_download = True
                        else:
                            try:
                                os.utime(zip_path, None)
                            except OSError:
                                pass
                except requests.RequestException:
                    pass

        if should_download:
            try:
                logging.info(f"📥 Baixando arquivos históricos da CVM para o ano: {ano}...")
                r = requests.get(url, timeout=60)
                if r.status_code == 200:
                    target_path = zip_path
                    if not os.access(cache_dir, os.W_OK):
                        fallback_dir = os.path.join(tempfile.gettempdir(), "cvm_cache")
                        os.makedirs(fallback_dir, exist_ok=True)
                        target_path = os.path.join(fallback_dir, f"itr_cia_aberta_{ano}.zip")
                    tmp_path = target_path + ".tmp"
                    with open(tmp_path, 'wb') as f:
                        f.write(r.content)
                    os.replace(tmp_path, target_path)
                    zip_path = target_path
                else:
                    logging.warning(f"⚠️ Dados de {ano} indisponíveis no servidor da CVM (HTTP {r.status_code})")
                    if not os.path.exists(zip_path):
                        return None
            except (requests.RequestException, OSError) as e:
                logging.error(f"❌ Falha ao atualizar demonstrativos da CVM de {ano}: {e}")
                if not os.path.exists(zip_path):
                    return None

        return zip_path if os.path.exists(zip_path) else None

    @staticmethod
    def _filter_latest_exerc(grupo: pd.DataFrame) -> pd.DataFrame:
        df_g = grupo
        if 'ORDEM_EXERC' in df_g.columns:
            ult = df_g[df_g['ORDEM_EXERC'].astype(str).str.strip().str.upper() == 'ÚLTIMO']
            if not ult.empty:
                df_g = ult
        if 'VERSAO' in df_g.columns:
            versoes = pd.to_numeric(df_g['VERSAO'], errors='coerce')
            if versoes.notna().any():
                df_g = df_g[versoes == versoes.max()]
        return df_g

    @staticmethod
    def _extract_value(rows: pd.DataFrame, prefer_shortest_period: bool = False) -> float | None:
        if rows.empty:
            return None
        colunas_valores = ['VL_CONTA', 'VL_CONT', 'VL_VALOR']
        col_achada = next((c for c in colunas_valores if c in rows.columns), None)
        if not col_achada:
            return None

        picked = rows
        if prefer_shortest_period and 'DT_INI_EXERC' in picked.columns and len(picked) > 1:
            # In 2T/3T DRE, CVM includes both YTD (YYYY-01-01) and 3M standalone; sorting DT_INI_EXERC desc picks 3M.
            picked = picked.sort_values('DT_INI_EXERC', ascending=False)

        row = picked.iloc[0]
        val = float(row[col_achada])
        if 'ESCALA_MOEDA' in picked.columns:
            escala = str(row['ESCALA_MOEDA']).strip().upper()
            if escala == 'MIL':
                val *= 1000.0
        return val

    @staticmethod
    def get_historical_summary(cvm_codes, years_back=3):
        cvm_codes = [str(c).zfill(6) for c in cvm_codes]
        ano_atual = datetime.now().year
        periodos = range(ano_atual, ano_atual - years_back, -1)

        # ⚡ CACHE ESTÁVEL: Define um caminho relativo seguro independente do WORKDIR de boot do contêiner
        base_dir = os.path.dirname(os.path.abspath(__file__))
        cache_dir = os.environ.get('CVM_CACHE_DIR', os.path.join(base_dir, '..', 'data', 'cvm_cache'))
        os.makedirs(cache_dir, exist_ok=True)

        historico_completo = []

        for ano in periodos:
            zip_path = CVMProcessor._ensure_cvm_zip(cache_dir, ano, ano_atual)
            if not zip_path:
                continue

            try:
                # ⚡ PERFORMANCE TOTAL: Aberto direto pelo path físico do disco.
                # Zero alocação inflada de bytes em RAM.
                with zipfile.ZipFile(zip_path, 'r') as z:
                    list_files = z.namelist()

                    arquivos_alvo = {
                        'DRE': (f"itr_cia_aberta_DRE_con_{ano}.csv", f"itr_cia_aberta_DRE_ind_{ano}.csv"),
                        'BPA': (f"itr_cia_aberta_BPA_con_{ano}.csv", f"itr_cia_aberta_BPA_ind_{ano}.csv"),
                        'BPP': (f"itr_cia_aberta_BPP_con_{ano}.csv", f"itr_cia_aberta_BPP_ind_{ano}.csv"),
                        'DFC': (f"itr_cia_aberta_DFC_MI_con_{ano}.csv" if f"itr_cia_aberta_DFC_MI_con_{ano}.csv" in list_files else f"itr_cia_aberta_DFC_MD_con_{ano}.csv",
                                f"itr_cia_aberta_DFC_MI_ind_{ano}.csv" if f"itr_cia_aberta_DFC_MI_ind_{ano}.csv" in list_files else f"itr_cia_aberta_DFC_MD_ind_{ano}.csv")
                    }

                    consolidado_per_date = {}

                    for tipo, (file_con, file_ind) in arquivos_alvo.items():
                        df = None
                        for candidate in (file_con, file_ind):
                            if candidate in list_files:
                                with z.open(candidate) as f:
                                    df_temp = pd.read_csv(f, sep=';', encoding='latin1', low_memory=False, dtype=str)
                                    df_temp.columns = [col.upper() for col in df_temp.columns]
                                    df_temp['CD_CVM'] = df_temp['CD_CVM'].astype(str).str.strip().str.zfill(6)
                                    df_temp['CD_CONTA'] = df_temp['CD_CONTA'].astype(str).str.strip()
                                    df_temp = df_temp[df_temp['CD_CVM'].isin(cvm_codes)]
                                    if not df_temp.empty:
                                        df = df_temp
                                        break

                        if df is None or df.empty:
                            continue

                        for code in cvm_codes:
                            emp_df = df[df['CD_CVM'] == code]
                            for dt_refer, grupo in emp_df.groupby('DT_REFER'):
                                chave = f"{code}_{dt_refer}"
                                if chave not in consolidado_per_date:
                                    try:
                                        mes = datetime.strptime(str(dt_refer), '%Y-%m-%d').month
                                    except ValueError:
                                        mes = int(str(dt_refer).split('-')[1]) if '-' in str(dt_refer) else 1

                                    tri = (mes - 1) // 3 + 1
                                    consolidado_per_date[chave] = {
                                        "cvm_code": code, "ano": ano, "trimestre": tri,
                                        "label": f"{tri}T{ano}", "data_base": str(dt_refer),
                                        "valores": {}, "_is_bank": False, "_dfc_ytd": None
                                    }

                                g = CVMProcessor._filter_latest_exerc(grupo)
                                valores = consolidado_per_date[chave]["valores"]

                                if tipo == 'DRE':
                                    ds_map = {}
                                    if 'DS_CONTA' in g.columns:
                                        for _, r in g[['CD_CONTA', 'DS_CONTA']].drop_duplicates('CD_CONTA').iterrows():
                                            ds_map[str(r['CD_CONTA'])] = str(r['DS_CONTA']).lower()

                                    is_bank = (
                                        'intermediação financeira' in ds_map.get('3.01', '')
                                        or 'antes dos tributos' in ds_map.get('3.05', '')
                                    )
                                    is_insurance = (
                                        not is_bank
                                        and 'antes do resultado financeiro' in ds_map.get('3.07', '')
                                    )
                                    if is_bank:
                                        consolidado_per_date[chave]["_is_bank"] = True

                                    v_rec = CVMProcessor._extract_value(g[g['CD_CONTA'] == '3.01'], prefer_shortest_period=True)
                                    if v_rec is not None:
                                        valores['receita'] = v_rec

                                    v_bruto = CVMProcessor._extract_value(g[g['CD_CONTA'] == '3.03'], prefer_shortest_period=True)
                                    if v_bruto is not None:
                                        valores['lucro_bruto'] = v_bruto

                                    if not is_bank:
                                        ebit_code = '3.07' if is_insurance else '3.05'
                                        fin_code = '3.08' if is_insurance else '3.06'
                                        v_ebit = CVMProcessor._extract_value(g[g['CD_CONTA'] == ebit_code], prefer_shortest_period=True)
                                        if v_ebit is not None:
                                            valores['ebit'] = v_ebit
                                        v_fin = CVMProcessor._extract_value(g[g['CD_CONTA'] == fin_code], prefer_shortest_period=True)
                                        if v_fin is not None:
                                            valores['resultado_financeiro'] = v_fin

                                    ll_codes = ('3.09', '3.11') if is_bank else ('3.11', '3.09')
                                    for ll_code in ll_codes:
                                        v_ll = CVMProcessor._extract_value(g[g['CD_CONTA'] == ll_code], prefer_shortest_period=True)
                                        if v_ll is not None:
                                            valores['lucro_liquido'] = v_ll
                                            break

                                elif tipo in ('BPA', 'BPP'):
                                    bal_map = {
                                        '1': 'ativo_total',
                                        '1.01.01': 'caixa',
                                        '2.01.04': 'divida_cp',
                                        '2.02.01': 'divida_lp',
                                    }
                                    for cd, lbl in bal_map.items():
                                        v_bal = CVMProcessor._extract_value(g[g['CD_CONTA'] == cd])
                                        if v_bal is not None:
                                            valores[lbl] = v_bal

                                    # Banks (IFs) report Patrimônio Líquido under 2.08 instead of 2.03
                                    v_pl = None
                                    if tipo == 'BPP' and 'DS_CONTA' in g.columns:
                                        pl_rows = g[
                                            (g['CD_CONTA'].astype(str).str.len() <= 4)
                                            & g['DS_CONTA'].astype(str).str.lower().str.contains('patrimônio líquido')
                                        ]
                                        v_pl = CVMProcessor._extract_value(pl_rows)
                                    if v_pl is None and tipo == 'BPP':
                                        v_pl = CVMProcessor._extract_value(g[g['CD_CONTA'] == '2.03'])
                                    if v_pl is not None:
                                        valores['patrimonio_liquido'] = v_pl

                                    if tipo == 'BPA' and not consolidado_per_date[chave]["_is_bank"]:
                                        v_ap = CVMProcessor._extract_value(g[g['CD_CONTA'] == '1.01.02'])
                                        if v_ap is not None:
                                            valores['caixa'] = valores.get('caixa', 0.0) + v_ap

                                elif tipo == 'DFC':
                                    dfc_vals = {}
                                    for cd, lbl in (('6.01', 'fco'), ('6.02', 'capex')):
                                        v_d = CVMProcessor._extract_value(g[g['CD_CONTA'] == cd])
                                        if v_d is not None:
                                            dfc_vals[lbl] = v_d

                                    v_dep = CVMProcessor._extract_value(g[g['CD_CONTA'] == '6.01.01.04'])
                                    if (v_dep is None or v_dep == 0.0) and 'DS_CONTA' in g.columns:
                                        dep_rows = g[
                                            g['CD_CONTA'].astype(str).str.startswith('6.01.01.')
                                            & g['DS_CONTA'].astype(str).str.lower().str.contains('deprecia')
                                        ]
                                        v_dep = CVMProcessor._extract_value(dep_rows)
                                    if v_dep is not None:
                                        dfc_vals['depreciacao'] = v_dep

                                    is_ytd = False
                                    if 'DT_INI_EXERC' in g.columns and not g.empty:
                                        dt_ini = str(g.iloc[0]['DT_INI_EXERC'])
                                        is_ytd = dt_ini.endswith('-01-01') and consolidado_per_date[chave]["trimestre"] > 1

                                    if is_ytd:
                                        consolidado_per_date[chave]["_dfc_ytd"] = dfc_vals
                                    else:
                                        valores.update(dfc_vals)

                    # De-accumulate YTD DFC into standalone quarterly DFC per (cvm_code, ano)
                    by_code = {}
                    for data in consolidado_per_date.values():
                        by_code.setdefault(data["cvm_code"], []).append(data)

                    for code_items in by_code.values():
                        code_items.sort(key=lambda x: x["trimestre"])
                        prev_ytd = None
                        for data in code_items:
                            v = data["valores"]
                            ytd = data.get("_dfc_ytd")
                            if ytd is not None:
                                if prev_ytd is not None:
                                    for k, val_ytd in ytd.items():
                                        v[k] = val_ytd - prev_ytd.get(k, 0.0)
                                else:
                                    v.update(ytd)
                                prev_ytd = ytd
                            elif data["trimestre"] == 1:
                                prev_ytd = {k: v[k] for k in ('fco', 'capex', 'depreciacao') if k in v}

                    for data in consolidado_per_date.values():
                        is_bank = data.pop("_is_bank", False)
                        data.pop("_dfc_ytd", None)
                        data["is_bank"] = is_bank
                        v = data["valores"]
                        for k in CVMProcessor.CONTAS_MAP.values():
                            if k not in v:
                                v[k] = 0.0

                        v['divida_bruta'] = v.get('divida_cp', 0.0) + v.get('divida_lp', 0.0)
                        v['divida_liquida'] = v['divida_bruta'] - v.get('caixa', 0.0)
                        v['ebitda'] = 0.0 if is_bank else (v.get('ebit', 0.0) + abs(v.get('depreciacao', 0.0)))
                        v['margem_ebitda'] = (v['ebitda'] / v['receita'] * 100) if (not is_bank and v.get('receita', 0.0) > 0) else 0
                        v['margem_liquida'] = (v['lucro_liquido'] / v['receita'] * 100) if v.get('receita', 0.0) > 0 else 0
                        v['margem_bruta'] = (v['lucro_bruto'] / v['receita'] * 100) if v.get('receita', 0.0) > 0 else 0
                        v['roe'] = (v['lucro_liquido'] / v['patrimonio_liquido'] * 100) if v.get('patrimonio_liquido', 0.0) > 0 else 0
                        v['roa'] = (v['lucro_liquido'] / v['ativo_total'] * 100) if v.get('ativo_total', 0.0) > 0 else 0
                        v['giro_ativo'] = (v['receita'] / v['ativo_total']) if v.get('ativo_total', 0.0) > 0 else 0
                        v['fcl'] = v.get('fco', 0.0) + v.get('capex', 0.0)

                        historico_completo.append(data)

            except Exception as e:
                logging.error(f"❌ Erro operacional crítico no processamento do ZIP CVM do ano {ano}: {e}", exc_info=True)

        if not historico_completo:
            return []
        df_final = pd.DataFrame(historico_completo).drop_duplicates(subset=['cvm_code', 'label'])
        return df_final.sort_values('data_base').to_dict('records')

    @staticmethod
    def calculate_professional_analysis(data):
        if len(data) < 1: return []
        analise_final = []
        for i in range(len(data)):
            atual = data[i]
            anterior_qoq = data[i-1] if i > 0 else None
            anterior_yoy = next((item for item in data[:i] if item['trimestre'] == atual['trimestre'] and item['ano'] == atual['ano'] - 1), None)

            comparativo = {
                "periodo": atual['label'],
                "data_base": atual['data_base'],
                "is_bank": atual.get('is_bank', False),
                "dados_brutos": atual['valores'],
                "analise": {}
            }

            for metrica in ['receita', 'ebit', 'lucro_liquido', 'fco', 'fcl']:
                v_atual = atual['valores'].get(metrica, 0)
                v_ant_yoy = anterior_yoy['valores'].get(metrica, 0) if anterior_yoy else 0
                v_ant_qoq = anterior_qoq['valores'].get(metrica, 0) if anterior_qoq else 0

                yoy_var = round(((v_atual - v_ant_yoy) / abs(v_ant_yoy)) * 100, 2) if v_ant_yoy != 0 else 0
                qoq_var = round(((v_atual - v_ant_qoq) / abs(v_ant_qoq)) * 100, 2) if v_ant_qoq != 0 else 0
                comparativo["analise"][metrica] = {"yoy_crescimento": yoy_var, "qoq_crescimento": qoq_var}

            analise_final.append(comparativo)
        return analise_final

    @staticmethod
    def get_dashboard_data(cvm_code):
        hist = CVMProcessor.get_historical_summary([cvm_code], years_back=3)
        analise = CVMProcessor.calculate_professional_analysis(hist)
        if not analise: return None
        recente = analise[-1]
        v_brutos = recente["dados_brutos"]
        is_bank = recente.get("is_bank", False)

        # Annualize flow metrics over the last 4 quarters (LTM) for balance-sheet ratios
        ltm_window = analise[-4:]
        scale_ltm = 4.0 / len(ltm_window)
        ebitda_ltm = sum(item["dados_brutos"].get('ebitda', 0.0) for item in ltm_window) * scale_ltm
        lucro_ltm = sum(item["dados_brutos"].get('lucro_liquido', 0.0) for item in ltm_window) * scale_ltm
        receita_ltm = sum(item["dados_brutos"].get('receita', 0.0) for item in ltm_window) * scale_ltm

        alavancagem = v_brutos.get('divida_liquida', 0.0) / ebitda_ltm if (not is_bank and ebitda_ltm > 0) else 0.0
        roe_anual = (lucro_ltm / v_brutos['patrimonio_liquido'] * 100) if v_brutos.get('patrimonio_liquido', 0.0) > 0 else 0.0
        roa_anual = (lucro_ltm / v_brutos['ativo_total'] * 100) if v_brutos.get('ativo_total', 0.0) > 0 else 0.0
        giro_anual = (receita_ltm / v_brutos['ativo_total']) if v_brutos.get('ativo_total', 0.0) > 0 else 0.0

        cards = [
            {
                "titulo": "Receita Líquida",
                "valor": v_brutos["receita"],
                "yoy": recente["analise"]["receita"]["yoy_crescimento"],
                "qoq": recente["analise"]["receita"]["qoq_crescimento"],
                "tipo": "eficiencia"
            },
            { "titulo": "Margem Bruta", "valor_formatado": f"{v_brutos['margem_bruta']:.1f}%", "tipo": "eficiencia" },
        ]
        if not is_bank:
            cards.append({
                "titulo": "EBITDA",
                "valor": v_brutos["ebitda"],
                "subtitulo": f"Margem: {v_brutos['margem_ebitda']:.1f}%",
                "tipo": "eficiencia"
            })
        cards.append({
            "titulo": "Lucro Líquido",
            "valor": v_brutos["lucro_liquido"],
            "yoy": recente["analise"]["lucro_liquido"]["yoy_crescimento"],
            "qoq": recente["analise"]["lucro_liquido"]["qoq_crescimento"],
            "tipo": "eficiencia"
        })

        if is_bank:
            cards.append({
                "titulo": "Patrimônio Líquido",
                "valor": v_brutos["patrimonio_liquido"],
                "tipo": "risco",
                "subtitulo": f"Ativo Total: {_format_brl_compact(v_brutos['ativo_total'])}"
            })
        else:
            cards.append({
                "titulo": "Dívida Líquida",
                "valor": v_brutos["divida_liquida"],
                "tipo": "risco",
                "subtitulo": f"{alavancagem:.2f}x EBITDA (LTM)"
            })
            cards.append({
                "titulo": "Resultado Financeiro",
                "valor": v_brutos["resultado_financeiro"],
                "tipo": "risco",
                "status": "negativo" if v_brutos["resultado_financeiro"] < 0 else "positivo"
            })

        cards.extend([
            { "titulo": "ROE", "valor_formatado": f"{roe_anual:.2f}%", "tipo": "rentabilidade", "subtitulo": "Anualizado (LTM)" },
            { "titulo": "ROA", "valor_formatado": f"{roa_anual:.2f}%", "tipo": "rentabilidade", "subtitulo": f"Giro: {giro_anual:.2f}x" },
            {
                "titulo": "Fluxo Operacional (FCO)",
                "valor": v_brutos["fco"],
                "yoy": recente["analise"]["fco"]["yoy_crescimento"],
                "qoq": recente["analise"]["fco"]["qoq_crescimento"],
                "tipo": "caixa"
            },
            { "titulo": "Fluxo Caixa Livre (FCL)", "valor": v_brutos["fcl"], "tipo": "caixa", "subtitulo": f"Capex: {_format_brl_compact(v_brutos['capex'])}" }
        ])

        return {
            "ticker_info": { "cvm_code": cvm_code, "ultimo_periodo": recente["periodo"], "data_base": recente["data_base"] },
            "cards_indicadores": cards,
            "evolucao_grafico": [ {
                "label": item["periodo"],
                "receita": item["dados_brutos"]["receita"],
                "lucro": item["dados_brutos"]["lucro_liquido"],
                "fco": item["dados_brutos"]["fco"],
                "fcl": item["dados_brutos"]["fcl"]
            } for item in analise ]
        }
