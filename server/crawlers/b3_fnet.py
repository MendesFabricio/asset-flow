# server/crawlers/b3_fnet.py
from datetime import datetime, timedelta
import threading
import logging
import xml.etree.ElementTree as ET
from utils.http_client import get_secure_session

_EMISSION_KEYWORDS = (
    "emiss",
    "subscri",
    "oferta pública",
    "oferta publica",
    "direito de preferência",
    "direito de preferencia",
    "sobras",
)
_CORP_EVENT_KEYWORDS = (
    "desdobramento",
    "grupamento",
    "bonifica",
    "amortiza",
    "incorporação",
    "incorporacao",
    "cisão",
    "cisao",
    "aumento de capital",
)


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
                cls._session = get_secure_session()
        return cls._session

    @staticmethod
    def _parse_date(date_str):
        if not date_str: return datetime.min
        for fmt in ('%d/%m/%Y %H:%M', '%d/%m/%Y', '%Y-%m-%d'):
            try: 
                return datetime.strptime(date_str, fmt)
            except ValueError: 
                continue
        return datetime.min

    @staticmethod
    def classify_corporate_notice(doc_type: str, doc_cat: str = "", extra_text: str = "") -> str | None:
        """Classifica comunicado FNET/CVM em EMISSION, CORP_EVENT ou None."""
        text = " ".join(part for part in (doc_type, doc_cat, extra_text) if part).lower()
        if not text:
            return None
        if any(debt in text for debt in ("debênture", "debenture", "nota comercial", "notas comerciais")):
            if "direito de preferência" not in text and "direito de preferencia" not in text:
                return None
        if any(kw in text for kw in _EMISSION_KEYWORDS):
            return "EMISSION"
        if any(kw in text for kw in _CORP_EVENT_KEYWORDS):
            return "CORP_EVENT"
        return None

    @classmethod
    def _extract_notices(cls, data_list, cutoff_dt=None, emission_only=False):
        notices = []
        for doc in data_list or []:
            doc_id = str(doc.get('id') or '').strip()
            if not doc_id:
                continue
            doc_type = str(doc.get('tipoDocumento') or '')
            doc_cat = str(doc.get('categoriaDocumento') or '')
            extra = str(doc.get('assunto') or doc.get('especieDocumento') or doc.get('descricaoFundo') or '')
            kind = cls.classify_corporate_notice(doc_type, doc_cat, extra)
            if not kind:
                continue
            if emission_only and kind != "EMISSION":
                continue
            date_str = str(doc.get('dataEntrega') or '')
            parsed_dt = cls._parse_date(date_str)
            if cutoff_dt is not None and parsed_dt != datetime.min and parsed_dt < cutoff_dt:
                continue
            title = " - ".join(p.strip() for p in (doc_cat, doc_type) if p and p.strip()) or extra or "Comunicado"
            notices.append({
                "doc_id": doc_id,
                "kind": kind,
                "title": title,
                "date": date_str,
                "ref_date": str(doc.get('dataReferencia') or ''),
                "link": f"https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id={doc_id}",
            })
        return notices

    @classmethod
    def _fetch_tail_records(cls, session, clean_cnpj: str, headers: dict, cutoff_dt=None, cat_id=None, max_pages: int = 8):
        """Busca os registros mais recentes do FNET paginando do fim (recordsTotal) para trás."""
        base_params = {
            "d": 1, "s": 0, "l": 1, "tipoFundo": 1, "situacao": "A",
            "cnpjFundo": clean_cnpj,
        }
        if cat_id:
            base_params["idCategoriaDocumento"] = cat_id

        r0 = session.get(cls.URL_API, params=base_params, headers=headers, timeout=15)
        if r0.status_code != 200:
            return []
        payload0 = r0.json()
        total = int(payload0.get("recordsTotal") or 0)
        if total <= 0:
            return payload0.get("data") or []

        collected = []
        offset = max(0, total - 200)
        for _ in range(max_pages):
            params = {**base_params, "s": offset, "l": 200}
            r = session.get(cls.URL_API, params=params, headers=headers, timeout=15)
            if r.status_code != 200:
                break
            chunk = r.json().get("data") or []
            if not chunk:
                break
            collected.extend(chunk)
            if offset == 0:
                break
            if cutoff_dt is not None:
                earliest = min(
                    (cls._parse_date(str(d.get("dataEntrega") or "")) for d in chunk if d.get("dataEntrega")),
                    default=datetime.max,
                )
                if earliest != datetime.min and earliest < cutoff_dt:
                    break
            offset = max(0, offset - 200)
        return collected

    @classmethod
    def _parse_subscription_xml(cls, session, doc_id: str, headers: dict) -> dict | None:
        """Extrai DataCorte, PercentualSubscricao e PrecoSubscricao do XML estruturado do FNET."""
        try:
            r = session.get(
                f"https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id={doc_id}",
                headers={"User-Agent": headers["User-Agent"]},
                timeout=15,
            )
            if r.status_code != 200 or "<DireitoPreferenciaSubscricaoCotas" not in r.text:
                return None
            root = ET.fromstring(r.text)
            dg = root.find(".//DadosGerais")
            if dg is None:
                return None
            pct_txt = (dg.findtext("PercentualSubscricao") or "").strip()
            price_txt = (dg.findtext("PrecoSubscricao") or dg.findtext("PrecoEmissao") or "").strip()
            data_corte = (dg.findtext("DataCorte") or "").strip()
            num_emissao = (dg.findtext("NumeroEmissao") or "").strip()
            return {
                "factor_pct": float(pct_txt) if pct_txt else None,
                "unit_cost": float(price_txt) if price_txt else None,
                "data_corte": data_corte or None,
                "num_emissao": num_emissao or None,
            }
        except Exception as e:
            logging.debug(f"Falha ao ler XML de subscrição FNET doc={doc_id}: {e}")
            return None

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
        notices_by_id = {}
        cutoff_60d = datetime.now() - timedelta(days=60)
        # Categorias FNET: 7=Gerencial, 6=Mensal, 1=Fato Relevante
        categorias = {"gerencial": 7, "mensal": 6, "fato_relevante": 1}
        
        # Coleta a sessão controlada pelo Pool
        session = cls._get_session()

        for key, cat_id in categorias.items():
            try:
                data_list = cls._fetch_tail_records(
                    session, clean_cnpj, headers, cutoff_dt=None, cat_id=cat_id, max_pages=2
                )
                if data_list:
                    if key == "fato_relevante":
                        for notice in cls._extract_notices(data_list, cutoff_dt=cutoff_60d):
                            notices_by_id.setdefault(notice["doc_id"], notice)

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
            except Exception as e:
                # 🔍 RASTREABILIDADE: Troca do print cru por logging estruturado com traceback completo
                logging.error(f"❌ Erro operacional na varredura do FNET para o CNPJ {clean_cnpj} ({key}): {e}", exc_info=True)

        try:
            recent_all = cls._fetch_tail_records(
                session, clean_cnpj, headers, cutoff_dt=cutoff_60d, cat_id=None, max_pages=2
            )
            for notice in cls._extract_notices(recent_all, cutoff_dt=cutoff_60d):
                notices_by_id.setdefault(notice["doc_id"], notice)
        except Exception as e:
            logging.warning(f"⚠️ Erro ao varrer comunicados recentes FNET para CNPJ {clean_cnpj}: {e}")

        if notices_by_id:
            package["corporate_notices"] = sorted(
                notices_by_id.values(),
                key=lambda n: (cls._parse_date(n.get("date")), int(n.get("doc_id") or 0)),
                reverse=True,
            )[:20]

        return package if package else None

    @classmethod
    def scan_historical_emissions(cls, cnpj, since_date=None):
        """Busca comunicados históricos de emissão/subscrição no FNET a partir de since_date."""
        if not cnpj:
            return []
        clean_cnpj = "".join(filter(str.isdigit, str(cnpj)))
        cutoff_dt = None
        if since_date is not None:
            cutoff_dt = datetime.combine(since_date, datetime.min.time()) if not isinstance(since_date, datetime) else since_date

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "X-Requested-With": "XMLHttpRequest",
            "Connection": "keep-alive"
        }
        session = cls._get_session()
        data_list = cls._fetch_tail_records(
            session, clean_cnpj, headers, cutoff_dt=cutoff_dt, cat_id=None, max_pages=10
        )

        structured_by_id = {}
        fallback_by_id = {}
        structured_dates = []

        for doc in data_list:
            doc_id = str(doc.get("id") or "").strip()
            if not doc_id:
                continue
            doc_type = str(doc.get("tipoDocumento") or "")
            doc_cat = str(doc.get("categoriaDocumento") or "")
            extra = str(doc.get("assunto") or doc.get("especieDocumento") or doc.get("descricaoFundo") or "")
            if cls.classify_corporate_notice(doc_type, doc_cat, extra) != "EMISSION":
                continue

            date_str = str(doc.get("dataEntrega") or "")
            parsed_dt = cls._parse_date(date_str)
            if cutoff_dt is not None and parsed_dt != datetime.min and parsed_dt < cutoff_dt:
                continue

            is_structured_sub = "subscri" in doc_type.lower() and "estruturado" in doc_type.lower()
            link = f"https://fnet.bmfbovespa.com.br/fnet/publico/downloadDocumento?id={doc_id}"

            if is_structured_sub:
                parsed_xml = cls._parse_subscription_xml(session, doc_id, headers)
                eff_date = date_str
                title = f"{doc_cat} - {doc_type}".strip(" -")
                factor_pct = None
                unit_cost = None
                if parsed_xml:
                    if parsed_xml.get("data_corte"):
                        eff_date = parsed_xml["data_corte"]
                        corte_dt = cls._parse_date(eff_date)
                        if cutoff_dt is not None and corte_dt != datetime.min and corte_dt < cutoff_dt:
                            continue
                        structured_dates.append(corte_dt)
                    elif parsed_dt != datetime.min:
                        structured_dates.append(parsed_dt)
                    if parsed_xml.get("num_emissao"):
                        title = f"{parsed_xml['num_emissao']}ª Emissão de Cotas (Subscrição)"
                    factor_pct = parsed_xml.get("factor_pct")
                    unit_cost = parsed_xml.get("unit_cost")

                structured_by_id[doc_id] = {
                    "doc_id": doc_id,
                    "kind": "EMISSION",
                    "title": title,
                    "date": eff_date,
                    "ref_date": str(doc.get("dataReferencia") or ""),
                    "link": link,
                    "factor_pct": factor_pct,
                    "unit_cost": unit_cost,
                }
            else:
                title = " - ".join(p.strip() for p in (doc_cat, doc_type) if p and p.strip()) or extra or "Comunicado"
                fallback_by_id.setdefault(doc_id, {
                    "doc_id": doc_id,
                    "kind": "EMISSION",
                    "title": title,
                    "date": date_str,
                    "ref_date": str(doc.get("dataReferencia") or ""),
                    "link": link,
                })

        # Evita duplicar documentos da mesma emissão quando já temos o Formulário de Subscrição Estruturado
        # e ignora comunicados meramente de encerramento/liberação pós-oferta no histórico do simulador
        _skip_fallback = (
            "encerramento",
            "liberação para negociação",
            "liberacao para negociacao",
            "prospecto",
            "lâmina",
            "lamina",
        )
        results = list(structured_by_id.values())
        for notice in fallback_by_id.values():
            low_title = (notice.get("title") or "").lower()
            if any(term in low_title for term in _skip_fallback):
                continue
            dt = cls._parse_date(notice.get("date"))
            if dt != datetime.min and any(abs((dt - sd).days) <= 60 for sd in structured_dates):
                continue
            results.append(notice)

        return sorted(
            results,
            key=lambda n: (cls._parse_date(n.get("date")), int(n.get("doc_id") or 0)),
        )
