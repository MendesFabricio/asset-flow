'use client';

import React from 'react';
import { Trash2, AlertCircle } from 'lucide-react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatMoney } from '@/lib/format';
import { ParsedTransaction, parseOption } from './types';

interface BrokeragePreviewTableProps {
  transactions: ParsedTransaction[];
  onChangeTransactions: (txs: ParsedTransaction[]) => void;
  onRemoveTransaction: (idx: number) => void;
}

export function BrokeragePreviewTable({
  transactions,
  onChangeTransactions,
  onRemoveTransaction,
}: BrokeragePreviewTableProps) {
  const { isHidden } = usePrivacy();
  const fmtMoney = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));

  return (
    <div className="space-y-4">
      <div className="text-xs text-status-warning bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
        ⚠️ As notas SINACOR mostram o <strong>nome abreviado</strong> da empresa, não o ticker. Verifique e corrija os tickers antes de importar.
      </div>
      <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-card">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-elevated text-text-secondary border-b border-border-subtle">
            <tr>
              <th className="px-3 py-2.5 font-medium">Op.</th>
              <th className="px-3 py-2.5 font-medium">Data</th>
              <th className="px-3 py-2.5 font-medium">
                Ticker <span className="text-status-warning">(editável)</span>
              </th>
              <th className="px-3 py-2.5 font-medium">Categoria</th>
              <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
              <th className="px-3 py-2.5 font-medium text-right">Total</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {transactions.map((tx, idx) => {
              if (tx.error === 'SUCCESS') return null;
              const opt = parseOption(tx.ticker);
              return (
                <React.Fragment key={idx}>
                  <tr className={`group ${tx.error ? 'bg-rose-500/5' : 'hover:bg-surface-elevated/60'}`}>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          tx.type === 'BUY'
                            ? 'bg-emerald-500/10 text-status-success'
                            : 'bg-rose-500/10 text-status-error'
                        }`}
                      >
                        {tx.type === 'BUY' ? 'C' : 'V'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary font-mono">
                      {tx.date ? tx.date.split('-').reverse().join('/') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={tx.ticker}
                        onChange={(e) => {
                          const updated = [...transactions];
                          updated[idx] = { ...updated[idx], ticker: e.target.value.toUpperCase() };
                          onChangeTransactions(updated);
                        }}
                        placeholder="Ex: PETR4"
                        className="w-24 bg-surface-elevated border border-border-subtle rounded px-2 py-1 text-xs font-mono font-bold text-text-primary focus:outline-none focus:border-accent"
                      />
                      {tx.name && <div className="text-[9px] text-text-muted mt-0.5 truncate max-w-[100px]">{tx.name}</div>}
                      {opt && (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 mt-0.5 rounded text-[8px] font-bold uppercase ${
                            opt.type === 'CALL' ? 'bg-blue-500/10 text-blue-400' : 'bg-fuchsia-500/10 text-fuchsia-400'
                          }`}
                        >
                          {opt.type} {opt.strike}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={tx.category || 'Ação'}
                        onChange={(e) => {
                          const updated = [...transactions];
                          updated[idx] = { ...updated[idx], category: e.target.value };
                          onChangeTransactions(updated);
                        }}
                        className="bg-surface-elevated border border-border-subtle rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                      >
                        <option value="Ação">Ação</option>
                        <option value="FII">FII</option>
                        <option value="Renda Fixa">Renda Fixa</option>
                        <option value="Internacional">Internacional</option>
                        <option value="Cripto">Cripto</option>
                        <option value="Opções">Opções</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">{tx.quantity}</td>
                    <td className="px-3 py-2 text-right font-medium text-text-primary">{fmtMoney(tx.total_value)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveTransaction(idx)}
                        className="text-text-muted hover:text-status-error transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  {tx.error && (
                    <tr className="bg-rose-500/5">
                      <td colSpan={7} className="px-3 py-1.5 text-xs text-status-error border-t-0 flex justify-between items-center">
                        <span>
                          <AlertCircle size={12} className="inline mr-1" /> {tx.error.replace('DUPLICATE_ERROR:', '').trim()}
                        </span>
                        {tx.error.includes('DUPLICATE_ERROR') && (
                          <label className="flex items-center gap-2 cursor-pointer text-status-warning bg-amber-500/10 px-2 py-1 rounded">
                            <input
                              type="checkbox"
                              checked={!!tx.force_duplicate}
                              onChange={() => {
                                const updated = [...transactions];
                                updated[idx] = { ...updated[idx], force_duplicate: !updated[idx].force_duplicate };
                                onChangeTransactions(updated);
                              }}
                              className="rounded bg-surface border-amber-500/50 text-amber-500"
                            />
                            Forçar importação
                          </label>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
