'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Layers } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { ModalShell } from '@/components/ModalShell';
import {
  AssetEmissionSummary,
  CorporateActionGlobalModalProps,
  EmissionRecord,
  mapB3TypeToActionType,
} from './corporate-actions/types';
import { EmissionsHistoryTab } from './corporate-actions/EmissionsHistoryTab';
import { CorporateEventFormTab } from './corporate-actions/CorporateEventFormTab';

export const CorporateActionGlobalModal = ({
  isOpen,
  onClose,
  onSuccess,
  assets,
  initialData,
}: CorporateActionGlobalModalProps) => {
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  const [modalTab, setModalTab] = useState<'eventos' | 'emissoes'>('eventos');
  const [ticker, setTicker] = useState(initialData?.ticker || '');
  const [actionType, setActionType] = useState(
    initialData?.type ? mapB3TypeToActionType(initialData.type) : 'SPLIT'
  );
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().substring(0, 10));
  const [auctionValue, setAuctionValue] = useState('');
  const [factor, setFactor] = useState('2');
  const [percent, setPercent] = useState('10');
  const [unitCost, setUnitCost] = useState('0');
  const [newTicker, setNewTicker] = useState('');
  const [receivedQty, setReceivedQty] = useState('');
  const [costPercent, setCostPercent] = useState('');

  const [emissionItems, setEmissionItems] = useState<AssetEmissionSummary[]>([]);
  const [emissionsLoading, setEmissionsLoading] = useState(false);
  const [scanningEmissions, setScanningEmissions] = useState(false);
  const [emissionMsg, setEmissionMsg] = useState<string | null>(null);
  const [savingEmissionId, setSavingEmissionId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && initialData) {
      if (initialData.ticker) setTicker(initialData.ticker);
      if (initialData.type) setActionType(mapB3TypeToActionType(initialData.type));
      if (initialData.date) setDate(initialData.date);
    }
  }, [isOpen, initialData]);

  const loadEmissions = useCallback(async () => {
    setEmissionsLoading(true);
    setError(null);
    try {
      const res = await apiCall<{ status: string; items?: AssetEmissionSummary[] }>('/api/emissions');
      setEmissionItems(res.items || []);
    } catch (e) {
      setError((e as Error).message || 'Erro ao carregar emissões.');
    } finally {
      setEmissionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && modalTab === 'emissoes') {
      loadEmissions();
    }
  }, [isOpen, modalTab, loadEmissions]);

  if (!isOpen) return null;

  const handleScanAllEmissions = async () => {
    setScanningEmissions(true);
    setError(null);
    setEmissionMsg(null);
    try {
      const res = await apiCall<{
        status: string;
        imported?: number;
        scanned_assets?: number;
        items?: AssetEmissionSummary[];
        msg?: string;
      }>('/api/emissions/scan', { method: 'POST', body: JSON.stringify({}) });
      if (res.status === 'Sucesso') {
        const items = res.items || [];
        setEmissionItems(items);
        const belowCount = items.filter((it) => it.current_qty < it.theoretical_qty).length;
        setEmissionMsg(
          `Varredura concluída em ${res.scanned_assets ?? 0} ativo(s): ${res.imported ?? 0} nova(s) emissão(ões) importada(s), ${belowCount} ativo(s) abaixo do esperado.`
        );
      } else {
        setError(res.msg || 'Falha ao buscar comunicados.');
      }
    } catch (e) {
      setError((e as Error).message || 'Falha ao buscar comunicados na B3/CVM.');
    } finally {
      setScanningEmissions(false);
    }
  };

  const handleSaveSubscribedQty = async (itemTicker: string, em: EmissionRecord, qty: number) => {
    setSavingEmissionId(em.id);
    setError(null);
    try {
      const res = await apiCall<{ status: string; items?: AssetEmissionSummary[]; msg?: string }>('/api/emissions', {
        method: 'POST',
        body: JSON.stringify({
          id: em.id,
          ticker: itemTicker,
          date: em.date,
          factor_pct: em.factor_pct,
          unit_cost: em.unit_cost,
          subscribed_qty: qty,
          title: em.title,
        }),
      });
      if (res.status === 'Sucesso' && res.items?.[0]) {
        const updated = res.items[0];
        setEmissionItems((prev) => prev.map((it) => (it.ticker === updated.ticker ? updated : it)));
        return true;
      }
      setError(res.msg || 'Erro ao atualizar quantidade subscrita.');
      return false;
    } catch (e) {
      setError((e as Error).message || 'Erro ao atualizar quantidade subscrita.');
      return false;
    } finally {
      setSavingEmissionId(null);
    }
  };

  const handleSubmit = async () => {
    if (!ticker) {
      setError('Selecione um ativo da sua carteira.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiCall('/api/corporate-action', {
        method: 'POST',
        body: JSON.stringify({
          ticker,
          type: actionType,
          date: new Date(date).toISOString(),
          factor: Number(factor),
          percent: Number(percent),
          unit_cost: Number(unitCost),
          auction_value: Number(auctionValue || 0),
          new_ticker: newTicker.toUpperCase(),
          received_qty: Number(receivedQty),
          cost_percent: Number(costPercent),
        }),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Erro ao registrar evento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      zIndex={300}
      onClose={onClose}
      title={modalTab === 'eventos' ? 'Eventos Corporativos' : 'Histórico de Emissões'}
      subtitle={
        modalTab === 'eventos'
          ? 'Ajustes Estruturais de Carteira'
          : 'Ativos da carteira com quantidade abaixo do esperado considerando emissões reais'
      }
      maxWidth={modalTab === 'emissoes' ? '3xl' : 'lg'}
    >
      <div className="space-y-4">
        <div className="flex gap-2 p-1 rounded-xl bg-surface-input border border-border-subtle">
          <button
            type="button"
            onClick={() => { setModalTab('eventos'); setError(null); }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors ${
              modalTab === 'eventos'
                ? 'bg-surface-card text-text-primary border border-border-subtle shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Eventos Corporativos
          </button>
          <button
            type="button"
            onClick={() => { setModalTab('emissoes'); setError(null); }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              modalTab === 'emissoes'
                ? 'bg-surface-card text-accent border border-accent/30 shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Layers size={13} />
            Histórico de Emissões
          </button>
        </div>

        {error && (
          <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-xl flex gap-3 text-status-error">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p className="text-xs">{error}</p>
          </div>
        )}

        {emissionMsg && modalTab === 'emissoes' && (
          <div className="p-3 bg-accent/10 border border-accent/20 rounded-xl text-xs text-text-primary">
            {emissionMsg}
          </div>
        )}

        {modalTab === 'emissoes' ? (
          <EmissionsHistoryTab
            assets={assets}
            emissionItems={emissionItems}
            emissionsLoading={emissionsLoading}
            scanningEmissions={scanningEmissions}
            savingEmissionId={savingEmissionId}
            money={money}
            onScanAll={handleScanAllEmissions}
            onSaveSubscribedQty={handleSaveSubscribedQty}
          />
        ) : (
          <CorporateEventFormTab
            assets={assets}
            ticker={ticker}
            date={date}
            actionType={actionType}
            factor={factor}
            percent={percent}
            unitCost={unitCost}
            newTicker={newTicker}
            receivedQty={receivedQty}
            costPercent={costPercent}
            auctionValue={auctionValue}
            loading={loading}
            onChangeTicker={setTicker}
            onChangeDate={setDate}
            onChangeActionType={setActionType}
            onChangeFactor={setFactor}
            onChangePercent={setPercent}
            onChangeUnitCost={setUnitCost}
            onChangeNewTicker={setNewTicker}
            onChangeReceivedQty={setReceivedQty}
            onChangeCostPercent={setCostPercent}
            onChangeAuctionValue={setAuctionValue}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </ModalShell>
  );
};
