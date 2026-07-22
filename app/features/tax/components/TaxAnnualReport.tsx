"use client";

import { useState, useEffect } from 'react';
import { taxService, AnnualTaxReport } from '@/services/tax';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { formatMoney as formatCurrency } from '@/lib/format';

export default function TaxAnnualReport() {
  const [year, setYear] = useState<string>((new Date().getFullYear() - 1).toString());
  const [report, setReport] = useState<AnnualTaxReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    taxService.getAnnualTax(parseInt(year))
      .then(data => setReport(data))
      .catch(err => {
        console.error(err);
        setError(true);
      })
      .finally(() => setIsLoading(false));
  }, [year]);

  const generateYears = () => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => (current - i).toString());
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg flex gap-3">
        <AlertCircle className="text-red-500 shrink-0 w-5 h-5" />
        <div className="text-red-700 dark:text-red-400 font-medium">
          Não foi possível carregar os dados da declaração anual.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Ano-Calendário</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Ano de referência para a declaração (o ano em que os fatos ocorreram).</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium w-32"
        >
          {generateYears().map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-slate-500 py-8 text-center">Calculando declaração anual completa... isso pode levar alguns segundos.</div>
      ) : report ? (
        <div className="flex flex-col gap-6">
          
          {/* Bens e Direitos */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Ficha: Bens e Direitos (Posição em 31/12)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Copie o texto da discriminação para colar no programa da Receita.</p>
            </div>
            
            {report.bens_e_direitos.length === 0 ? (
              <div className="p-6 text-center text-slate-500">Nenhum ativo em carteira no dia 31/12 deste ano.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.bens_e_direitos.map((asset) => (
                  <div key={asset.ticker} className="p-4 flex flex-col gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 dark:text-slate-100">{asset.ticker}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {asset.category}
                          </span>
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400">CNPJ: {asset.cnpj}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(asset.total_cost)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Qtde: {asset.quantity} | PM: {formatCurrency(asset.average_price)}</div>
                      </div>
                    </div>
                    
                    <div className="relative group">
                      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg pr-12 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {asset.description}
                      </div>
                      <button
                        onClick={() => copyToClipboard(asset.description, asset.ticker)}
                        className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors"
                        title="Copiar texto"
                      >
                        {copiedId === asset.ticker ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rendimentos Isentos */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Ficha: Rendimentos Isentos e Não Tributáveis</h3>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Dividendos</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{formatCurrency(report.rendimentos_isentos.dividendos)}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Lucro Ações (Vendas até 20k)</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{formatCurrency(report.rendimentos_isentos.lucro_vendas_20k)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-bold text-slate-800 dark:text-slate-100">Total Isento</span>
                  <span className="font-bold text-green-600 dark:text-green-400">{formatCurrency(report.rendimentos_isentos.total)}</span>
                </div>
              </div>
            </div>

            {/* Tributação Exclusiva */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">Ficha: Tributação Exclusiva/Definitiva</h3>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Juros Sobre Capital Próprio (JCP)</span>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{formatCurrency(report.rendimentos_exclusivos.jcp)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 mt-auto">
                  <span className="font-bold text-slate-800 dark:text-slate-100">Total Exclusivo</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(report.rendimentos_exclusivos.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Renda Variável */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Ficha: Renda Variável (Operações Comuns / Day-Trade)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Resumo mês a mês para preenchimento. Atenção ao IRRF (Dedo Duro) que pode ser deduzido no imposto devido!</p>
            </div>
            
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 font-medium border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Ações (ST)</th>
                  <th className="px-4 py-3 text-right">Ações (DT)</th>
                  <th className="px-4 py-3 text-right">FIIs</th>
                  <th className="px-4 py-3 text-right">IRRF (Dedo Duro)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {report.renda_variavel.map((mes) => {
                  const total_irrf = mes.irrf_st + mes.irrf_dt + mes.irrf_fii;
                  return (
                    <tr key={mes.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-medium">{mes.month}/{report.year}</td>
                      <td className={`px-4 py-3 text-right ${mes.profit_st < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'} ${mes.is_exempt_st && mes.profit_st > 0 ? 'opacity-50' : ''}`} title={mes.is_exempt_st ? 'Isento (Vendas < 20k)' : ''}>
                        {formatCurrency(mes.profit_st)}
                      </td>
                      <td className={`px-4 py-3 text-right ${mes.profit_dt < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(mes.profit_dt)}
                      </td>
                      <td className={`px-4 py-3 text-right ${mes.profit_fii < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(mes.profit_fii)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 dark:text-slate-200">
                        {total_irrf > 0 ? formatCurrency(total_irrf) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      ) : null}
    </div>
  );
}
