"""
RESTORE FROM 05 SCRIPT: Restaura e migra todos os dados do backup de 05/07
('/app/backups/assetflow_backup_2026-07-05.db') para o banco live atual,
garantindo integridade de IDs e associando tudo ao user_id=1 (Fabricio).
"""
import sys
sys.path.insert(0, '/app/server')
sys.path.insert(0, '/app')
from sqlalchemy import create_engine, text

BACKUP = '/app/backups/assetflow_backup_2026-07-05.db'
LIVE   = '/app/data/assetflow.db'
FABRICIO_USER_ID = 1

backup_engine = create_engine(f'sqlite:///{BACKUP}')
live_engine   = create_engine(f'sqlite:///{LIVE}')

print("=== INICIANDO RESTAURACAO COMPLETA DO BACKUP 05/07 ===")

# Lista de tabelas para limpar e restaurar
# Formato: (nome_tabela, has_user_id)
tables_to_restore = [
    ('assets', True),
    ('categories', False), # categorias globais, mas vamos limpar e recriar para IDs baterem
    ('positions', True),
    ('dividends', True),
    ('market_data', False),
    ('snapshots', True),
    ('debtors', True),
    ('receivable_loans', True),
    ('loan_installments', True),
    ('payment_transactions', True),
    ('price_alerts', True),
    ('fixed_income', True),
    ('credit_cards', True),
    ('card_expenses', True),
    ('card_installments', True),
    ('ai_chat_histories', True),
    ('refund_configs', True),
    ('sync_states', False)
]

with backup_engine.connect() as bconn, live_engine.begin() as lconn:
    # Desativar foreign key check temporariamente para permitir restauracao limpa
    lconn.execute(text("PRAGMA foreign_keys=OFF"))
    
    # 1. Limpar tabelas no live
    print("\nLimpando tabelas live...")
    for tname, _ in reversed(tables_to_restore):
        lconn.execute(text(f"DELETE FROM [{tname}]"))
        print(f"  Tabela '{tname}' limpa.")
        
    # 2. Copiar dados do backup para o live
    print("\nCopiando dados do backup e injetando user_id...")
    for tname, has_uid in tables_to_restore:
        # Obter colunas da tabela no backup
        bk_cols = [c[1] for c in bconn.execute(text(f"PRAGMA table_info([{tname}])")).fetchall()]
        
        # Obter todos os dados do backup
        bk_rows = bconn.execute(text(f"SELECT * FROM [{tname}]")).fetchall()
        print(f"  Tabela '{tname}': {len(bk_rows)} registros no backup.")
        
        if not bk_rows:
            continue
            
        # Montar colunas para insercao
        insert_cols = list(bk_cols)
        if has_uid:
            insert_cols.append('user_id')
            
        col_list_str = ", ".join(f"[{c}]" for c in insert_cols)
        val_list_str = ", ".join(f":{c}" for c in insert_cols)
        
        insert_sql = f"INSERT INTO [{tname}] ({col_list_str}) VALUES ({val_list_str})"
        
        # Executar insercoes
        for row in bk_rows:
            params = dict(zip(bk_cols, row))
            if has_uid:
                params['user_id'] = FABRICIO_USER_ID
                
            lconn.execute(text(insert_sql), params)
            
    # Ativar foreign keys
    lconn.execute(text("PRAGMA foreign_keys=ON"))
    print("\nTransação concluída e foreign keys ativadas!")

# Verificar estado final
with live_engine.connect() as lconn:
    print("\n=== ESTADO FINAL DAS TABELAS NO BANCO LIVE ===")
    for tname, _ in tables_to_restore:
        count = lconn.execute(text(f"SELECT COUNT(*) FROM [{tname}]")).scalar()
        print(f"  {tname}: {count} registros")
        
print("\nDone!")
