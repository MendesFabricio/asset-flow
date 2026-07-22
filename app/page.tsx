'use client';
import dynamic from 'next/dynamic';
import { useEffect, useCallback } from 'react';
import { usePrivacy } from './context/PrivacyContext';
import { useToast } from './context/ToastContext';
import { formatMoney } from './lib/format';
import { Header } from './features/header/components/Header';
import { AssetsTable } from './components/AssetsTable';
import { SkeletonLoading } from './components/ui/Skeletons';
import { ModalSkeleton } from './components/ui/Skeletons';
import { useAssetData } from './features/assets/hooks/useAssetData';
import { usePortfolioHandlers } from './features/assets/hooks/usePortfolioHandlers';
import { usePortfolioMetrics } from './features/assets/hooks/usePortfolioMetrics';
import { useDashboardState } from './features/dashboard/hooks/useDashboardState';
import { NavigationTabs, TabItem } from './features/dashboard/components/NavigationTabs';
import { DashboardTabContent } from './features/dashboard/components/DashboardTabContent';
import { PortfolioModals } from './features/dashboard/components/PortfolioModals';
import { SyncStatusIndicators } from './features/dashboard/components/SyncStatusIndicators';
import {
  BarChart3,
  Bitcoin,
  Building2,
  CreditCard,
  Globe,
  Grip,
  Landmark,
  Layers,
  LineChart,
  TrendingUp,
  Wallet,
  Brain,
} from 'lucide-react';

const RiskRadarModal = dynamic(() => import('./components/RiskRadarModal').then(mod => mod.RiskRadarModal), { ssr: false });

const portfolioTabs: TabItem[] = [
  { id: 'Resumo', icon: <Layers size={14} />, label: 'Resumo' },
  { id: 'Ação', icon: <TrendingUp size={14} />, label: 'Ações' },
  { id: 'FII', icon: <Building2 size={14} />, label: 'FIIs' },
  { id: 'Internacional', icon: <Globe size={14} />, label: 'Internacional' },
  { id: 'Cripto', icon: <Bitcoin size={14} />, label: 'Cripto' },
  { id: 'Renda Fixa', icon: <Landmark size={14} />, label: 'Renda Fixa' },
  { id: 'Reserva', icon: <Wallet size={14} />, label: 'Reserva' },
  { id: 'Financeiro', icon: <Wallet size={14} />, label: 'Reembolsos' },
  { id: 'Cartoes', icon: <CreditCard size={14} />, label: 'Cartões' },
];

const analyticsTabs: TabItem[] = [
  { id: 'Evolução', icon: <LineChart size={14} />, label: 'Evolução' },
  { id: 'Quantitativo', icon: <BarChart3 size={14} />, label: 'Análise Quant' },
  { id: 'Jarvis', icon: <Brain size={14} />, label: 'Jarvis AI' },
];

