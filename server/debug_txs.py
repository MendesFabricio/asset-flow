import sqlite3
conn = sqlite3.connect('/app/data/assetflow.db')
res = conn.execute("SELECT * FROM asset_transactions WHERE user_id=6 AND strftime('%Y-%m', transaction_date)='2023-05'").fetchall()
print(res)
