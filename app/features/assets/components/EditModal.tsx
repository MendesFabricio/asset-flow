'use client';
import { useState, useEffect } from 'react';
import { Save, Calculator, Trash2, DollarSign, Plus, Minus } from 'lucide-react';
import { Asset, AssetTransaction } from '@/types';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/ModalShell';
import { formatMoney } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePrivacy } from '@/context/PrivacyContext';
import { useToast } from '@/context/ToastContext';

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  ativo: Asset | null;
  allAssets?: Asset[];
}

const TX_TYPE_LABELS: Record<string, string> = {
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

type ReservaActionMode = 'BALANCE' | 'DEPOSIT' | 'WITHDRAW';

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

type SettingsFormField = 'target_percent' | 'manual_dy' | 'manual_lpa' | 'manual_vpa' | 'manual_price';

interface InputControlProps {
  label: string;
  value: number;
  field: SettingsFormField;
  step: number;
  precision: number;
  color?: string;
  onAdjust: (field: SettingsFormField, delta: number, precision: number) => void;
  onChange: (field: SettingsFormField, value: number) => void;
}

const InputControl = ({ label, value, field, step, precision, color = "blue", onAdjust, onChange }: InputControlProps) => {
  const colorClasses = {
    blue: { ring: "focus-within:ring-blue-500/50", text: "text-blue-500", hoverBg: "hover:bg-blue-500/10" },
    purple: { ring: "focus-within:ring-purple-500/50", text: "text-purple-500", hoverBg: "hover:bg-purple-500/10" },
    emerald: { ring: "focus-within:ring-emerald-500/50", text: "text-emerald-500", hoverBg: "hover:bg-emerald-500/10" }
  };
  const style = colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">{label}</label>
      <div className={`flex items-center bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden focus-within:ring-1 ${style.ring} transition-all shadow-sm`}>
        <button type="button" onClick={() => onAdjust(field, -step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Minus size={14} />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(field, Number(e.target.value))}
          className="w-full bg-transparent p-2 text-white outline-none font-mono text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => onAdjust(field, step, precision)} className={`p-2.5 ${style.text} ${style.hoverBg} transition-colors`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export const EditModal = ({ isOpen, onClose, onSave, ativo, allAssets = [] }: EditModalProps) => {
  const { isHidden } = usePrivacy();
  const { notify } = useToast();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));
  const [activeTab, setActiveTab] = useState<'TRANSACTION' | 'HISTORY' | 'SETTINGS'>('TRANSACTION');
  const [pendingDeleteTxId, setPendingDeleteTxId] = useState<number | null>(null);
  const [deletingTx, setDeletingTx] = useState(false);
  
  // -- Transaction State --
  const [txData, setTxData] = useState({
    type: 'BUY',
    quantity: 0,
    unit_price: 0,
    date: new Date().toISOString().substring(0, 10)
  });
  const [txError, setTxError] = useState<string | null>(null);

  // -- Reserva (Caixinha) State --
  const [reservaMode, setReservaMode] = useState<ReservaActionMode>('BALANCE');
  const [reservaAmount, setReservaAmount] = useState<string>('0');
  
  // -- History State --
  const [transactions, setTransactions] = useState<AssetTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // -- Settings State --
  const [settingsData, setSettingsData] = useState({
    target_percent: 0,
    manual_dy: 0,
    manual_lpa: 0,
    manual_vpa: 0,
    manual_price: 0
  });

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (ativo && isOpen) {
      // Reset states
      setActiveTab('TRANSACTION');
      setTxError(null);
      setTxData(prev => ({ 
        ...prev, 
        quantity: 0, 
        unit_price: Number((Number(ativo.preco_atual) || 0).toFixed(2)), 
        date: new Date().toISOString().substring(0, 10) 
      }));

      const currentBal = Number(ativo.total_atual ?? (ativo.qtd || 1) * (ativo.preco_atual || 0)) || 0;
      setReservaMode('BALANCE');
      setReservaAmount(currentBal.toFixed(2));
      
      setSettingsData({
        target_percent: ativo.meta || 0,
        manual_dy: Number(((ativo.manual_dy || 0) * 100).toFixed(2)),
        manual_lpa: ativo.manual_lpa || 0,
        manual_vpa: ativo.manual_vpa || 0,
        manual_price: Number((Number(ativo.preco_atual) || 0).toFixed(2))
      });
      setShowDeleteConfirm(false);
    }
  }, [ativo, isOpen]);

  useEffect(() => {
    if (isOpen && ativo && activeTab === 'HISTORY') {
      setLoadingHistory(true);
      apiCall<AssetTransaction[]>(`/api/asset-transactions/${ativo.ticker}`)
        .then(data => setTransactions(data))
        .catch(err => console.error(err))
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, ativo, activeTab]);

  const handleDeleteTransaction = (txId: number) => {
    setPendingDeleteTxId(txId);
  };

  const confirmDeleteTransaction = async () => {
    if (pendingDeleteTxId === null) return;
    setDeletingTx(true);
    try {
      await apiCall(`/api/asset-transactions/${pendingDeleteTxId}`, { method: 'DELETE' });
      setTransactions(prev => prev.filter(t => t.id !== pendingDeleteTxId));
      setPendingDeleteTxId(null);
      notify('Transação removida do histórico.', 'success');
      onSave();
    } catch (err) {
      console.error('Erro ao excluir transação:', err);
      notify('Erro ao excluir transação do histórico.', 'error');
    } finally {
      setDeletingTx(false);
    }
  };

  // -- Settings Handlers --
  const handleAdjustValue = (field: keyof typeof settingsData, delta: number, precision = 2) => {
    setSettingsData(prev => {
      const newVal = Number((prev[field] + delta).toFixed(precision));
      return { ...prev, [field]: Math.max(0, newVal) };
    });
  };

  const handleInputChange = (field: SettingsFormField, value: number) => {
    const sanitizedValue = Math.max(0, isNaN(value) ? 0 : value);
    setSettingsData(prev => ({ ...prev, [field]: sanitizedValue }));
  };

  const isMarketTicker = (ticker: string) => {
    if (!ticker) return false;
    const t = ticker.trim().toUpperCase();
    return /^[A-Z]{4}[0-9]{1,2}$/.test(t) || /^[A-Z0-9]{4,6}11$/.test(t) || /^[A-Z]{1,4}$/.test(t);
  };

  const shouldShowManualPrice = () => {
    if (!ativo) return false;
    const ticker = ativo.ticker?.trim().toUpperCase() || "";
    const preco = Number(ativo.preco_atual);
    return !isMarketTicker(ticker) || isNaN(preco) || preco <= 0;
  };

  const maxLimit = (() => {
    if (!ativo) return 100;
    const totalOcupado = allAssets
      .filter((a) => a.tipo === ativo.tipo && a.ticker !== ativo.ticker)
      .reduce((acc, a) => acc + (a.meta || 0), 0);
    return Math.max(0, 100 - totalOcupado);
  })();

  const handleSaveSettings = async () => {
    if (!ativo) return;
    setLoading(true);
    try {
      const payload = {
        ticker: ativo.ticker,
        qtd: ativo.qtd,
        pm: ativo.pm,
        meta: Number(settingsData.target_percent),
        dy: Number(settingsData.manual_dy) / 100,
        lpa: Number(settingsData.manual_lpa),
        vpa: Number(settingsData.manual_vpa),
        current_price: Number(settingsData.manual_price)
      };

      await apiCall('/api/update_asset', { method: 'POST', body: JSON.stringify(payload) });
      onSave();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!ativo) return;
    setLoading(true);
    try {
      await apiCall('/api/delete_asset', {
        method: 'POST',
        body: JSON.stringify({ id: (ativo as Asset & { id?: number }).id }),
      });
      onSave();
      onClose();
    } finally { setLoading(false); }
  };

  // -- Transaction Handlers --
  const handleTxChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setTxError(null);
    setTxData({ ...txData, [e.target.name]: e.target.value });
  };

  const handleSaveTransaction = async () => {
    const qty = Number(txData.quantity);
    const price = Number(txData.unit_price);

    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      setTxError("Quantidade e Preço devem ser maiores que zero.");
      return;
    }

    if (txData.type === 'SELL' && ativo && qty > Number(ativo.qtd || 0)) {
      setTxError(`Quantidade máxima disponível para venda: ${ativo.qtd}`);
      return;
    }

    setLoading(true);
    try {
      await apiCall('/api/asset-transactions', {
        method: 'POST',
        body: JSON.stringify({
          ticker: ativo?.ticker,
          type: txData.type,
          quantity: qty,
          unit_price: price,
          date: new Date(txData.date).toISOString()
        })
      });
      onSave();
      onClose();
    } catch (e) {
        setTxError((e as Error).message || "Erro ao registrar transação");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !ativo) return null;

  const isReserva = ativo.tipo === 'Reserva';
  const reservaCurrentBalance = Number(ativo.total_atual ?? (ativo.qtd || 1) * (ativo.preco_atual || 0)) || 0;
  const reservaCurrentInvested = Number(ativo.total_investido ?? (ativo.qtd || 1) * (ativo.pm || 0)) || 0;
  const reservaPreview = computeReservaUpdate({
    currentBalance: reservaCurrentBalance,
    currentInvested: reservaCurrentInvested,
    mode: reservaMode,
    amount: Number(reservaAmount),
  });

  const handleReservaModeChange = (mode: ReservaActionMode) => {
    setTxError(null);
    setReservaMode(mode);
    setReservaAmount(mode === 'BALANCE' ? reservaCurrentBalance.toFixed(2) : '');
  };

  const handleSaveReserva = async () => {
    if (reservaPreview.error) {
      setTxError(reservaPreview.error);
      return;
    }

    setLoading(true);
    setTxError(null);
    try {
      await apiCall('/api/update_asset', {
        method: 'POST',
        body: JSON.stringify({
          ticker: ativo.ticker,
          qtd: 1,
          pm: reservaPreview.nextInvested,
          meta: Number(settingsData.target_percent),
          dy: Number(settingsData.manual_dy) / 100,
          lpa: Number(settingsData.manual_lpa),
          vpa: Number(settingsData.manual_vpa),
          current_price: reservaPreview.nextBalance,
          tx_type: reservaMode,
          tx_amount: Number(reservaAmount),
        }),
      });
      onSave();
      onClose();
    } catch (e) {
      setTxError((e as Error).message || 'Erro ao atualizar reserva');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title={`Gerenciar ${ativo.ticker}`}
      subtitle={ativo.tipo}
      maxWidth="md"
      zIndex={100}
      noPadding
    >
      {/* Tabs Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('TRANSACTION')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'TRANSACTION' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {isReserva ? 'Movimentar' : 'Nova Transação'}
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'HISTORY' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Histórico
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${activeTab === 'SETTINGS' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Configurações
        </button>
      </div>

      <div className="p-6">
        {/* Tab 1: Transaction (or Reserva Caixinha Flow) */}
        {activeTab === 'TRANSACTION' && isReserva && (
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
                <p className={`text-sm font-mono font-bold mt-0.5 ${reservaCurrentBalance - reservaCurrentInvested >= 0 ? 'text-status-success' : 'text-status-error'}`}>
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
                  onClick={() => handleReservaModeChange(item.id)}
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
                    onClick={() => {
                      setTxError(null);
                      setReservaAmount(reservaCurrentBalance.toFixed(2));
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-accent hover:underline"
                  >
                    Resgatar tudo
                  </button>
                )}
              </div>
              <input
                type="number"
                value={reservaAmount}
                onChange={(e) => {
                  setTxError(null);
                  setReservaAmount(e.target.value);
                }}
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
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveReserva}
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
        )}

        {activeTab === 'TRANSACTION' && !isReserva && (
          <div className="space-y-4">
            {txError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-sm">
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
                      onClick={() => {
                        setTxError(null);
                        setTxData((prev) => ({ ...prev, type: opt.id }));
                      }}
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
                  onChange={handleTxChange}
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
                      onClick={() => {
                        setTxError(null);
                        setTxData((prev) => ({ ...prev, quantity: Number(ativo.qtd) || 0 }));
                      }}
                      className="text-[11px] font-bold text-rose-400 hover:underline font-mono"
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
                  onChange={handleTxChange}
                  max={txData.type === 'SELL' ? Number(ativo.qtd || 0) : undefined}
                  min="0"
                  className="w-full bg-surface-input border border-border-subtle rounded-xl p-3 text-text-primary font-mono focus:border-accent outline-none transition-all shadow-sm"
                  placeholder="Ex: 100"
                  step="0.01"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-text-muted">Preço Un. (R$)</label>
                <input
                  type="number"
                  name="unit_price"
                  value={txData.unit_price || ''}
                  onChange={handleTxChange}
                  className="w-full bg-surface-input border border-border-subtle rounded-xl p-3 text-text-primary font-mono focus:border-accent outline-none transition-all shadow-sm"
                  placeholder="Ex: 15.50"
                  step="0.01"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-5 border-t border-slate-800/50">
              <button onClick={onClose} className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-white rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={handleSaveTransaction}
                disabled={loading}
                className="inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_2px_10px_rgba(37,99,235,0.2)]"
              >
                {loading ? 'Salvando...' : 'Salvar Transação'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: History */}
        {activeTab === 'HISTORY' && (
          <div className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
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
                              <div className="text-[10px] text-text-muted leading-tight">
                                {txMeta.quantitySubtext}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-text-primary font-mono whitespace-nowrap">
                            {money(tx.unit_price)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteTransaction(tx.id)}
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
        )}

        {/* Tab 3: Settings */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-6">
            {shouldShowManualPrice() && !isReserva && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-400">
                  <DollarSign size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Preço Manual</span>
                </div>
                <InputControl label="Preço Atual / Saldo" value={settingsData.manual_price} field="manual_price" step={10} precision={2} color="emerald" onAdjust={handleAdjustValue} onChange={handleInputChange} />
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest flex justify-between items-center ml-1">
                <span>Meta na Carteira</span>
                <div className="text-right flex flex-col items-end">
                  <span className="text-blue-400 font-mono text-sm leading-none">{settingsData.target_percent}%</span>
                  <span className="text-[9px] text-slate-600 font-normal tracking-normal mt-1">limite: {maxLimit.toFixed(1)}%</span>
                </div>
              </label>
              <input
                type="range" min="0" max={maxLimit} step="0.5"
                value={settingsData.target_percent > maxLimit ? maxLimit : settingsData.target_percent}
                onChange={(e) => handleInputChange('target_percent', Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800/50 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {!shouldShowManualPrice() && (
              <div className="pt-5 border-t border-slate-800/50 space-y-4">
                <div className="flex items-center gap-2 ml-1">
                  <Calculator size={14} className="text-purple-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inteligência</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <InputControl label="DY Anual %" value={settingsData.manual_dy} field="manual_dy" step={0.1} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                  {ativo.tipo === 'FII' && (
                    <InputControl label="VP / Cota" value={settingsData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                  )}
                  {ativo.tipo === 'Ação' && (
                    <>
                      <InputControl label="LPA (Lucro)" value={settingsData.manual_lpa} field="manual_lpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                      <div className="col-span-2">
                        <InputControl label="VPA (Patrimonial)" value={settingsData.manual_vpa} field="manual_vpa" step={0.5} precision={2} color="purple" onAdjust={handleAdjustValue} onChange={handleInputChange} />
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between items-center w-full pt-5 border-t border-slate-800/50 mt-8">
              {showDeleteConfirm ? (
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest animate-pulse">Tem certeza?</span>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 uppercase tracking-widest transition-all">Cancelar</button>
                    <button type="button" onClick={handleDelete} disabled={loading} className="px-4 py-2.5 rounded-lg text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-500 uppercase tracking-widest transition-all flex items-center gap-2"><Trash2 size={14} /> Excluir</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={loading} className="text-rose-500 hover:text-rose-400 p-2 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50">
                    <Trash2 size={16} /> <span className="hidden sm:inline">Excluir</span>
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-[11px] font-bold text-slate-400 hover:text-white uppercase tracking-wider transition-colors">Cancelar</button>
                    <button type="button" onClick={handleSaveSettings} disabled={loading} className="inline-flex justify-center items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-[11px] font-bold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_2px_10px_rgba(37,99,235,0.2)] uppercase tracking-wider">
                      {loading ? 'Salvando...' : <><Save size={14} /> Atualizar</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={pendingDeleteTxId !== null}
        title="Apagar transação"
        message="Deseja realmente apagar esta transação do histórico? Esta ação recalculará a posição do ativo."
        confirmLabel={deletingTx ? 'Apagando...' : 'Apagar'}
        onCancel={() => { if (!deletingTx) setPendingDeleteTxId(null); }}
        onConfirm={confirmDeleteTransaction}
      />
    </ModalShell>
  );
};
