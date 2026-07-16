'use client';

import { useCallback, useMemo } from 'react';
import { apiCall } from '@/lib/api';
import { useModalStore } from '@/store/modalStore';
import { usePrivacy } from '@/context/PrivacyContext';
import { Asset } from '@/types';

export function usePortfolioHandlers(
  mutateSync: (data?: unknown) => void,
  mutateFundamentals: (data?: unknown) => void,
  refetch: () => void,
  notify: (msg: string, type?: 'success' | 'error') => void
) {
  const setEditingAsset = useModalStore(state => state.setEditingAsset);
  const setIfModalOpen = useModalStore(state => state.setIfModalOpen);
  const setSmartModalOpen = useModalStore(state => state.setSmartModalOpen);
  const setAddModalOpen = useModalStore(state => state.setAddModalOpen);
  const { isHidden } = usePrivacy() as { isHidden: boolean };

  const handleSyncReports = useCallback(async () => {
    mutateSync({ status: 'processing', message: 'Iniciando barramento de sincronia...' });
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/sync-reports', { method: 'POST' });
      notify(result.msg, 'success');
      mutateSync();
    } catch (err) {
      const e = err as Error;
      console.error(e);
      notify(e.message || "Falha ao conectar com o servidor para sincronizar relatórios.", 'error');
      mutateSync({ status: 'idle', message: '' });
    }
  }, [mutateSync, notify]);

  const handleUpdateFundamentals = useCallback(async () => {
    mutateFundamentals({ status: 'processing', message: 'Iniciando esteira de múltiplos...' });
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/update-fundamentals', { method: 'POST' });
      notify(result.msg, 'success');
      mutateFundamentals();
    } catch (err) {
      const e = err as Error;
      console.error(e);
      if (e.message?.includes('409')) {
        notify("A esteira de múltiplos do Yahoo já está rodando. Sincronizando com o lote...", 'error');
        mutateFundamentals();
      } else {
        notify(e.message || "Falha ao conectar com o servidor de fundamentos.", 'error');
        mutateFundamentals({ status: 'idle', message: '' });
      }
    }
  }, [mutateFundamentals, notify]);

  const handleManualRefresh = useCallback(async (setIsRefetching: (v: boolean) => void, setShowRefreshSuccess: (v: boolean) => void) => {
    setIsRefetching(true);
    try {
      await apiCall('/api/refresh_prices', { method: 'POST' });
      await refetch();
      setShowRefreshSuccess(true);
      setTimeout(() => setShowRefreshSuccess(false), 2000);
    } catch (e) {
      console.error("Erro ao atualizar:", e);
      notify("Erro ao atualizar preços. Verifique se o backend está rodando na porta 5328.", 'error');
    } finally {
      setIsRefetching(false);
    }
  }, [refetch, notify]);

  const handleFixAsset = useCallback((assetId: number, ativos: Asset[]) => {
    const assetToEdit = ativos.find((a: Asset) => a.id === assetId);
    if (assetToEdit) setEditingAsset(assetToEdit);
  }, [setEditingAsset]);

  const handleOpenIfModal = useCallback(() => setIfModalOpen(true), [setIfModalOpen]);
  const handleOpenSmartModal = useCallback(() => setSmartModalOpen(true), [setSmartModalOpen]);
  const handleOpenAddModal = useCallback(() => setAddModalOpen(true), [setAddModalOpen]);

  const handlers = useMemo(() => ({
    isHidden,
    handleSyncReports,
    handleUpdateFundamentals,
    handleManualRefresh,
    handleFixAsset,
    handleOpenIfModal,
    handleOpenSmartModal,
    handleOpenAddModal,
  }), [
    isHidden,
    handleSyncReports,
    handleUpdateFundamentals,
    handleManualRefresh,
    handleFixAsset,
    handleOpenIfModal,
    handleOpenSmartModal,
    handleOpenAddModal,
  ]);

  return handlers;
}
