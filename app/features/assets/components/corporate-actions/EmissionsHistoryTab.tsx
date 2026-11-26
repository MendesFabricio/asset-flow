'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Asset } from '@/types';
import { AssetEmissionSummary, EmissionRecord } from './types';

interface EmissionsHistoryTabProps {
  assets: Asset[];
  emissionItems: AssetEmissionSummary[];
  emissionsLoading: boolean;
  scanningEmissions: boolean;
  savingEmissionId: number | null;
  money: (v: number) => string;
  onScanAll: () => void;
  onSaveSubscribedQty: (ticker: string, em: EmissionRecord, qty: number) => Promise<boolean>;
}

export function EmissionsHistoryTab({
  assets,
  emissionItems,
  emissionsLoading,
  scanningEmissions,
  savingEmissionId,
  money,
  onScanAll,
  onSaveSubscribedQty,
}: EmissionsHistoryTabProps) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [emissionsFilter, setEmissionsFilter] = useState('');
  const [subscribedDrafts, setSubscribedDrafts] = useState<Record<number, string>>({});

  const query = emissionsFilter.trim().toUpperCase();
  const priceByTicker = new Map(assets.map((a) => [a.ticker, Number(a.preco_atual || 0)]));
  const belowExpected = emissionItems
    .filter((it) => it.current_qty < it.theoretical_qty && (!query || it.ticker.includes(query)))
    .sort((a, b) => b.missed_total_qty - a.missed_total_qty);

  const totalMissed = belowExpected.reduce((acc, it) => acc + it.missed_total_qty, 0);
  const totalCost = belowExpected.reduce((acc, it) => acc + it.total_theoretical_cost, 0);
  const totalBuyTodayCost = belowExpected.reduce(
    (acc, it) => acc + it.missed_total_qty * (priceByTicker.get(it.ticker) || 0),
    0
  );
  const totalMonthlyIncome = belowExpected.reduce((acc, it) => acc + (it.est_monthly_income || 0), 0);
  const totalStoredEmissions = emissionItems.reduce((acc, it) => acc + it.emissions.length, 0);
  const withoutFactorCount = emissionItems.filter(
    (it) => it.current_qty >= it.theoretical_qty && it.emissions.some((em) => em.factor_pct === 0)
  ).length;

  const handleSave = async (itemTicker: string, em: EmissionRecord) => {
    const rawVal = subscribedDrafts[em.id];
    const parsedQty = Math.max(0, Number(rawVal ?? em.subscribed_qty) || 0);
    const ok = await onSaveSubscribedQty(itemTicker, em, parsedQty);
    if (ok) {
      setSubscribedDrafts((prev) => {
        const next = { ...prev };
        delete next[em.id];
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={emissionsFilter}
          onChange={(e) => setEmissionsFilter(e.target.value.toUpperCase())}
          placeholder="Filtrar ticker..."
          className="sm:w-48 bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary outline-none focus:border-accent uppercase"
        />
        <button
          type="button"
          onClick={onScanAll}
          disabled={scanningEmissions}
          className="flex-1 py-2 px-3 rounded-lg bg-accent hover:bg-accent/90 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={scanningEmissions ? 'animate-spin' : ''} />
          {scanningEmissions ? 'Varrendo carteira na B3/CVM...' : 'Atualizar Emissões da Carteira'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-surface-input border border-border-subtle">
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Ativos Abaixo</p>
          <p className="text-lg font-semibold text-text-primary tabular-nums mt-0.5">{belowExpected.length}</p>
        </div>
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/30">
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Cotas Faltantes</p>
          <p className="text-lg font-semibold text-accent tabular-nums mt-0.5">+{totalMissed.toFixed(0)} cotas</p>
          <p className="text-[11px] text-status-success tabular-nums mt-0.5">+{money(totalMonthlyIncome)}/mês est.</p>
        </div>
        <div className="p-3 rounded-xl bg-surface-input border border-border-subtle">
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Custo Subscrições</p>
          <p className="text-lg font-semibold text-text-primary tabular-nums mt-0.5">{money(totalCost)}</p>
        </div>
        <div className="p-3 rounded-xl bg-surface-input border border-border-subtle">
          <p className="text-[11px] uppercase tracking-wider text-text-muted font-medium">Comprar Hoje</p>
          <p className="text-lg font-semibold text-text-primary tabular-nums mt-0.5">{money(totalBuyTodayCost)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface-card overflow-hidden">
        {emissionsLoading ? (
          <p className="p-5 text-xs text-text-muted text-center">Carregando emissões da carteira...</p>
        ) : totalStoredEmissions === 0 ? (
          <p className="p-5 text-xs text-text-muted text-center">
            Nenhuma emissão carregada ainda. Clique em &ldquo;Atualizar Emissões da Carteira&rdquo; para buscar o histórico real na B3/CVM.
          </p>
        ) : belowExpected.length === 0 ? (
          <p className="p-5 text-xs text-text-muted text-center">
            Nenhum ativo está com quantidade abaixo do esperado considerando as emissões reais encontradas.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle max-h-[360px] overflow-y-auto">
            {belowExpected.map((item) => {
              const isExpanded = expandedTicker === item.ticker;
              const validEmissions = item.emissions.filter((em) => em.factor_pct > 0);
              const buyTodayCost = item.missed_total_qty * (priceByTicker.get(item.ticker) || 0);
              const monthlyInc = item.est_monthly_income || 0;
              return (
                <div key={item.ticker}>
                  <button
                    type="button"
                    onClick={() => setExpandedTicker(isExpanded ? null : item.ticker)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-surface-elevated/60 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? <ChevronDown size={14} className="text-text-muted shrink-0" /> : <ChevronRight size={14} className="text-text-muted shrink-0" />}
                      <span className="font-semibold text-sm text-text-primary">{item.ticker}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-input border border-border-subtle text-text-muted">
                        {item.category}
                      </span>
                      <span className="text-[11px] text-text-muted hidden sm:inline">
                        ({validEmissions.length} emissão(ões))
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular-nums shrink-0">
                      <div className="text-right">
                        <span className="text-text-muted block text-[10px]">Atual</span>
                        <span className="text-text-primary font-medium">{item.current_qty}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-text-muted block text-[10px]">Deveria ter</span>
                        <span className="text-accent font-semibold">
                          {item.theoretical_qty}{' '}
                          <span className="text-status-success">(+{item.missed_total_qty})</span>
                        </span>
                      </div>
                      <div className="text-right hidden md:block">
                        <span className="text-text-muted block text-[10px]">Renda/mês</span>
                        <span className="text-status-success font-medium">+{money(monthlyInc)}</span>
                      </div>
                      <div className="text-right hidden md:block">
                        <span className="text-text-muted block text-[10px]">Subscrições</span>
                        <span className="text-text-secondary">{money(item.total_theoretical_cost)}</span>
                      </div>
                      <div className="text-right hidden sm:block">
                        <span className="text-text-muted block text-[10px]">Comprar Hoje</span>
                        <span className="text-text-primary font-medium">{money(buyTodayCost)}</span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="bg-surface-input/60 border-t border-border-subtle overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="border-b border-border-subtle text-[10px] uppercase text-text-muted">
                          <tr>
                            <th className="py-1.5 px-3">Data-Base</th>
                            <th className="py-1.5 px-3">Emissão</th>
                            <th className="py-1.5 px-3 text-right">Na Data</th>
                            <th className="py-1.5 px-3 text-right">Fator</th>
                            <th className="py-1.5 px-3 text-right">Direito</th>
                            <th className="py-1.5 px-3 text-right">Subscritas</th>
                            <th className="py-1.5 px-3 text-right">Preço</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/60">
                          {validEmissions.map((em) => {
                            const draftVal = subscribedDrafts[em.id] ?? String(em.subscribed_qty);
                            const isDirty = Number(draftVal) !== em.subscribed_qty;
                            return (
                              <tr key={em.id}>
                                <td className="py-1.5 px-3 tabular-nums text-text-secondary whitespace-nowrap">{em.date}</td>
                                <td className="py-1.5 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-text-primary">{em.title}</span>
                                    {em.link && (
                                      <a
                                        href={em.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-accent hover:underline shrink-0"
                                        title="Abrir documento oficial B3/CVM"
                                      >
                                        <ExternalLink size={12} />
                                      </a>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{em.base_qty_on_date}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-text-primary">{em.factor_pct}%</td>
                                <td className="py-1.5 px-3 text-right tabular-nums font-semibold text-status-success">
                                  +{em.theoretical_rights_qty}
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={draftVal}
                                      onChange={(e) =>
                                        setSubscribedDrafts((prev) => ({ ...prev, [em.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSave(item.ticker, em);
                                      }}
                                      className="w-16 bg-surface-card border border-border-subtle rounded px-1.5 py-0.5 text-right text-xs text-text-primary tabular-nums outline-none focus:border-accent"
                                      title="Informe quantas cotas você subscreveu nesta emissão"
                                    />
                                    {isDirty && (
                                      <button
                                        type="button"
                                        disabled={savingEmissionId === em.id}
                                        onClick={() => handleSave(item.ticker, em)}
                                        className="p-1 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                                        title="Salvar quantidade subscrita"
                                      >
                                        <Check size={11} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">{money(em.unit_cost)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {withoutFactorCount > 0 && (
        <p className="text-[11px] text-text-muted">
          Nota: {withoutFactorCount} ativo(s) possuem comunicados na CVM/B3 pré-2022 sem fator percentual estruturado no XML.
        </p>
      )}
    </div>
  );
}
