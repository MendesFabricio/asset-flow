import requests, json

def test_user_session(username, password, expect_data=True):
    print(f"\n================================================")
    print(f"TESTANDO USUARIO: {username}")
    print(f"================================================")
    
    # 1. Login
    resp = requests.post('http://localhost:5328/api/auth/login', json={'username': username, 'password': password}, timeout=15)
    print('Login status:', resp.status_code)
    if resp.status_code != 200:
        print(f"Erro no login do usuario {username}:", resp.json())
        return False
        
    token = resp.json().get('token')
    headers = {'Authorization': f'Bearer {token}'}
    
    # 2. Testar /api/refunds/debtors
    debtors_resp = requests.get('http://localhost:5328/api/refunds/debtors', headers=headers, timeout=20)
    print(f'Debtors status: {debtors_resp.status_code}')
    debtors = debtors_resp.json()
    print(f'Debtors count: {len(debtors)}')
    for d in debtors:
        print(f'  Nome: {d.get("nome")}, Saldo: {d.get("saldo_pendente")}')
        
    # 3. Testar /api/refunds/loans
    loans_resp = requests.get('http://localhost:5328/api/refunds/loans', headers=headers, timeout=20)
    print(f'Loans status: {loans_resp.status_code}')
    loans = loans_resp.json()
    print(f'Loans count: {len(loans)}')
    for l in loans[:2]:
        print(f'  ID: {l.get("id")}, Descricao: {l.get("descricao")}, Valor: {l.get("valor_total")}')
        
    # 4. Testar /api/refunds/dashboard
    ref_dash_resp = requests.get('http://localhost:5328/api/refunds/dashboard', headers=headers, timeout=20)
    print(f'Refunds Dashboard status: {ref_dash_resp.status_code}')
    ref_dash = ref_dash_resp.json()
    print(f'Refunds Dashboard - Total Emprestado: {ref_dash.get("total_emprestado")}, Pendente: {ref_dash.get("total_pendente")}')

    # 5. Testar /api/credit-cards
    cards_resp = requests.get('http://localhost:5328/api/credit-cards', headers=headers, timeout=20)
    print(f'Credit Cards status: {cards_resp.status_code}')
    cards = cards_resp.json()
    print(f'Credit Cards count: {len(cards)}')
    
    # 6. Testar /api/credit-cards/dashboard
    card_dash_resp = requests.get('http://localhost:5328/api/credit-cards/dashboard', headers=headers, timeout=20)
    print(f'Credit Cards Dashboard status: {card_dash_resp.status_code}')
    card_dash = card_dash_resp.json()
    print(f'Credit Cards Dashboard - Limite: {card_dash.get("total_limit")}, Spent: {card_dash.get("total_spent")}')
    
    # Validacoes de seguranca
    if expect_data:
        if len(debtors) == 0 or len(loans) == 0:
            print("❌ ERRO: Esperava encontrar dados para este usuario, mas veio vazio.")
            return False
        print("✅ Dados carregados corretamente conforme esperado.")
    else:
        if len(debtors) > 0 or len(loans) > 0 or len(cards) > 0 or float(ref_dash.get("total_emprestado", 0)) > 0 or float(card_dash.get("total_limit", 0)) > 0:
            print("❌ FALHA DE SEGURANCA: O usuario enxerga dados de outro inquilino!")
            return False
        print("✅ ISOLAMENTO CONFIRMADO: Usuario nao consegue enxergar dados de terceiros.")
    return True

# Registrar o usuario 'Teste' se ele nao existir
reg_resp = requests.post('http://localhost:5328/api/auth/register', json={'username': 'Teste', 'password': 'teste'}, timeout=15)
print('Registro do usuario Teste:', reg_resp.status_code, reg_resp.json())

# Rodar os testes para os dois perfis
fabricio_ok = test_user_session('Fabricio', 'Fabricio123', expect_data=True)
teste_ok = test_user_session('Teste', 'teste', expect_data=False)

if fabricio_ok and teste_ok:
    print("\n🎉 TODOS OS TESTES PASSARAM COM EXCELENCIA! O ISOLAMENTO DE TENACY ESTA 100% OPERACIONAL.")
else:
    print("\n❌ ALGUNS TESTES FALHARAM. VERIFIQUE OS LOGS ACIMA.")
