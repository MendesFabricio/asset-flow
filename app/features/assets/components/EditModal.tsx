'use client';

import { useState, useEffect } from 'react';
import { Asset, AssetTransaction } from '@/types';
import { apiCall } from '@/lib/api';
import { ModalShell } from '@/components/ModalShell';
import { formatMoney } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePrivacy } from '@/context/PrivacyContext';
import { useToast } from '@/context/ToastContext';
import {
  getTransactionDisplayMeta,
  computeReservaUpdate,
  ReservaActionMode,
  SettingsFormField,
  isMarketTicker,
} from './edit-modal/helpers';
import { TransactionTab } from './edit-modal/TransactionTab';
import { HistoryTab } from './edit-modal/HistoryTab';
import { SettingsTab } from './edit-modal/SettingsTab';

export { getTransactionDisplayMeta, computeReservaUpdate };

interface EditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  ativo: Asset | null;
  allAssets?: Asset[];
}

export const EditModal = ({ isOpen, onClose, onSave, ativo, allAssets = [] }: EditModalProps) => {
  const { isHidden } = usePrivacy();
  const { notify } = useToast();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));

  const [activeTab, setActiveTab] = useState<'TRANSACTION' | 'HISTORY' | 'SETTINGS'>('TRANSACTION');
  const [pendingDeleteTxId, setPendingDeleteTxId] = useState<number | null>(null);
  const [deletingTx, setDeletingTx] = useState(false);

  const [txData, setTxData] = useState({
    type: 'BUY',
    quantity: 0,
    unit_price: 0,
    date: new Date().toISOString().substring(0, 10),
  });
  const [txError, setTxError] = useState<string | null>(null);

  const [reservaMode, setReservaMode] = useState<ReservaActionMode>('BALANCE');
  const [reservaAmount, setReservaAmount] = useState<string>('0');

  const [transactions, setTransactions] = useState<AssetTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [settingsData, setSettingsData] = useState<Record<SettingsFormField, number>>({
    target_percent: 0,
    manual_dy: 0,
    manual_lpa: 0,
    manual_vpa: 0,
    manual_price: 0,
  });

  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (ativo && isOpen) {
      setActiveTab('TRANSACTION');
      setTxError(null);
      setTxData((prev) => ({
        ...prev,
        quantity: 0,
        unit_price: Number((Number(ativo.preco_atual) || 0).toFixed(2)),
        date: new Date().toISOString().substring(0, 10),
      }));

      const currentBal = Number(ativo.total_atual ?? (ativo.qtd || 1) * (ativo.preco_atual || 0)) || 0;
      setReservaMode('BALANCE');
      setReservaAmount(currentBal.toFixed(2));

      setSettingsData({
        target_percent: ativo.meta || 0,
        manual_dy: Number(((ativo.manual_dy || 0) * 100).toFixed(2)),
        manual_lpa: ativo.manual_lpa || 0,
        manual_vpa: ativo.manual_vpa || 0,
        manual_price: Number((Number(ativo.preco_atual) || 0).toFixed(2)),
      });
      setShowDeleteConfirm(false);
    }
  }, [ativo, isOpen]);

  useEffect(() => {
    if (isOpen && ativo && activeTab === 'HISTORY') {
      setLoadingHistory(true);
      apiCall<AssetTransaction[]>(`/api/asset-transactions/${ativo.ticker}`)
        .then((data) => setTransactions(data))
        .catch((err) => console.error(err))
        .finally(() => setLoadingHistory(false));
    }
  }, [isOpen, ativo, activeTab]);

  const confirmDeleteTransaction = async () => {
    if (pendingDeleteTxId === null) return;
    setDeletingTx(true);
    try {
      await apiCall(`/api/asset-transactions/${pendingDeleteTxId}`, { method: 'DELETE' });
      setTransactions((prev) => prev.filter((t) => t.id !== pendingDeleteTxId));
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

  const handleAdjustValue = (field: SettingsFormField, delta: number, precision = 2) => {
    setSettingsData((prev) => ({
      ...prev,
      [field]: Math.max(0, Number((prev[field] + delta).toFixed(precision))),
    }));
  };

  const handleInputChange = (field: SettingsFormField, value: number) => {
    setSettingsData((prev) => ({ ...prev, [field]: Math.max(0, isNaN(value) ? 0 : value) }));
  };

  const showManualPrice = (() => {
    if (!ativo) return false;
    const ticker = ativo.ticker?.trim().toUpperCase() || '';
    const preco = Number(ativo.preco_atual);
    return !isMarketTicker(ticker) || isNaN(preco) || preco <= 0;
  })();

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
      await apiCall('/api/update_asset', {
        method: 'POST',
        body: JSON.stringify({
          ticker: ativo.ticker,
          qtd: ativo.qtd,
          pm: ativo.pm,
          meta: Number(settingsData.target_percent),
          dy: Number(settingsData.manual_dy) / 100,
          lpa: Number(settingsData.manual_lpa),
          vpa: Number(settingsData.manual_vpa),
          current_price: Number(settingsData.manual_price),
        }),
      });
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
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTransaction = async () => {
    const qty = Number(txData.quantity);
    const price = Number(txData.unit_price);
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      setTxError('Quantidade e Preço devem ser maiores que zero.');
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
          date: new Date(txData.date).toISOString(),
        }),
      });
      onSave();
      onClose();
    } catch (e) {
      setTxError((e as Error).message || 'Erro ao registrar transação');
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
    <ModalShell onClose={onClose} title={`Gerenciar ${ativo.ticker}`} subtitle={ativo.tipo} maxWidth="md" zIndex={100} noPadding>
      <div className="flex items-center gap-4 px-6 py-3 bg-surface-elevated border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('TRANSACTION')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'TRANSACTION' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          {isReserva ? 'Movimentar' : 'Nova Transação'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('HISTORY')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'HISTORY' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Histórico
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SETTINGS')}
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
            activeTab === 'SETTINGS' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Configurações
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'TRANSACTION' && (
          <TransactionTab
            ativo={ativo}
            isReserva={isReserva}
            loading={loading}
            txError={txError}
            money={money}
            reservaMode={reservaMode}
            reservaAmount={reservaAmount}
            reservaCurrentBalance={reservaCurrentBalance}
            reservaCurrentInvested={reservaCurrentInvested}
            reservaPreview={reservaPreview}
            onReservaModeChange={(mode) => {
              setTxError(null);
              setReservaMode(mode);
              setReservaAmount(mode === 'BALANCE' ? reservaCurrentBalance.toFixed(2) : '');
            }}
            onReservaAmountChange={(val) => {
              setTxError(null);
              setReservaAmount(val);
            }}
            onSaveReserva={handleSaveReserva}
            txData={txData}
            onTxChange={(e) => {
              setTxError(null);
              setTxData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
            }}
            onSelectTxType={(type) => {
              setTxError(null);
              setTxData((prev) => ({ ...prev, type }));
            }}
            onUseMaxQuantity={() => {
              setTxError(null);
              setTxData((prev) => ({ ...prev, quantity: Number(ativo.qtd) || 0 }));
            }}
            onSaveTransaction={handleSaveTransaction}
            onClose={onClose}
          />
        )}

        {activeTab === 'HISTORY' && (
          <HistoryTab
            loadingHistory={loadingHistory}
            transactions={transactions}
            money={money}
            onDeleteTransaction={setPendingDeleteTxId}
          />
        )}

        {activeTab === 'SETTINGS' && (
          <SettingsTab
            ativo={ativo}
            isReserva={isReserva}
            showManualPrice={showManualPrice}
            maxLimit={maxLimit}
            loading={loading}
            showDeleteConfirm={showDeleteConfirm}
            settingsData={settingsData}
            onAdjustValue={handleAdjustValue}
            onInputChange={handleInputChange}
            onSetShowDeleteConfirm={setShowDeleteConfirm}
            onDelete={handleDelete}
            onSaveSettings={handleSaveSettings}
            onClose={onClose}
          />
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
