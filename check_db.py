import sys
sys.path.insert(0, '/app/server')
sys.path.insert(0, '/app')
from sqlalchemy import create_engine, text

BACKUP = '/app/server/backups/assetflow_backup_2026-07-01.db'
LIVE   = '/app/data/assetflow.db'

backup_engine = create_engine(f'sqlite:///{BACKUP}')
live_engine   = create_engine(f'sqlite:///{LIVE}')

with backup_engine.connect() as bconn:
    # 1. List all tables in backup
    tables = bconn.execute(text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).fetchall()
    print("=== BACKUP TABLES ===")
    for t in tables:
        tname = t[0]
        if tname.startswith('sqlite_') or tname == 'alembic_version':
            continue
        try:
            count = bconn.execute(text(f"SELECT COUNT(*) FROM [{tname}]")).scalar()
            cols  = [c[1] for c in bconn.execute(text(f"PRAGMA table_info([{tname}])")).fetchall()]
            has_uid = 'user_id' in cols
            print(f"  {tname}: {count} rows, has_user_id={has_uid}, cols={cols[:6]}")
        except Exception as e:
            print(f"  {tname}: ERROR {e}")
