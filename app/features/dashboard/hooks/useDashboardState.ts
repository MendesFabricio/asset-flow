'use client';

import { useCallback, useState } from 'react';
import { useModalStore } from '@/store/modalStore';

/**
 * Centraliza o estado de UI do dashboard principal (aba ativa, refresh manual,
 * radar modal) e expõe as ligações com o modalStore (fonte de verdade dos modais).
 */
export function useDashboardState() {
  const [tab, setTab] = useState('Resumo');
  const [isRefetching, setIsRefetching] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [isRadarModalOpen, setIsRadarModalOpen] = useState(false);

  const isAddModalOpen = useModalStore(state => state.isAddModalOpen);
  const isSmartModalOpen = useModalStore(state => state.isSmartModalOpen);
  const editingAsset = useModalStore(state => state.editingAsset);
  const selectedDetailsAsset = useModalStore(state => state.selectedDetailsAsset);
  const newsTicker = useModalStore(state => state.newsTicker);
  const setAddModalOpen = useModalStore(state => state.setAddModalOpen);
  const setSmartModalOpen = useModalStore(state => state.setSmartModalOpen);
  const setEditingAsset = useModalStore(state => state.setEditingAsset);
  const setSelectedDetailsAsset = useModalStore(state => state.setSelectedDetailsAsset);
  const setNewsTicker = useModalStore(state => state.setNewsTicker);

  const openRadarModal = useCallback(() => setIsRadarModalOpen(true), []);
  const closeRadarModal = useCallback(() => setIsRadarModalOpen(false), []);

  const isCorporateActionModalOpen = useModalStore(state => state.isCorporateActionModalOpen);
  const setCorporateActionModalOpen = useModalStore(state => state.setCorporateActionModalOpen);

  return {
    tab,
    setTab,
    isRefetching,
    setIsRefetching,
    showRefreshSuccess,
    setShowRefreshSuccess,
    isRadarModalOpen,
    openRadarModal,
    closeRadarModal,
    modals: {
      isAddModalOpen,
      isSmartModalOpen,
      isCorporateActionModalOpen,
      editingAsset,
      selectedDetailsAsset,
      newsTicker,
      setAddModalOpen,
      setSmartModalOpen,
      setCorporateActionModalOpen,
      setEditingAsset,
      setSelectedDetailsAsset,
      setNewsTicker,
    },
  };
}
