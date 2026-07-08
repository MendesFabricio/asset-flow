# server/utils/date_helper.py
import calendar
from datetime import datetime, date

def get_invoice_month_helper(purchase_date, closing_day):
    """Calcula o mês de fatura ('YYYY-MM') baseado na data de compra e no dia de fechamento."""
    y = purchase_date.year
    m = purchase_date.month
    if purchase_date.day > closing_day:
        if m == 12:
            m = 1
            y += 1
        else:
            m += 1
    return f"{y}-{m:02d}"

def get_due_date_helper(invoice_month, due_day):
    """Retorna o datetime exato do vencimento da fatura com base no dia de vencimento desejado."""
    parts = invoice_month.split('-')
    y = int(parts[0])
    m = int(parts[1])
    last_day = calendar.monthrange(y, m)[1]
    day = min(due_day, last_day)
    return datetime(y, m, day)

def add_months_helper(sourcedate, months):
    """Incrementa ou decrementa meses de uma data mantendo a corretude do último dia do mês."""
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