export default function Home() {
  const { data, history, loading, refetch, syncStatus, fundamentalsStatus, mutateSync, mutateFundamentals } = useAssetData();
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const { notify } = useToast();
  const dashboard = useDashboardState();
  const {
    tab,
    setTab,
    isRefetching,
    setIsRefetching,
    showRefreshSuccess,
    setShowRefreshSuccess,
    isRadarModalOpen,
    openRadarModal,
    closeRadarModal,
    modals,
  } = dashboard;

  const handlers = usePortfolioHandlers(mutateSync, mutateFundamentals, refetch, notify);
  const metrics = usePortfolioMetrics(data, isHidden, formatMoney);

  useEffect(() => {
    if (syncStatus.status === 'error') {
      setTimeout(() => notify(syncStatus.message || 'Erro na sincronização de relatórios CVM.', 'error'), 0);
    }
  }, [syncStatus.status, syncStatus.message, notify]);

  useEffect(() => {
    if (fundamentalsStatus.status === 'error') {
      setTimeout(() => notify(fundamentalsStatus.message || 'Erro ao atualizar múltiplos do Yahoo.', 'error'), 0);
    }
  }, [fundamentalsStatus.status, fundamentalsStatus.message, notify]);

  const handleManualRefresh = useCallback(() => {
    handlers.handleManualRefresh(setIsRefetching, setShowRefreshSuccess);
  }, [handlers, setIsRefetching, setShowRefreshSuccess]);

  const handleFixAsset = useCallback((assetId: number) => {
    handlers.handleFixAsset(assetId, data?.ativos || []);
  }, [handlers, data?.ativos]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative">
        <Header
          total={0}
          ativos={[]}
          money={metrics.money}
          syncStatus={{ status: 'idle', message: '' }}
          fundamentalsStatus={{ status: 'idle', message: '' }}
          onSyncReports={handlers.handleSyncReports}
          onUpdateFundamentals={handlers.handleUpdateFundamentals}
          onManualRefresh={handleManualRefresh}
          onOpenSmartModal={handlers.handleOpenSmartModal}
          onOpenAddModal={handlers.handleOpenAddModal}
          onOpenCorporateAction={() => {}}
          onFixAsset={handleFixAsset}
          loading={true}
          isRefetching={false}
          showRefreshSuccess={false}
        />
        <SkeletonLoading />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative animate-in fade-in duration-500">
      <Header
        total={data?.resumo?.Total || 0}
        ativos={data?.ativos || []}
        money={metrics.money}
        syncStatus={syncStatus}
        fundamentalsStatus={fundamentalsStatus}
        onSyncReports={handlers.handleSyncReports}
        onUpdateFundamentals={handlers.handleUpdateFundamentals}
        onManualRefresh={handleManualRefresh}
        onOpenSmartModal={handlers.handleOpenSmartModal}
        onOpenAddModal={handlers.handleOpenAddModal}
        onOpenCorporateAction={() => modals.setCorporateActionModalOpen(true)}
        onFixAsset={handleFixAsset}
        loading={loading}
        isRefetching={isRefetching}
        showRefreshSuccess={showRefreshSuccess}
      />

      <NavigationTabs
        portfolioTabs={portfolioTabs}
        analyticsTabs={analyticsTabs}
        activeTab={tab}
        onSelect={setTab}
      />

      <div id="main-content" tabIndex={-1} className="max-w-7xl mx-auto p-4 md:p-6 outline-none">
        
        {['Resumo', 'Evolução', 'Financeiro', 'Quantitativo', 'Jarvis', 'Cartoes', 'Renda Fixa'].includes(tab) && (
          <DashboardTabContent
            tab={tab}
            metrics={metrics}
            isHidden={isHidden}
            ativos={data?.ativos || []}
            categorias={data?.categorias || []}
            history={history}
            onOpenRadar={openRadarModal}
            onUpdate={refetch}
          />
        )}

        {/* The AssetsTable component internally checks if it should render based on the tab */}
        <AssetsTable
          assets={data?.ativos || []}
          tab={tab}
          onEdit={(a) => modals.setEditingAsset(a)}
          onViewNews={(ticker) => modals.setNewsTicker(ticker)}
          onViewDetails={(a) => modals.setSelectedDetailsAsset(a)}
        />

        <PortfolioModals
          ativos={data?.ativos || []}
          editingAsset={modals.editingAsset}
          selectedDetailsAsset={modals.selectedDetailsAsset}
          newsTicker={modals.newsTicker}
          isAddModalOpen={modals.isAddModalOpen}
          isSmartModalOpen={modals.isSmartModalOpen}
          isCorporateActionModalOpen={modals.isCorporateActionModalOpen}
          onCloseEditing={() => modals.setEditingAsset(null)}
          onCloseDetails={() => modals.setSelectedDetailsAsset(null)}
          onCloseNews={() => modals.setNewsTicker(null)}
          onCloseAdd={() => modals.setAddModalOpen(false)}
          onCloseSmart={() => modals.setSmartModalOpen(false)}
          onCloseCorporateAction={() => modals.setCorporateActionModalOpen(false)}
          onRefetch={refetch}
        />

        <SyncStatusIndicators syncStatus={syncStatus} fundamentalsStatus={fundamentalsStatus} />

        <div className="text-center text-[10px] text-slate-600 mt-12 mb-4">AssetFlow v1.0</div>
      </div>


      {isRadarModalOpen && (
        <RiskRadarModal isOpen={true} onClose={closeRadarModal} alertas={data?.alertas || []} />
      )}
    </main>
  );
}
