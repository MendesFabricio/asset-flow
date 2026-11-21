"use client";

import { useState, useEffect } from 'react';
import { taxService, AnnualTaxReport } from '@/services/tax';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { formatMoney as formatCurrency } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';

export default function TaxAnnualReport() {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatCurrency(v));
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
      <div className="bg-status-error/10 border border-status-error/30 p-4 rounded-xl flex gap-3">
        <AlertCircle className="text-status-error shrink-0 w-5 h-5" />
        <div className="text-status-error font-medium">
          Não foi possível carregar os dados da declaração anual.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">Ano-Calendário</h3>
          <p className="text-sm text-text-muted">Ano de referência para a declaração (o ano em que os fatos ocorreram).</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-4 py-2 bg-surface-input border border-border-subtle rounded-lg text-text-primary font-medium w-32 tabular-nums"
        >
          {generateYears().map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-text-muted py-8 text-center">Calculando declaração anual completa... isso pode levar alguns segundos.</div>
      ) : report ? (
        <div className="flex flex-col gap-6">
          
          {/* Bens e Direitos */}
          <div className="bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-hidden">
            <div className="bg-surface-input px-4 py-3 border-b border-border-subtle">
              <h3 className="font-semibold text-text-primary">Ficha: Bens e Direitos (Posição em 31/12)</h3>
              <p className="text-xs text-text-muted">Copie o texto da discriminação para colar no programa da Receita.</p>
            </div>
            
            {report.bens_e_direitos.length === 0 ? (
              <div className="p-6 text-center text-text-muted">Nenhum ativo em carteira no dia 31/12 deste ano.</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {report.bens_e_direitos.map((asset) => (
                  <div key={asset.ticker} className="p-4 flex flex-col gap-3 hover:bg-surface-input/40">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text-primary">{asset.ticker}</span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-surface-input text-text-muted border border-border-subtle">
                            {asset.category}
                          </span>
                        </div>
                        <span className="text-sm text-text-muted">CNPJ: {asset.cnpj}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-text-primary tabular-nums">{money(asset.total_cost)}</div>
                        <div className="text-xs text-text-muted tabular-nums">Qtde: {asset.quantity} | PM: {money(asset.average_price)}</div>
                      </div>
                    </div>
                    
                    <div className="relative group">
                      <div className="bg-surface-input p-3 rounded-lg pr-12 text-sm text-text-primary border border-border-subtle">
                        {isHidden ? 'Discriminação oculta no modo privacidade.' : asset.description}
                      </div>
                      <button
                        onClick={() => copyToClipboard(asset.description, asset.ticker)}
                        className="absolute right-2 top-2 p-1.5 text-text-muted hover:text-accent hover:bg-surface-elevated rounded-lg transition-colors"
                        title="Copiar texto"
                      >
                        {copiedId === asset.ticker ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rendimentos Isentos */}
            <div className="bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-hidden">
              <div className="bg-surface-input px-4 py-3 border-b border-border-subtle">
                <h3 className="font-semibold text-text-primary">Ficha: Rendimentos Isentos e Não Tributáveis</h3>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
                  <span className="text-sm text-text-muted">Dividendos</span>
                  <span className="font-medium text-text-primary tabular-nums">{money(report.rendimentos_isentos.dividendos)}</span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
                  <span className="text-sm text-text-muted">Lucro Ações (Vendas até 20k)</span>
                  <span className="font-medium text-text-primary tabular-nums">{money(report.rendimentos_isentos.lucro_vendas_20k)}</span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="font-semibold text-text-primary">Total Isento</span>
                  <span className="font-semibold text-status-success tabular-nums">{money(report.rendimentos_isentos.total)}</span>
                </div>
              </div>
            </div>

            {/* Tributação Exclusiva */}
            <div className="bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-hidden">
              <div className="bg-surface-input px-4 py-3 border-b border-border-subtle">
                <h3 className="font-semibold text-text-primary">Ficha: Tributação Exclusiva/Definitiva</h3>
              </div>
              <div className="p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
                  <span className="text-sm text-text-muted">Juros Sobre Capital Próprio (JCP)</span>
                  <span className="font-medium text-text-primary tabular-nums">{money(report.rendimentos_exclusivos.jcp)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 mt-auto">
                  <span className="font-semibold text-text-primary">Total Exclusivo</span>
                  <span className="font-semibold text-accent tabular-nums">{money(report.rendimentos_exclusivos.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Renda Variável */}
          <div className="bg-surface-card border border-border-subtle rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <div className="bg-surface-input px-4 py-3 border-b border-border-subtle">
              <h3 className="font-semibold text-text-primary">Ficha: Renda Variável (Operações Comuns / Day-Trade)</h3>
              <p className="text-xs text-text-muted">Resumo mês a mês para preenchimento. Atenção ao IRRF (Dedo Duro) que pode ser deduzido no imposto devido!</p>
            </div>
            
            <table className="w-full text-left text-sm text-text-primary">
              <thead className="bg-surface-input/60 text-text-muted font-medium border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3">Mês</th>
                  <th className="px-4 py-3 text-right">Ações (ST)</th>
                  <th className="px-4 py-3 text-right">Ações (DT)</th>
                  <th className="px-4 py-3 text-right">FIIs</th>
                  <th className="px-4 py-3 text-right">IRRF (Dedo Duro)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {report.renda_variavel.map((mes) => {
                  const total_irrf = mes.irrf_st + mes.irrf_dt + mes.irrf_fii;
                  return (
                    <tr key={mes.month} className="hover:bg-surface-input/40">
                      <td className="px-4 py-3 font-medium tabular-nums">{mes.month}/{report.year}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${mes.profit_st < 0 ? 'text-status-error' : 'text-status-success'} ${mes.is_exempt_st && mes.profit_st > 0 ? 'opacity-50' : ''}`} title={mes.is_exempt_st ? 'Isento (Vendas < 20k)' : ''}>
                        {money(mes.profit_st)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${mes.profit_dt < 0 ? 'text-status-error' : 'text-status-success'}`}>
                        {money(mes.profit_dt)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${mes.profit_fii < 0 ? 'text-status-error' : 'text-status-success'}`}>
                        {money(mes.profit_fii)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-text-primary tabular-nums">
                        {total_irrf > 0 ? money(total_irrf) : '-'}
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
