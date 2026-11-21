"use client";

import { useState, useEffect } from 'react';
import { taxService, TaxReportDetails, TaxMonthlyReport as TaxMonthlyReportType } from '@/services/tax';
import { AlertCircle } from 'lucide-react';
import { formatMoney as formatCurrency } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';

export default function TaxMonthlyReport() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatCurrency(v));
  const date = new Date();
  const [month, setMonth] = useState<string>((date.getMonth() + 1).toString());
  const [year, setYear] = useState<string>(date.getFullYear().toString());
  
  const [report, setReport] = useState<TaxMonthlyReportType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    taxService.getMonthlyTax(parseInt(year), parseInt(month))
      .then(data => setReport(data))
      .catch(err => {
        console.error(err);
        setError(true);
      })
      .finally(() => setIsLoading(false));
  }, [year, month]);

  const generateYears = () => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (current - i).toString());
  };

  const generateMonths = () => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: (i + 1).toString(),
      label: new Date(2000, i, 1).toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, c => c.toUpperCase())
    }));
  };

  if (error) {
    return (
      <div className="bg-status-error/10 border border-status-error/30 p-4 rounded-xl flex gap-3">
        <AlertCircle className="text-status-error shrink-0 w-5 h-5" />
        <div className="text-status-error font-medium">
          Não foi possível carregar os dados do imposto.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm">
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1 w-28">
            <label htmlFor="tax-monthly-year" className="text-sm font-medium text-text-muted">Ano</label>
            <select
              id="tax-monthly-year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-3 py-2 bg-surface-input border border-border-subtle rounded-lg text-text-primary tabular-nums"
            >
              {generateYears().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-40">
            <label htmlFor="tax-monthly-month" className="text-sm font-medium text-text-muted">Mês</label>
            <select
              id="tax-monthly-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 bg-surface-input border border-border-subtle rounded-lg text-text-primary"
            >
              {generateMonths().map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-text-muted py-8">Carregando relatórios...</div>
      ) : report ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm flex flex-col gap-1">
              <span className="text-sm text-text-muted font-medium">DARF a Pagar no Mês</span>
              <span className={`text-2xl font-semibold tabular-nums ${report.darf.darf_to_pay > 0 ? 'text-status-error' : 'text-status-success'}`}>
                {money(report.darf.darf_to_pay)}
              </span>
              {report.darf.darf_to_pay === 0 && report.darf.next_month_accumulated > 0 && (
                <span className="text-xs text-text-muted mt-1 tabular-nums">
                  * {money(report.darf.next_month_accumulated)} acumulados para o próximo mês (menor que R$ 10).
                </span>
              )}
            </div>
            
            <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm flex flex-col gap-1 items-start">
              <span className="text-sm text-text-muted font-medium">Total Vendas Ações (ST)</span>
              <span className="text-2xl font-semibold text-text-primary tabular-nums">{money(report.sales_total_stocks)}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-md mt-1 ${report.is_exempt_stocks_st ? 'bg-status-success/15 text-status-success' : 'bg-status-error/15 text-status-error'}`}>
                {report.is_exempt_stocks_st ? 'Isento (< 20k)' : 'Tributável (> 20k)'}
              </span>
            </div>

            <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm flex flex-col gap-1">
              <span className="text-sm text-text-muted font-medium">Imposto Total Gerado</span>
              <span className="text-2xl font-semibold text-text-primary tabular-nums">{money(report.darf.month_tax)}</span>
            </div>
          </div>

          <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-text-primary mb-4">Resumo por Categoria</h3>
            <table className="w-full text-left text-sm text-text-primary">
              <thead className="bg-surface-input text-text-muted font-medium border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Lucro/Prejuízo Mensal</th>
                  <th className="px-4 py-3">Base Tributável (Após abater perdas)</th>
                  <th className="px-4 py-3">Imposto Gerado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                <tr className="hover:bg-surface-input/40">
                  <td className="px-4 py-3">Ações (Swing Trade)</td>
                  <td className={`px-4 py-3 font-medium tabular-nums ${report.profits.stocks_st < 0 ? 'text-status-error' : 'text-status-success'}`}>
                    {money(report.profits.stocks_st)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxable_profits.stocks_st)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxes.stocks_st)}</td>
                </tr>
                <tr className="hover:bg-surface-input/40">
                  <td className="px-4 py-3">Ações (Day Trade)</td>
                  <td className={`px-4 py-3 font-medium tabular-nums ${report.profits.stocks_dt < 0 ? 'text-status-error' : 'text-status-success'}`}>
                    {money(report.profits.stocks_dt)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxable_profits.stocks_dt)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxes.stocks_dt)}</td>
                </tr>
                <tr className="hover:bg-surface-input/40">
                  <td className="px-4 py-3">Fundos Imobiliários</td>
                  <td className={`px-4 py-3 font-medium tabular-nums ${report.profits.fiis < 0 ? 'text-status-error' : 'text-status-success'}`}>
                    {money(report.profits.fiis)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxable_profits.fiis)}</td>
                  <td className="px-4 py-3 tabular-nums">{money(report.taxes.fiis)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-text-primary mb-4">Detalhamento das Vendas</h3>
            {report.details.length === 0 ? (
              <p className="text-text-muted text-sm pb-2">Nenhuma venda registrada neste mês.</p>
            ) : (
              <table className="w-full text-left text-sm text-text-primary">
                <thead className="bg-surface-input text-text-muted font-medium border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Ativo</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Venda R$</th>
                    <th className="px-4 py-3 text-right">Custo R$</th>
                    <th className="px-4 py-3 text-right">Resultado R$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {report.details.map((tx: TaxReportDetails) => (
                    <tr key={tx.id} className="hover:bg-surface-input/40">
                      <td className="px-4 py-3 tabular-nums">{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 font-medium">{tx.ticker}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-surface-input rounded-md text-xs border border-border-subtle">
                          {tx.is_fii ? 'FII' : tx.is_day_trade ? 'Day Trade' : 'Swing Trade'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(tx.sale_value)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(tx.cost_value)}</td>
                      <td className={`px-4 py-3 text-right font-medium tabular-nums ${tx.profit < 0 ? 'text-status-error' : 'text-status-success'}`}>
                        {money(tx.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
