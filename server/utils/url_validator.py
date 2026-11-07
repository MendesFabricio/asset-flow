import urllib.parse
import ipaddress
import logging

# 🛡️ Allowlist de Domínios Confiáveis para Prevenção de SSRF
ALLOWED_DOMAINS = [
    "cvm.gov.br",
    "dados.cvm.gov.br",
    "fnet.bmfbovespa.com.br",
    "finance.yahoo.com",
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
    "news.google.com",
    "raw.githubusercontent.com",
]

def is_safe_url(url: str) -> bool:
    """
    Valida se uma URL é segura para requisições externas (Prevenção de SSRF).
    Bloqueia IPs privados/locais e esquemas não-HTTP(S).
    """
    if not url:
        return False

    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        hostname_lower = hostname.lower()

        # Bloqueia acessos a localhost / loopback
        if hostname_lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False

        # Tenta parsear como endereço IP e verifica se é privado/link-local
        try:
            ip_obj = ipaddress.ip_address(hostname_lower)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_reserved:
                logging.warning(f"🛡️ [SSRF Guard] Tentativa de acesso a IP reservado/privado bloqueada: {url}")
                return False
        except ValueError:
            # Não é um endereço IP numérico, é um nome de domínio
            pass

        # Checa se o domínio termina em algum domínio confiável da allowlist
        for domain in ALLOWED_DOMAINS:
            if hostname_lower == domain or hostname_lower.endswith("." + domain):
                return True

        logging.warning(f"🛡️ [SSRF Guard] URL fora da allowlist bloqueada: {url}")
        return False

    except Exception as e:
        logging.error(f"❌ [SSRF Guard] Erro ao validar URL: {e}")
        return False
