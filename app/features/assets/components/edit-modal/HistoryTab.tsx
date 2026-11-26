'use client';

import { Trash2 } from 'lucide-react';
import { AssetTransaction } from '@/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { getTransactionDisplayMeta } from './helpers';

interface HistoryTabProps {
  loadingHistory: boolean;
  transactions: AssetTransaction[];
  money: (val: number) => string;
  onDeleteTransaction: (txId: number) => void;
}

export function HistoryTab({ loadingHistory, transactions, money, onDeleteTransaction }: HistoryTabProps) {
  return (
    <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
      {loadingHistory ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : transactions.length > 0 ? (
        <div className="border border-border-subtle rounded-lg overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-elevated text-text-muted uppercase tracking-wider border-b border-border-subtle">
              <tr>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2 text-right">Qtd</th>
                <th className="px-2 py-2 text-right">Preço</th>
                <th className="px-2 py-2 text-center w-9">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {transactions.map((tx) => {
                const txMeta = getTransactionDisplayMeta(tx);
                return (
                  <tr key={tx.id} className="hover:bg-surface-input/40">
                    <td className="px-2 py-2 text-text-primary whitespace-nowrap">
                      {new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${txMeta.badgeClass}`}>
                        {txMeta.label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-text-primary font-mono whitespace-nowrap">
                      <div>{txMeta.quantityDisplay}</div>
                      {txMeta.quantitySubtext && (
                        <div className="text-[10px] text-text-muted leading-tight">{txMeta.quantitySubtext}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-text-primary font-mono whitespace-nowrap">
                      {money(tx.unit_price)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(tx.id)}
                        title="Apagar esta transação"
                        className="p-1 text-text-muted hover:text-status-error hover:bg-status-error/10 rounded transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10 text-text-muted text-sm">
          Nenhuma transação encontrada.
        </div>
      )}
    </div>
  );
}
