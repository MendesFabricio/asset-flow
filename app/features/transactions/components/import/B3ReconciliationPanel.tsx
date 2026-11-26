'use client';

import { Check, AlertTriangle, Settings, X } from 'lucide-react';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatMoney } from '@/lib/format';
import { ParsedTransaction, B3Tab, parseOption } from './types';

interface B3ReconciliationPanelProps {
  activeTab: B3Tab;
  showOnlyMissing: boolean;
  b3Transactions: ParsedTransaction[];
  dividends: ParsedTransaction[];
  corporateEvents: ParsedTransaction[];
  onChangeTab: (tab: B3Tab) => void;
  onToggleOnlyMissing: (value: boolean) => void;
  onChangeB3Transactions: (txs: ParsedTransaction[]) => void;
  onOpenCorpModal: (ev: ParsedTransaction) => void;
  onIgnoreCorpEvent: (ev: ParsedTransaction) => void;
}

export function B3ReconciliationPanel({
  activeTab,
  showOnlyMissing,
  b3Transactions,
  dividends,
  corporateEvents,
  onChangeTab,
  onToggleOnlyMissing,
  onChangeB3Transactions,
  onOpenCorpModal,
  onIgnoreCorpEvent,
}: B3ReconciliationPanelProps) {
  const { isHidden } = usePrivacy();
  const fmtMoney = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeTab('auditoria')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'auditoria'
                ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-500/5'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Auditoria ({b3Transactions.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('proventos')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'proventos'
                ? 'text-status-success border-b-2 border-emerald-500 bg-emerald-500/5'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Proventos ({dividends.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('eventos')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'eventos'
                ? 'text-accent border-b-2 border-accent bg-accent/5'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Eventos Corporativos ({corporateEvents.length})
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer px-2">
          <input
            type="checkbox"
            checked={showOnlyMissing}
            onChange={(e) => onToggleOnlyMissing(e.target.checked)}
            className="rounded bg-surface-elevated border-border-subtle text-purple-500"
          />
          Ocultar salvos
        </label>
      </div>

      {activeTab === 'auditoria' && (
        <div>
          <div className="text-xs text-text-secondary bg-surface-elevated rounded-lg px-3 py-2 mb-3 border border-border-subtle">
            Compara suas transações da B3 com as Notas de Corretagem já importadas.
          </div>
          <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-elevated text-text-muted border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Ticker</th>
                  <th className="px-3 py-2.5 font-medium">Operação</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {b3Transactions
                  .filter((tx) => !showOnlyMissing || !tx.db_matched)
                  .map((tx, idx) => {
                    const opt = parseOption(tx.ticker);
                    return (
                      <tr key={idx} className={`group ${!tx.db_matched ? 'bg-rose-500/5' : 'hover:bg-surface-elevated/60'}`}>
                        <td className="px-3 py-2">
                          {tx.db_matched ? (
                            <span className="inline-flex items-center gap-1 text-status-success text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded">
                              <Check size={12} /> Bateu
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-status-error text-[10px] font-bold uppercase bg-rose-500/10 px-2 py-0.5 rounded">
                              <AlertTriangle size={12} /> Faltando Nota
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-secondary font-mono">
                          {tx.date ? tx.date.split('-').reverse().join('/') : '-'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-text-primary">
                          {tx.ticker}
                          {opt && (
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 ml-2 rounded text-[8px] font-bold uppercase ${
                                opt.type === 'CALL' ? 'bg-blue-500/10 text-blue-400' : 'bg-fuchsia-500/10 text-fuchsia-400'
                              }`}
                            >
                              {opt.type} {opt.strike}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text-muted text-xs">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...b3Transactions];
                                const realIdx = b3Transactions.findIndex((item) => item === tx);
                                if (realIdx !== -1) {
                                  updated[realIdx] = { ...updated[realIdx], type: tx.type === 'BUY' ? 'SELL' : 'BUY' };
                                  onChangeB3Transactions(updated);
                                }
                              }}
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase cursor-pointer hover:scale-105 transition-all ${
                                tx.type === 'BUY'
                                  ? 'bg-emerald-500/20 text-status-success border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-status-error border border-rose-500/40'
                              }`}
                              title="Clique para alternar entre Compra e Venda"
                            >
                              {tx.type === 'BUY' ? 'C' : 'V'}
                            </button>
                            <span className="text-text-muted text-[11px]">{tx.original_type || tx.type}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-text-secondary">{tx.quantity}</td>
                        <td className="px-3 py-2 text-right font-medium text-text-primary">{fmtMoney(tx.total_value)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'proventos' && (
        <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-elevated text-text-muted border-b border-border-subtle">
              <tr>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Data Pago</th>
                <th className="px-3 py-2.5 font-medium">Ticker</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium text-right">Qtd Ref</th>
                <th className="px-3 py-2.5 font-medium text-right">Valor Líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {dividends
                .filter((div) => !showOnlyMissing || !(div.db_matched || div.error === 'SUCCESS'))
                .map((div, idx) => (
                  <tr key={idx} className="hover:bg-surface-elevated/60">
                    <td className="px-3 py-2">
                      {div.error === 'SUCCESS' || div.db_matched ? (
                        <span className="text-status-success text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">
                          <Check size={12} /> Salvo
                        </span>
                      ) : (
                        <span className="text-status-warning text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-secondary font-mono">
                      {div.date ? div.date.split('-').reverse().join('/') : '-'}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-text-primary">{div.ticker}</td>
                    <td className="px-3 py-2 text-status-success text-xs font-medium uppercase">{div.type}</td>
                    <td className="px-3 py-2 text-right text-text-muted">{div.quantity}</td>
                    <td className="px-3 py-2 text-right font-medium text-status-success">{fmtMoney(div.total_value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'eventos' && (
        <div>
          <div className="text-xs text-accent bg-accent-soft rounded-lg px-3 py-2 mb-3">
            Eventos corporativos detectados no seu extrato. Clique em <strong>Configurar Evento</strong> para revisar os parâmetros (fator, percentual ou novo ticker) e registrá-lo.
          </div>
          <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-elevated text-text-muted border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Ticker</th>
                  <th className="px-3 py-2.5 font-medium">Evento</th>
                  <th className="px-3 py-2.5 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2.5 font-medium text-right">Fração (R$)</th>
                  <th className="px-3 py-2.5 font-medium text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {corporateEvents
                  .filter((ev) => !showOnlyMissing || !(ev.db_matched || ev.error === 'SUCCESS'))
                  .map((ev, idx) => (
                    <tr key={idx} className="hover:bg-surface-elevated/60">
                      <td className="px-3 py-2">
                        {ev.db_matched || ev.error === 'SUCCESS' ? (
                          <span className="text-status-success text-[10px] font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">
                            <Check size={12} /> Registrado
                          </span>
                        ) : (
                          <span className="text-status-warning text-[10px] font-bold uppercase bg-amber-500/10 px-2 py-0.5 rounded flex w-fit items-center gap-1">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-secondary font-mono">
                        {ev.date ? ev.date.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-text-primary">{ev.ticker}</td>
                      <td className="px-3 py-2 text-accent text-xs font-medium">{ev.type}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">{ev.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium text-text-primary">{fmtMoney(ev.total_value)}</td>
                      <td className="px-3 py-2 text-center">
                        {!(ev.db_matched || ev.error === 'SUCCESS') && (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenCorpModal(ev)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-accent-soft hover:bg-accent/20 text-accent border border-accent/30 rounded-md transition-colors inline-flex items-center gap-1"
                            >
                              <Settings size={12} /> Configurar Evento
                            </button>
                            <button
                              type="button"
                              onClick={() => onIgnoreCorpEvent(ev)}
                              className="p-1 text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded transition-colors"
                              title="Ignorar evento"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
