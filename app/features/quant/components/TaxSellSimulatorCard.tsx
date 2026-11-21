'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator, Flame, Scissors, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import type { Asset } from '@/types';

interface SaleDraft {
  ticker: string;
  quantity: number;
}

interface SellSimulationResponse {
  status: string;
  period: string;
  proceeds_total: number;
  simulated_items: {
    ticker: string;
    category: string;
    quantity_sold: number;
    unit_price: number;
    gross_proceeds: number;
    gain_loss: number;
  }[];
  tax_impact: {
    existing_stock_sales: number;
    simulated_stock_sales: number;
    total_month_stock_sales: number;
    stock_exemption_limit: number;
    remaining_exemption: number;
    breaks_20k_exemption: boolean;
    is_exempt_stocks_after: boolean;
    month_tax_before: number;
    month_tax_after: number;
    estimated_darf_delta: number;
    net_proceeds_after_tax: number;
    accumulated_losses_available: {
      stocks_st: number;
      stocks_dt: number;
      fiis: number;
    };
  };
  rebalance_impact: {
    ticker: string;
    category: string;
    weight_before_pct: number;
    weight_after_pct: number;
    delta_pp: number;
  }[];
  tax_loss_harvesting: {
    ticker: string;
    category: string;
    quantity: number;
    avg_price: number;
    current_price: number;
    unrealized_loss: number;
    unrealized_loss_pct: number;
    tax_bucket: string;
    potential_tax_savings: number;
  }[];
}

