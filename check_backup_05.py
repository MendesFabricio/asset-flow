import sqlite3

conn = sqlite3.connect('/app/backups/assetflow_backup_2026-07-05.db')
cursor = conn.cursor()

tables = [row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
print("=== BACKUP 2026-07-05 TABLES ===")
for t in tables:
    if t.startswith('sqlite_'):
        continue
    try:
        count = cursor.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        cols = [col[1] for col in cursor.execute(f"PRAGMA table_info([{t}])").fetchall()]
        print(f"  {t}: {count} rows, cols: {cols[:6]}")
    except Exception as e:
        print(f"  {t}: Error - {e}")
conn.close()
