import unittest
from utils.url_validator import is_safe_url

class TestURLValidator(unittest.TestCase):
    def test_safe_urls(self):
        self.assertTrue(is_safe_url("https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/DFP/DADOS/"))
        self.assertTrue(is_safe_url("https://query1.finance.yahoo.com/v8/finance/chart/PETR4.SA"))
        self.assertTrue(is_safe_url("https://raw.githubusercontent.com/thefintz/icones-b3/main/icones/PETR4.png"))

    def test_ssrf_unsafe_urls(self):
        # Bloqueia IPs privados e metadata de cloud AWS/GCP
        self.assertFalse(is_safe_url("http://127.0.0.1:5328/api/health"))
        self.assertFalse(is_safe_url("http://localhost:3000"))
        self.assertFalse(is_safe_url("http://169.254.169.254/latest/meta-data/"))
        self.assertFalse(is_safe_url("http://10.0.0.1/admin"))
        self.assertFalse(is_safe_url("ftp://dados.cvm.gov.br"))

if __name__ == '__main__':
    unittest.main()
