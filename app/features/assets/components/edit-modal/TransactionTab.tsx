'use client';

import React from 'react';
import { Asset } from '@/types';
import { ReservaActionMode } from './helpers';

interface TransactionTabProps {
  ativo: Asset;
  isReserva: boolean;
  loading: boolean;
  txError: string | null;
  money: (val: number) => string;
  reservaMode: ReservaActionMode;
  reservaAmount: string;
  reservaCurrentBalance: number;
  reservaCurrentInvested: number;
  reservaPreview: {
    nextBalance: number;
    nextInvested: number;
    profit: number;
    profitPct: number;
    error: string | null;
  };
  onReservaModeChange: (mode: ReservaActionMode) => void;
  onReservaAmountChange: (val: string) => void;
  onSaveReserva: () => void;
  txData: { type: string; quantity: number; unit_price: number; date: string };
  onTxChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSelectTxType: (type: 'BUY' | 'SELL') => void;
  onUseMaxQuantity: () => void;
  onSaveTransaction: () => void;
  onClose: () => void;
}

export function TransactionTab({
  ativo,
  isReserva,
  loading,
  txError,
  money,
  reservaMode,
  reservaAmount,
  reservaCurrentBalance,
  reservaCurrentInvested,
  reservaPreview,
  onReservaModeChange,
  onReservaAmountChange,
  onSaveReserva,
  txData,
  onTxChange,
  onSelectTxType,
  onUseMaxQuantity,
  onSaveTransaction,
  onClose,
}: TransactionTabProps) {
  const isBrazilianExchange = ['Ação', 'FII', 'ETF', 'BDR'].includes(ativo.tipo);

  if (isReserva) {
    return (
      <div className="space-y-4">
        {txError && (
          <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-md text-status-error text-sm">
            {txError}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-surface-elevated border border-border-subtle">
          <div>
            <p className="text-[10px] uppercase font-bold text-text-muted">Saldo Atual</p>
            <p className="text-sm font-mono font-bold text-text-primary mt-0.5">{money(reservaCurrentBalance)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-text-muted">Investido</p>
            <p className="text-sm font-mono font-semibold text-text-secondary mt-0.5">{money(reservaCurrentInvested)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-text-muted">Rendimento</p>
            <p
              className={`text-sm font-mono font-bold mt-0.5 ${
                reservaCurrentBalance - reservaCurrentInvested >= 0 ? 'text-status-success' : 'text-status-error'
              }`}
            >
              {reservaCurrentBalance - reservaCurrentInvested >= 0 ? '+' : ''}
              {money(reservaCurrentBalance - reservaCurrentInvested)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface-elevated border border-border-subtle">
          {([
            { id: 'BALANCE', label: 'Atualizar Saldo' },
            { id: 'DEPOSIT', label: 'Depositar' },
            { id: 'WITHDRAW', label: 'Resgatar' },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onReservaModeChange(item.id)}
              className={`py-2 px-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${
                reservaMode === item.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-input/40'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm text-text-secondary">
              {reservaMode === 'BALANCE'
                ? 'Novo Saldo Atual (R$)'
                : reservaMode === 'DEPOSIT'
                  ? 'Valor do Depósito (R$)'
                  : 'Valor do Resgate (R$)'}
            </label>
            {reservaMode === 'WITHDRAW' && reservaCurrentBalance > 0 && (
              <button
                type="button"
                onClick={() => onReservaAmountChange(reservaCurrentBalance.toFixed(2))}
                className="text-[10px] font-bold uppercase tracking-wider text-accent hover:underline"
              >
                Resgatar tudo
              </button>
            )}
          </div>
          <input
            type="number"
            value={reservaAmount}
            onChange={(e) => onReservaAmountChange(e.target.value)}
            className="w-full bg-surface-input border border-border-subtle rounded-lg p-3 text-text-primary font-mono text-base focus:border-accent focus:outline-none transition-all"
            placeholder="Ex: 500.00"
            step="0.01"
            min="0"
          />
        </div>

        {!reservaPreview.error && (
          <div className="p-3 rounded-xl bg-surface-elevated/60 border border-border-subtle text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-text-muted">Novo saldo:</span>
              <span className="font-mono font-bold text-text-primary">{money(reservaPreview.nextBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Novo investido:</span>
              <span className="font-mono text-text-secondary">{money(reservaPreview.nextInvested)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Rendimento acumulado:</span>
              <span className={`font-mono font-semibold ${reservaPreview.profit >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                {reservaPreview.profit >= 0 ? '+' : ''}
                {money(reservaPreview.profit)} ({reservaPreview.profitPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSaveReserva}
            disabled={loading}
            className="inline-flex justify-center items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading
              ? 'Salvando...'
              : reservaMode === 'BALANCE'
                ? 'Atualizar Saldo'
                : reservaMode === 'DEPOSIT'
                  ? 'Confirmar Depósito'
                  : 'Confirmar Resgate'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {txError && (
        <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-md text-status-error text-sm">
          {txError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm text-text-muted">Tipo</label>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-elevated border border-border-subtle">
            {([
              { id: 'BUY', label: 'Compra', activeClass: 'bg-emerald-600 text-white shadow-sm' },
              { id: 'SELL', label: 'Venda', activeClass: 'bg-rose-600 text-white shadow-sm' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectTxType(opt.id)}
                className={`py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  txData.type === opt.id
                    ? opt.activeClass
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-input/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-text-muted">Data (Opcional)</label>
          <input
            type="date"
            name="date"
            value={txData.date}
            onChange={onTxChange}
            className="w-full bg-surface-input border border-border-subtle rounded-xl p-3 text-text-primary focus:border-accent outline-none transition-all text-sm shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm text-text-muted">Quantidade</label>
            {txData.type === 'SELL' && Number(ativo.qtd || 0) > 0 && (
              <button
                type="button"
                onClick={onUseMaxQuantity}
                className="text-[11px] font-bold text-status-error hover:underline font-mono"
                title="Usar quantidade máxima disponível para venda"
              >
                Máx: {ativo.qtd}
              </button>
            )}
          </div>
          <input
            type="number"
            name="quantity"
            value={txData.quantity || ''}
            onChange={onTxChange}
            max={txData.type === 'SELL' ? Number(ativo.qtd || 0) : undefined}
            min="0"
            className="w-full bg-surface-input border border-border-subtle rounded-xl p-3 text-text-primary font-mono focus:border-accent outline-none transition-all shadow-sm"
            placeholder="Ex: 100"
            step={isBrazilianExchange ? '1' : 'any'}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-text-muted">Preço Un. (R$)</label>
          <input
            type="number"
            name="unit_price"
            value={txData.unit_price || ''}
            onChange={onTxChange}
            className="w-full bg-surface-input border border-border-subtle rounded-xl p-3 text-text-primary font-mono focus:border-accent outline-none transition-all shadow-sm"
            placeholder="Ex: 15.50"
            step="0.01"
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-border-subtle">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSaveTransaction}
          disabled={loading}
          className="inline-flex justify-center items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Salvando...' : 'Salvar Transação'}
        </button>
      </div>
    </div>
  );
}
