"use client";

import { useState, useEffect } from 'react';
import { taxService, TaxReportDetails, TaxMonthlyReport as TaxMonthlyReportType } from '@/services/tax';
import { AlertCircle } from 'lucide-react';
import { formatMoney as formatCurrency } from '@/lib/format';

export default function TaxMonthlyReport() {
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
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg flex gap-3">
        <AlertCircle className="text-red-500 shrink-0 w-5 h-5" />
        <div className="text-red-700 dark:text-red-400 font-medium">
          Não foi possível carregar os dados do imposto.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1 w-28">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ano</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            >
              {generateYears().map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 w-40">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Mês</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            >
              {generateMonths().map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-500 py-8">Carregando relatórios...</div>
      ) : report ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col gap-1">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">DARF a Pagar no Mês</span>
              <span className={`text-2xl font-bold ${report.darf.darf_to_pay > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                {formatCurrency(report.darf.darf_to_pay)}
              </span>
              {report.darf.darf_to_pay === 0 && report.darf.next_month_accumulated > 0 && (
                <span className="text-xs text-slate-400 mt-1">
                  * R$ {formatCurrency(report.darf.next_month_accumulated)} acumulados para o próximo mês (menor que R$ 10).
                </span>
              )}
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col gap-1 items-start">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Vendas Ações (ST)</span>
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(report.sales_total_stocks)}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full mt-1 ${report.is_exempt_stocks_st ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                {report.is_exempt_stocks_st ? 'Isento (< 20k)' : 'Tributável (> 20k)'}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col gap-1">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">Imposto Total Gerado</span>
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{formatCurrency(report.darf.month_tax)}</span>
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Resumo por Categoria</h3>
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 font-medium border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Lucro/Prejuízo Mensal</th>
                  <th className="px-4 py-3">Base Tributável (Após abater perdas)</th>
                  <th className="px-4 py-3">Imposto Gerado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-3">Ações (Swing Trade)</td>
                  <td className={`px-4 py-3 font-medium ${report.profits.stocks_st < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatCurrency(report.profits.stocks_st)}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(report.taxable_profits.stocks_st)}</td>
                  <td className="px-4 py-3">{formatCurrency(report.taxes.stocks_st)}</td>
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-3">Ações (Day Trade)</td>
                  <td className={`px-4 py-3 font-medium ${report.profits.stocks_dt < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatCurrency(report.profits.stocks_dt)}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(report.taxable_profits.stocks_dt)}</td>
                  <td className="px-4 py-3">{formatCurrency(report.taxes.stocks_dt)}</td>
                </tr>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-3">Fundos Imobiliários</td>
                  <td className={`px-4 py-3 font-medium ${report.profits.fiis < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {formatCurrency(report.profits.fiis)}
                  </td>
                  <td className="px-4 py-3">{formatCurrency(report.taxable_profits.fiis)}</td>
                  <td className="px-4 py-3">{formatCurrency(report.taxes.fiis)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">Detalhamento das Vendas</h3>
            {report.details.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm pb-2">Nenhuma venda registrada neste mês.</p>
            ) : (
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 font-medium border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Ativo</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Venda R$</th>
                    <th className="px-4 py-3 text-right">Custo R$</th>
                    <th className="px-4 py-3 text-right">Resultado R$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.details.map((tx: TaxReportDetails) => (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                      <td className="px-4 py-3">{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 font-medium">{tx.ticker}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                          {tx.is_fii ? 'FII' : tx.is_day_trade ? 'Day Trade' : 'Swing Trade'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(tx.sale_value)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(tx.cost_value)}</td>
                      <td className={`px-4 py-3 text-right font-medium ${tx.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(tx.profit)}
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