export default function TaxSellSimulatorCard({ ativos = [] }: { ativos?: Asset[] }) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const sellableAssets = useMemo(
    () => ativos.filter((a) => Number(a.qtd) > 0 && a.tipo !== 'Reserva'),
    [ativos]
  );

  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [qtyInput, setQtyInput] = useState<string>('');
  const [sales, setSales] = useState<SaleDraft[]>([]);
  const [simResult, setSimResult] = useState<SellSimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTicker && sellableAssets.length > 0) {
      setSelectedTicker(sellableAssets[0].ticker);
    }
  }, [sellableAssets, selectedTicker]);

  useEffect(() => {
    apiCall<SellSimulationResponse>('/api/simulation/tax-thermometer')
      .then((res) => {
        if (res.status === 'Sucesso') setSimResult(res);
      })
      .catch(() => {});
  }, []);

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  const runSimulation = async (drafts: SaleDraft[]) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiCall<SellSimulationResponse>('/api/simulation/sell', {
        method: 'POST',
        body: JSON.stringify({ sales: drafts }),
      });
      if (res.status === 'Sucesso') setSimResult(res);
      else setErrorMsg('Erro ao calcular impacto tributário.');
    } catch {
      setErrorMsg('Falha ao conectar com o simulador tributário.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrUpdateSale = (ticker: string, qty: number) => {
    if (!ticker || qty <= 0) return;
    const next = [...sales.filter((s) => s.ticker !== ticker), { ticker, quantity: qty }];
    setSales(next);
    runSimulation(next);
  };

  const handleRemoveSale = (ticker: string) => {
    const next = sales.filter((s) => s.ticker !== ticker);
    setSales(next);
    runSimulation(next);
  };

  const activeAsset = sellableAssets.find((a) => a.ticker === selectedTicker);
  const totalSales = simResult?.tax_impact.total_month_stock_sales ?? 0;
  const limit = simResult?.tax_impact.stock_exemption_limit ?? 20000;
  const pctUsed = Math.min(100, (totalSales / limit) * 100);
  const isOverLimit = totalSales > limit;

  return (
    <Card className="p-6 mt-6 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="text-accent" size={18} />
          <div>
            <h3 className="font-semibold text-text-primary text-sm uppercase tracking-wider">
              Simulador de Venda, Isenção R$ 20k &amp; Tax-Loss Harvesting
            </h3>
            <p className="text-xs text-text-muted">
              Simule vendas antes de executar na corretora: previna perda da isenção de ações e compense DARF com prejuízos.
            </p>
          </div>
        </div>
        {simResult && (
          <div className="text-right text-xs">
            <span className="text-text-muted block">Competência {simResult.period}</span>
            <span className="font-semibold text-text-primary tabular-nums">
              Prejuízo comp. Ações: {maskMoney(simResult.tax_impact.accumulated_losses_available.stocks_st)} · FIIs:{' '}
              {maskMoney(simResult.tax_impact.accumulated_losses_available.fiis)}
            </span>
          </div>
        )}
      </div>

      {/* Termômetro R$ 20k */}
      {simResult && (
        <div className="p-4 rounded-xl bg-surface border border-border-subtle space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold flex items-center gap-1.5 text-text-primary">
              <Flame size={14} className={isOverLimit ? 'text-status-error' : 'text-status-warning'} />
              Termômetro de Isenção em Ações (Swing Trade)
            </span>
            <span className={`font-semibold tabular-nums ${isOverLimit ? 'text-status-error' : 'text-status-success'}`}>
              {maskMoney(totalSales)} / {maskMoney(limit)}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-surface-card overflow-hidden border border-border-subtle">
            <div
              className={`h-full transition-[width] duration-300 ${
                isOverLimit ? 'bg-status-error' : pctUsed > 75 ? 'bg-status-warning' : 'bg-status-success'
              }`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
          {simResult.tax_impact.breaks_20k_exemption && (
            <div className="flex items-start gap-2 text-xs text-status-error pt-1">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                Atenção: essa simulação ultrapassa R$ 20.000/mês em vendas de ações, tornando tributável (15%) todo o lucro líquido do mês no segmento!
              </span>
            </div>
          )}
        </div>
      )}

      {/* Formulário de venda simulada */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="text-2xs font-semibold uppercase tracking-wider text-text-muted block mb-1">
            Ativo em Carteira
          </label>
          <select
            value={selectedTicker}
            onChange={(e) => {
              setSelectedTicker(e.target.value);
              setQtyInput('');
            }}
            className="w-full rounded-lg bg-surface border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          >
            {sellableAssets.map((a) => (
              <option key={a.ticker} value={a.ticker}>
                {a.ticker} ({a.tipo}) · {a.qtd} un.
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-2xs font-semibold uppercase tracking-wider text-text-muted block mb-1">
            Quantidade {activeAsset ? `(máx ${activeAsset.qtd})` : ''}
          </label>
          <input
            type="number"
            min="0"
            max={activeAsset?.qtd}
            step="any"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            placeholder={activeAsset ? String(Math.max(1, Math.floor(activeAsset.qtd / 2))) : '0'}
            className="w-full rounded-lg bg-surface border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-accent tabular-nums"
          />
        </div>

        <button
          type="button"
          disabled={!selectedTicker || loading || !(parseFloat(qtyInput) > 0)}
          onClick={() => handleAddOrUpdateSale(selectedTicker, parseFloat(qtyInput))}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-40"
        >
          <Plus size={14} />
          Simular Venda
        </button>
      </div>

      {activeAsset && (
        <div className="flex flex-wrap gap-2 text-2xs">
          {[0.25, 0.5, 1].map((pct) => {
            const suggestedQty =
              activeAsset.tipo === 'Cripto' || activeAsset.tipo === 'Internacional'
                ? Number((activeAsset.qtd * pct).toFixed(4))
                : Math.max(1, Math.floor(activeAsset.qtd * pct));
            return (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setQtyInput(String(suggestedQty));
                  handleAddOrUpdateSale(activeAsset.ticker, suggestedQty);
                }}
                className="px-2.5 py-1 rounded-md border border-border-subtle bg-surface hover:border-accent/50 text-text-muted hover:text-text-primary transition-colors tabular-nums"
              >
                Vender {Math.round(pct * 100)}% ({suggestedQty})
              </button>
            );
          })}
        </div>
      )}

      {errorMsg && <p className="text-xs text-status-error">{errorMsg}</p>}

      {/* Itens na simulação + Impacto Financeiro */}
      {sales.length > 0 && simResult && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {simResult.simulated_items.map((item) => (
              <div
                key={item.ticker}
                className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-text-primary">{item.ticker}</span>
                <span className="text-text-muted tabular-nums">{item.quantity_sold} un.</span>
                <span className={`font-semibold tabular-nums ${item.gain_loss >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                  {item.gain_loss >= 0 ? '+' : ''}
                  {maskMoney(item.gain_loss)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveSale(item.ticker)}
                  aria-label={`Remover ${item.ticker}`}
                  className="text-text-muted hover:text-status-error transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-surface border border-border-subtle">
              <span className="text-2xs uppercase text-text-muted block">Caixa Bruto Gerado</span>
              <span className="text-base font-semibold text-text-primary tabular-nums">{maskMoney(simResult.proceeds_total)}</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border-subtle">
              <span className="text-2xs uppercase text-text-muted block">DARF Adicional Estimada</span>
              <span className="text-base font-semibold text-status-error tabular-nums">
                {maskMoney(simResult.tax_impact.estimated_darf_delta)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border-subtle">
              <span className="text-2xs uppercase text-text-muted block">Caixa Líquido Pós-IR</span>
              <span className="text-base font-semibold text-status-success tabular-nums">
                {maskMoney(simResult.tax_impact.net_proceeds_after_tax)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Oportunidades de Tax-Loss Harvesting (F5) */}
      {simResult && simResult.tax_loss_harvesting.length > 0 && (
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Scissors size={15} className="text-status-success" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary">
              Oportunidades de Tax-Loss Harvesting (Compensação Fiscal)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-2xs uppercase text-text-muted">
                  <th className="py-2">Ativo</th>
                  <th className="py-2">Bucket</th>
                  <th className="py-2 text-right">Prejuízo Latente</th>
                  <th className="py-2 text-right">Economia Est. DARF</th>
                  <th className="py-2 text-right">Simular</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {simResult.tax_loss_harvesting.map((cand) => (
                  <tr key={cand.ticker}>
                    <td className="py-2 font-semibold text-text-primary">{cand.ticker}</td>
                    <td className="py-2 text-text-muted">{cand.tax_bucket}</td>
                    <td className="py-2 text-right text-status-error font-semibold tabular-nums">
                      {maskMoney(cand.unrealized_loss)} ({cand.unrealized_loss_pct.toFixed(1)}%)
                    </td>
                    <td className="py-2 text-right text-status-success font-semibold tabular-nums">
                      {maskMoney(cand.potential_tax_savings)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleAddOrUpdateSale(cand.ticker, cand.quantity)}
                        className="px-2 py-1 rounded-md border border-border-subtle hover:border-status-success/50 text-2xs font-semibold uppercase text-text-primary transition-colors"
                      >
                        Colher 100%
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
