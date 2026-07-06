"""
RESTORE REFUNDS SCRIPT: Migra os dados da tabela antiga 'receivables' do backup
para a nova estrutura normalizada ('debtors', 'receivable_loans', 'loan_installments')
no banco live atual, associando tudo ao user_id=1 (Fabricio).
"""
import sys
sys.path.insert(0, '/app/server')
sys.path.insert(0, '/app')
from sqlalchemy import create_engine, text
from datetime import datetime
from dateutil.relativedelta import relativedelta

BACKUP = '/app/server/backups/assetflow_backup_2026-07-01.db'
LIVE   = '/app/data/assetflow.db'
FABRICIO_USER_ID = 1

backup_engine = create_engine(f'sqlite:///{BACKUP}')
live_engine   = create_engine(f'sqlite:///{LIVE}')

print("=== INICIANDO RESTAURACAO DOS REEMBOLSOS ===")

with backup_engine.connect() as bconn, live_engine.begin() as lconn:
    # 1. Obter todas as linhas de receivables do backup
    bk_receivables = bconn.execute(text("""
        SELECT id, descricao, devedor, valor_parcela, parcela_atual, total_parcelas, vencimento_dia, status
        FROM receivables
    """)).fetchall()
    
    print(f"Total de reembolsos antigos encontrados no backup: {len(bk_receivables)}")
    
    # 2. Mapear devedores únicos no banco live
    devedores_nomes = set(r[2] for r in bk_receivables if r[2])
    print(f"Devedores unicos encontrados: {devedores_nomes}")
    
    debtor_map = {}
    for nome in devedores_nomes:
        # Verifica se devedor ja existe no live
        row = lconn.execute(
            text("SELECT id FROM debtors WHERE nome = :nome AND user_id = :uid"),
            {"nome": nome, "uid": FABRICIO_USER_ID}
        ).fetchone()
        
        if row:
            debtor_map[nome] = row[0]
        else:
            # Cria novo devedor
            lconn.execute(
                text("INSERT INTO debtors (nome, user_id, is_deleted) VALUES (:nome, :uid, 0)"),
                {"nome": nome, "uid": FABRICIO_USER_ID}
            )
            new_id = lconn.execute(text("SELECT last_insert_rowid()")).scalar()
            debtor_map[nome] = new_id
            print(f"  Criado devedor: {nome} (id={new_id})")
            
    # Limpa as tabelas live de empréstimos caso tenha algum lixo anterior
    lconn.execute(text("DELETE FROM payment_transactions WHERE installment_id IN (SELECT id FROM loan_installments WHERE user_id = :uid)"), {"uid": FABRICIO_USER_ID})
    lconn.execute(text("DELETE FROM loan_installments WHERE user_id = :uid"), {"uid": FABRICIO_USER_ID})
    lconn.execute(text("DELETE FROM receivable_loans WHERE user_id = :uid"), {"uid": FABRICIO_USER_ID})
    
    print("\nMigrando empréstimos e parcelas...")
    loans_inserted = 0
    installments_inserted = 0
    
    for row in bk_receivables:
        rid, descricao, devedor_nome, valor_parcela, parcela_atual, total_parcelas, vencimento_dia, status_antigo = row
        
        debtor_id = debtor_map.get(devedor_nome)
        if not debtor_id:
            print(f"  AVISO: Nao foi possivel mapear devedor '{devedor_nome}' para o ID. Pulando.")
            continue
            
        # Calcular valores
        valor_total = float(valor_parcela) * int(total_parcelas)
        is_parcelado = int(total_parcelas) > 1
        
        # Determinar status geral
        if int(parcela_atual) > int(total_parcelas) or str(status_antigo).lower() == 'pago':
            status_geral = "LIQUIDADO"
        elif int(parcela_atual) > 1:
            status_geral = "PARCIAL"
        else:
            status_geral = "PENDENTE"
            
        # 1. Criar o ReceivableLoan
        lconn.execute(text("""
            INSERT INTO receivable_loans (id, debtor_id, user_id, descricao, categoria, data_emprestimo, valor_total, is_parcelado, total_parcelas, status, is_deleted)
            VALUES (:id, :debtor_id, :user_id, :descricao, 'Reembolso', :data_emp, :valor_total, :is_parcelado, :total_parcelas, :status, 0)
        """), {
            "id": rid,
            "debtor_id": debtor_id,
            "user_id": FABRICIO_USER_ID,
            "descricao": descricao,
            "data_emp": datetime.now() - relativedelta(months=int(parcela_atual) - 1),
            "valor_total": valor_total,
            "is_parcelado": is_parcelado,
            "total_parcelas": total_parcelas,
            "status": status_geral
        })
        loans_inserted += 1
        
        # 2. Criar as parcelas (loan_installments)
        ref_date = datetime(2026, 7, int(vencimento_dia) if int(vencimento_dia) <= 28 else 28) # referencia Julho de 2026
        
        for i in range(1, int(total_parcelas) + 1):
            # Calcular data de vencimento correspondente para a parcela i
            offset = i - int(parcela_atual)
            due_date = ref_date + relativedelta(months=offset)
            
            # Determinar status da parcela
            if str(status_antigo).lower() == 'pago' or i < int(parcela_atual):
                inst_status = "PAGA"
                pay_date = due_date
            else:
                inst_status = "ABERTA"
                pay_date = None
                
            lconn.execute(text("""
                INSERT INTO loan_installments (loan_id, user_id, numero_parcela, valor_parcela, data_vencimento, status, data_efetiva_pagamento, is_deleted)
                VALUES (:loan_id, :user_id, :num, :valor, :vencimento, :status, :pay_date, 0)
            """), {
                "loan_id": rid,
                "user_id": FABRICIO_USER_ID,
                "num": i,
                "valor": valor_parcela,
                "vencimento": due_date,
                "status": inst_status,
                "pay_date": pay_date
            })
            installments_inserted += 1
            
    print(f"\nFinalizado: {loans_inserted} emprestimos e {installments_inserted} parcelas inseridos no Live.")

# Verificar estado final
with live_engine.connect() as lconn:
    print("\n=== ESTADO FINAL DAS TABELAS DE REEMBOLSO ===")
    for t in ['debtors', 'receivable_loans', 'loan_installments', 'payment_transactions']:
        count = lconn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
        print(f"  {t}: {count} registros")
