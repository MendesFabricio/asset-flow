from curl_cffi import requests
from bs4 import BeautifulSoup
import re
def get_si_logo(ticker):
    url = f'https://statusinvest.com.br/acoes/{ticker.lower()}'
    try:
        res = requests.get(url, impersonate='chrome', timeout=5)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            brand_div = soup.find('div', class_='company-brand')
            if brand_div:
                av = brand_div.find('div', class_='company-avatar')
                if av:
                    style = av.get('style', '')
                    match = re.search(r"url\('(.+?)'\)", style)
                    if match:
                        return 'https://statusinvest.com.br' + match.group(1) if match.group(1).startswith('/') else match.group(1)
    except Exception as e:
        print(e)
    
    url = f'https://statusinvest.com.br/fundos-imobiliarios/{ticker.lower()}'
    try:
        res = requests.get(url, impersonate='chrome', timeout=5)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, 'html.parser')
            brand_div = soup.find('div', class_='company-brand')
            if brand_div:
                av = brand_div.find('div', class_='company-avatar')
                if av:
                    style = av.get('style', '')
                    match = re.search(r"url\('(.+?)'\)", style)
                    if match:
                        return 'https://statusinvest.com.br' + match.group(1) if match.group(1).startswith('/') else match.group(1)
    except Exception:
        pass
    return None

print('ITUB4:', get_si_logo('ITUB4'))
print('ISAE4:', get_si_logo('ISAE4'))
print('VGHF11:', get_si_logo('VGHF11'))
