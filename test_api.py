import requests, json

# Login
resp = requests.post('http://localhost:5328/api/auth/login', json={'username': 'Fabricio', 'password': 'Fabricio123'}, timeout=15)
print('Login status:', resp.status_code)
data = resp.json()
token = data.get('token')
print(f'Token obtido: {"SIM" if token else "NAO"}')

if token:
    headers = {'Authorization': f'Bearer {token}'}
    
    # Test /api/index (dashboard principal)
    dash_resp = requests.get('http://localhost:5328/api/index', headers=headers, timeout=30)
    print(f'\n/api/index status: {dash_resp.status_code}')
    if dash_resp.status_code == 200:
        dash = dash_resp.json()
        print('Chaves:', list(dash.keys()) if isinstance(dash, dict) else 'lista')
        if 'resumo' in dash:
            print('Resumo:', dash['resumo'])
    
    # Test /api/refunds/debtors
    debtors_resp = requests.get('http://localhost:5328/api/refunds/debtors', headers=headers, timeout=20)
    print(f'\n/api/refunds/debtors status: {debtors_resp.status_code}')
    if debtors_resp.status_code == 200:
        debtors = debtors_resp.json()
        print(f'Debtors count: {len(debtors)}')
        for d in debtors:
            print(f'  ID: {d.get("id")}, Nome: {d.get("nome")}, Saldo Pendente: {d.get("saldo_pendente")}')
            
    # Test /api/refunds/loans
    loans_resp = requests.get('http://localhost:5328/api/refunds/loans', headers=headers, timeout=20)
    print(f'\n/api/refunds/loans status: {loans_resp.status_code}')
    if loans_resp.status_code == 200:
        loans = loans_resp.json()
        if isinstance(loans, list):
            print(f'Loans count: {len(loans)}')
            for l in loans[:3]:
                print(f'  ID: {l.get("id")}, Descricao: {l.get("descricao")}, Valor Total: {l.get("valor_total")}, Status: {l.get("status")}')
else:
    print('ERRO: Sem token')
