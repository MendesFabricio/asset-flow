import sqlite3

conn = sqlite3.connect('/app/data/assetflow.db')
cursor = conn.cursor()

try:
    cursor.execute("DROP TABLE tax_profiles")
    print("Dropped tax_profiles")
except Exception as e:
    print(f"Error dropping tax_profiles: {e}")

try:
    cursor.execute("ALTER TABLE asset_transactions DROP COLUMN cost_basis")
    print("Dropped cost_basis")
except Exception as e:
    print(f"Error dropping cost_basis: {e}")

try:
    cursor.execute("ALTER TABLE asset_transactions DROP COLUMN is_day_trade")
    print("Dropped is_day_trade")
except Exception as e:
    print(f"Error dropping is_day_trade: {e}")

# Reset alembic_version to before the failed migration
try:
    cursor.execute("UPDATE alembic_version SET version_num = 'affbf294de48'")
    print("Reset alembic_version")
except Exception as e:
    print(f"Error resetting alembic: {e}")

conn.commit()
conn.close()
