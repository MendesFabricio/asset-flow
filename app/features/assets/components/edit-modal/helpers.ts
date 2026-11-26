import { AssetTransaction } from '@/types';

export const TX_TYPE_LABELS: Record<string, string> = {
  BUY: 'COMPRA',
  SELL: 'VENDA',
  BONUS: 'BONIFICAÇÃO',
  SPLIT: 'DESDOBRAMENTO',
  INPLIT: 'GRUPAMENTO',
  SPIN_OFF: 'CISÃO',
  SPIN_OFF_RECEIPT: 'CISÃO (ENTRADA)',
  TICKER_CHANGE_IN: 'CONVERSÃO (ENTRADA)',
  TICKER_CHANGE_OUT: 'CONVERSÃO (SAÍDA)',
  AMORTIZATION: 'AMORTIZAÇÃO',
  DEPOSIT: 'DEPÓSITO',
  WITHDRAW: 'RESGATE',
  ADJUSTMENT: 'AJUSTE DE SALDO',
};

export function getTransactionDisplayMeta(tx: AssetTransaction) {
  const typeUpper = String(tx.type || '').toUpperCase();
  const label = TX_TYPE_LABELS[typeUpper] ?? String(tx.type).replaceAll('_', ' ');
  const badgeClass =
    typeUpper === 'BUY' || typeUpper === 'DEPOSIT' || typeUpper === 'SPIN_OFF_RECEIPT' || typeUpper === 'TICKER_CHANGE_IN'
      ? 'bg-status-success/10 text-status-success'
      : typeUpper === 'SELL' || typeUpper === 'WITHDRAW' || typeUpper === 'TICKER_CHANGE_OUT'
      ? 'bg-status-error/10 text-status-error'
      : 'bg-accent-soft text-accent';

  let quantityDisplay: string | number = tx.quantity;
  let quantitySubtext: string | undefined;
  if (typeUpper === 'BONUS' && typeof tx.delta_quantity === 'number' && tx.delta_quantity > 0) {
    quantityDisplay = `+${tx.delta_quantity}`;
    quantitySubtext = `total ${tx.quantity}`;
  } else if (typeUpper === 'SPLIT' || typeUpper === 'INPLIT') {
    quantityDisplay = `→ ${tx.quantity}`;
  }

  return { label, badgeClass, quantityDisplay, quantitySubtext };
}

export type ReservaActionMode = 'BALANCE' | 'DEPOSIT' | 'WITHDRAW';

export function computeReservaUpdate(params: {
  currentBalance: number;
  currentInvested: number;
  mode: ReservaActionMode;
  amount: number;
}) {
  const currentBalance = Math.max(0, Number(params.currentBalance) || 0);
  const currentInvested = Math.max(0, Number(params.currentInvested) || 0);
  const amount = Number(params.amount);

  if (isNaN(amount) || amount < 0 || (params.mode !== 'BALANCE' && amount <= 0)) {
    return {
      nextBalance: currentBalance,
      nextInvested: currentInvested,
      profit: currentBalance - currentInvested,
      profitPct: currentInvested > 0 ? ((currentBalance - currentInvested) / currentInvested) * 100 : 0,
      error: params.mode === 'BALANCE' ? 'Informe um saldo válido maior ou igual a zero.' : 'Informe um valor maior que zero.',
    };
  }

  let nextBalance = currentBalance;
  let nextInvested = currentInvested;
  let error: string | null = null;

  if (params.mode === 'BALANCE') {
    nextBalance = Number(amount.toFixed(2));
  } else if (params.mode === 'DEPOSIT') {
    nextBalance = Number((currentBalance + amount).toFixed(2));
    nextInvested = Number((currentInvested + amount).toFixed(2));
  } else if (params.mode === 'WITHDRAW') {
    if (amount > currentBalance + 0.001) {
      error = 'O valor do resgate não pode ser maior que o saldo atual.';
    } else {
      const remaining = Math.max(0, currentBalance - amount);
      const ratio = currentBalance > 0 ? remaining / currentBalance : 0;
      nextBalance = Number(remaining.toFixed(2));
      nextInvested = Number((currentInvested * ratio).toFixed(2));
    }
  }

  const profit = Number((nextBalance - nextInvested).toFixed(2));
  const profitPct = nextInvested > 0 ? (profit / nextInvested) * 100 : 0;

  return { nextBalance, nextInvested, profit, profitPct, error };
}

export type SettingsFormField = 'target_percent' | 'manual_dy' | 'manual_lpa' | 'manual_vpa' | 'manual_price';

export function isMarketTicker(ticker: string) {
  if (!ticker) return false;
  const t = ticker.trim().toUpperCase();
  return /^[A-Z]{4}[0-9]{1,2}$/.test(t) || /^[A-Z0-9]{4,6}11$/.test(t) || /^[A-Z]{1,4}$/.test(t);
}
