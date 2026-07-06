"""
RESTORE DIVIDENDS: Restaura dividends do backup para o banco atual com user_id=1 (Fabricio).
Positions ja foram restauradas com sucesso (29 rows).
"""
import sys
sys.path.insert(0, '/app/server')
sys.path.insert(0, '/app')
from sqlalchemy import create_engine, text

BACKUP = '/app/server/backups/assetflow_backup_2026-07-01.db'
LIVE   = '/app/data/assetflow.db'
FABRICIO_USER_ID = 1

backup_engine = create_engine(f'sqlite:///{BACKUP}')
live_engine   = create_engine(f'sqlite:///{LIVE}')

print("=== RESTAURANDO DIVIDENDS ===\n")

with backup_engine.connect() as bconn, live_engine.connect() as lconn:
    lconn.execute(text("PRAGMA foreign_keys=OFF"))
    
    live_div_count = lconn.execute(text("SELECT COUNT(*) FROM dividends")).scalar()
    print(f"Live atual: {live_div_count} rows")
    
    if live_div_count == 0:
        bk_divs = bconn.execute(text("""
            SELECT id, asset_id, date_com, date_payment, value_per_share,
                   quantity_at_date, total_value, status
            FROM dividends
        """)).fetchall()
        
        print(f"Backup: {len(bk_divs)} rows a restaurar")
        
        inserted = 0
        for row in bk_divs:
            asset_exists = lconn.execute(
                text("SELECT id FROM assets WHERE id = :aid AND user_id = :uid"),
                {"aid": row[1], "uid": FABRICIO_USER_ID}
            ).scalar()
            
            if not asset_exists:
                print(f"  AVISO: asset_id={row[1]} nao encontrado, pulando")
                continue
            
            lconn.execute(text("""
                INSERT OR IGNORE INTO dividends
                    (id, asset_id, user_id, date_com, date_payment, value_per_share,
                     quantity_at_date, total_value, status)
                VALUES (:id, :asset_id, :user_id, :date_com, :date_payment, :value_per_share,
                        :quantity_at_date, :total_value, :status)
            """), {
                "id": row[0],
                "asset_id": row[1],
                "user_id": FABRICIO_USER_ID,
                "date_com": row[2],
                "date_payment": row[3],
                "value_per_share": row[4],
                "quantity_at_date": row[5],
                "total_value": row[6],
                "status": row[7],
            })
            inserted += 1
        
        lconn.execute(text("COMMIT"))
        restored = lconn.execute(text("SELECT COUNT(*) FROM dividends")).scalar()
        print(f"Inseridos: {inserted}, Total no live: {restored} [OK]")
    else:
        print(f"JA TEM DADOS ({live_div_count} rows), pulando.")
    
    lconn.execute(text("PRAGMA foreign_keys=ON"))

# Resultado final
print("\n=== RESULTADO FINAL DO BANCO ===")
with live_engine.connect() as lconn:
    for t in ['assets', 'positions', 'dividends', 'market_data', 'snapshots', 'debtors', 'receivable_loans']:
        try:
            count = lconn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            print(f"  {t}: {count}")
        except Exception as e:
            print(f"  {t}: ERROR {e}")

print("\nDone.")
