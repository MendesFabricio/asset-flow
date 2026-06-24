import sqlite3
import os
import shutil
import sys
from contextlib import closing # 🧼 Garante o fechamento automático e seguro dos arquivos de banco

# Faz o Python encontrar a pasta 'database' que está na raiz
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from database.models import Base, engine

# Caminhos dos ficheiros
Target_DB = "assetflow.db"          
Source_DB = "assetflow_TEMP_COPY.db" 

# 🛡️ SEGURANÇA: Whitelist estrita das únicas tabelas autorizadas a rodar f-strings no banco
ALLOWED_TABLES = {'categories', 'assets', 'positions', 'market_data', 'snapshots', 'dividends'}

def migrate_inteligente():
    print("🧹 Iniciando Migração Segura (Suporte a Relatórios FNET)...")

    if not os.path.exists(Target_DB):
        print(f"ℹ️ {Target_DB} não encontrado na pasta server. Criando do zero...")
        Base.metadata.create_all(engine)
        print("✨ Estrutura criada com sucesso!")
        return

    print(f"📦 Criando cópia temporária de segurança: {Source_DB}")
    if os.path.exists(Source_DB):
        os.remove(Source_DB)
    shutil.copyfile(Target_DB, Source_DB)

    print("✨ Resetando estrutura para aplicar novas colunas do models.py...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    
    # 🧼 Context Manager duplo com closing: impede que os arquivos fiquem travados em memória se o script falhar
    try:
        with closing(sqlite3.connect(Source_DB)) as conn_source, \
             closing(sqlite3.connect(Target_DB)) as conn_target:
             
            conn_target.execute("PRAGMA foreign_keys = ON;") 
            
            cursor_source = conn_source.cursor()
            cursor_target = conn_target.cursor()

            tables = ['categories', 'assets', 'positions', 'market_data', 'snapshots', 'dividends']
            
            for table in tables:
                # 🛡️ Validação de segurança na Whitelist antes de qualquer execução estrutural
                if table not in ALLOWED_TABLES:
                    print(f"   ❌ Tentativa de acesso a tabela não autorizada: {table}. Ignorada.")
                    continue

                print(f"🔄 Processando tabela: {table}...")
                try:
                    # 1. Obtém as colunas que existiam no banco antigo (Seguro via Whitelist)
                    cursor_source.execute(f"PRAGMA table_info({table})")
                    source_cols = [c[1] for c in cursor_source.fetchall()]
                    
                    if not source_cols:
                        print(f"   ℹ️ Tabela {table} não existia no banco anterior. Ignorada.")
                        continue

                    # 2. Obtém as colunas que existem no banco novo
                    cursor_target.execute(f"PRAGMA table_info({table})")
                    target_cols = [c[1] for c in cursor_target.fetchall()]

                    # 3. Identifica apenas as colunas que existem em AMBOS os bancos
                    common_cols = [col for col in source_cols if col in target_cols]
                    
                    if not common_cols:
                        print(f"   ⚠️ Nenhuma coluna em comum para a tabela {table}.")
                        continue

                    # 🛡️ Defesa em Profundidade: Sanitização extra dos nomes de colunas
                    common_cols = [c for c in common_cols if c.replace('_', '').isalnum()]
                    if not common_cols:
                        continue

                    # 4. Busca os dados apenas das colunas comuns (Escapadas com aspas duplas)
                    escaped_cols = [f'"{col}"' for col in common_cols]
                    columns_str = ",".join(escaped_cols)
                    
                    query = f"SELECT {columns_str} FROM {table}"
                    if table in ['positions', 'market_data', 'dividends']:
                        query += " WHERE asset_id IS NOT NULL"
                        
                    cursor_source.execute(query)
                    rows = cursor_source.fetchall()
                    
                    if not rows:
                        print(f"   ⚠️ Tabela {table} sem dados para migrar.")
                        continue

                    # 5. Insere os dados no novo banco
                    placeholders = ",".join(["?"] * len(common_cols))
                    
                    count = 0
                    skipped = 0
                    for row in rows:
                        try:
                            cursor_target.execute(
                                f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})", 
                                row
                            )
                            count += 1
                        except sqlite3.IntegrityError:
                            skipped += 1
                    
                    print(f"   ✅ Salvos: {count} | 🗑️ Duplicados/Lixo: {skipped}")

                except Exception as e:
                    print(f"   ❌ Erro na tabela {table}: {e}")

            conn_target.commit()
            
    except Exception as e:
        print(f"❌ Erro crítico durante o processamento da migração: {e}")
    finally:
        # Garante a eliminação completa do arquivo temporário residual do disco
        if os.path.exists(Source_DB):
            os.remove(Source_DB)
        
    print("\n🚀 SUCESSO! Banco reconstruído com suporte às novas colunas de relatórios.")

if __name__ == "__main__":
    migrate_inteligente()
