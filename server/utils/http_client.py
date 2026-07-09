# server/utils/http_client.py
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

class TimeoutHTTPAdapter(HTTPAdapter):
    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.pop("timeout", 10.0)
        super().__init__(*args, **kwargs)

    def send(self, request, **kwargs):
        kwargs.setdefault("timeout", self.timeout)
        return super().send(request, **kwargs)

def get_secure_session(timeout: float = 10.0) -> requests.Session:
    """Retorna uma sessão do requests com User-Agent robusto, política de retry e timeout padrão."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    
    # Política de Retry amigável
    retries = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = TimeoutHTTPAdapter(max_retries=retries, timeout=timeout)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session
