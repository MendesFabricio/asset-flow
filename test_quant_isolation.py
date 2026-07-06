import requests, json

def test_endpoints(username, password, expect_data=True):
    print(f"\n================================================")
    print(f"TESTANDO QUANT/SIMULATION PARA: {username}")
    print(f"================================================")
    
    # Login
    resp = requests.post('http://localhost:5328/api/auth/login', json={'username': username, 'password': password}, timeout=15)
    if resp.status_code != 200:
        print(f"Erro no login do usuario {username}")
        return False
        
    token = resp.json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Testar /api/simulation/optimize
    opt_resp = requests.get('http://localhost:5328/api/simulation/optimize', headers=headers, timeout=30)
    print(f'Optimize status: {opt_resp.status_code}')
    opt_json = opt_resp.json()
    if opt_resp.status_code == 200:
        if expect_data:
            print(f'  Optimize Weights: {list(opt_json.get("weights", {}).keys())[:3]}')
        else:
            print(f'  Optimize Response: {opt_json}')
            
    # 2. Testar /api/simulation/risk-parity
    rp_resp = requests.get('http://localhost:5328/api/simulation/risk-parity', headers=headers, timeout=30)
    print(f'Risk Parity status: {rp_resp.status_code}')
    rp_json = rp_resp.json()
    if rp_resp.status_code == 200:
        if expect_data:
            print(f'  Risk Parity Weights: {list(rp_json.get("weights", {}).keys())[:3]}')
        else:
            print(f'  Risk Parity Response: {rp_json}')
            
    # 3. Testar /api/quant/attribution-analysis
    att_resp = requests.get('http://localhost:5328/api/quant/attribution-analysis', headers=headers, timeout=30)
    print(f'Attribution status: {att_resp.status_code}')
    att_json = att_resp.json()
    if expect_data:
        print(f'  Attribution Assets: {len(att_json.get("data", []))}')
    else:
        print(f'  Attribution Response: {att_json}')
        
    # 4. Testar /api/simulation/correlation
    corr_resp = requests.get('http://localhost:5328/api/simulation/correlation', headers=headers, timeout=30)
    print(f'Correlation status: {corr_resp.status_code}')
    corr_json = corr_resp.json()
    if expect_data:
        print(f'  Correlation sectors: {list(corr_json.get("sectors", []))[:3]}')
    else:
        print(f'  Correlation Response: {corr_json}')
        
    return True

test_endpoints('Fabricio', 'Fabricio123', expect_data=True)
test_endpoints('Teste', 'teste', expect_data=False)
