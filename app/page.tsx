'use client';
import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { usePrivacy } from './context/PrivacyContext';
import { formatMoney } from './utils';
import { StatCard } from './components/StatCard';
import { Header } from './components/Header';
import { AssetsTable } from './components/AssetsTable';
import { Asset } from './types';
import { useModalStore } from './store/modalStore';
import { MorningBriefing } from './components/MorningBriefing';
import { SkeletonLoading } from './components/ui/Skeletons';
import {
  RiskRadarSkeleton,
  HistoryChartSkeleton,
  CategorySummarySkeleton,
  ModalSkeleton,
  ChatSkeleton,
  NewsPanelSkeleton,
  ReceivablesSkeleton,
  CreditCardsSkeleton,
  FixedIncomeSkeleton,
  QuantSkeleton
} from './components/ui/Skeletons';
import { HeatmapSkeleton } from './components/ui/Skeletons';
import { useAssetData } from './hooks/useAssetData';
import { usePortfolioHandlers } from './hooks/usePortfolioHandlers';
import { usePortfolioMetrics } from './hooks/usePortfolioMetrics';
import {
  BarChart3,
  Bitcoin,
  Brain,
  Building2,
  CheckCircle,
  CreditCard,
  Globe,
  Grip,
  Landmark,
  Layers,
  LineChart,
  RefreshCw,
  TrendingUp,
  Wallet,
  X,
  Percent,
  PiggyBank,
  Target,
  AlertTriangle
} from 'lucide-react';

const RiskRadar = dynamic(() => import('./components/RiskRadar').then(mod => mod.RiskRadar), { ssr: false, loading: () => <RiskRadarSkeleton /> }) as React.FC<any>;
const HistoryChart = dynamic(() => import('./components/HistoryChart').then(mod => mod.HistoryChart), { ssr: false, loading: () => <HistoryChartSkeleton /> }) as React.FC<any>;
const CategorySummary = dynamic(() => import('./components/CategorySummary').then(mod => mod.CategorySummary), { ssr: false, loading: () => <CategorySummarySkeleton /> }) as React.FC<any>;
const EditModal = dynamic(() => import('./components/EditModal').then(mod => mod.EditModal), { ssr: false, loading: () => <ModalSkeleton /> }) as React.FC<any>;
const AddAssetModal = dynamic(() => import('./components/AddAssetModal').then(mod => mod.AddAssetModal), { ssr: false, loading: () => <ModalSkeleton /> }) as React.FC<any>;
const AssetNewsPanel = dynamic(() => import('./components/AssetNewsPanel').then(mod => mod.AssetNewsPanel), { ssr: false, loading: () => <NewsPanelSkeleton /> }) as React.FC<any>;
const ReceivablesTab = dynamic(() => import('./components/ReceivablesTab').then(mod => mod.ReceivablesTab), { ssr: false, loading: () => <ReceivablesSkeleton /> }) as React.FC<any>;
const CreditCardsTab = dynamic(() => import('./components/CreditCardsTab').then(mod => mod.CreditCardsTab), { ssr: false, loading: () => <CreditCardsSkeleton /> }) as React.FC<any>;
const FixedIncomeTab = dynamic(() => import('./components/FixedIncomeTab').then(mod => mod.FixedIncomeTab), { ssr: false, loading: () => <FixedIncomeSkeleton /> }) as React.FC<any>;
const AssetDetailsModal = dynamic(() => import('./components/AssetDetailsModal').then(mod => mod.AssetDetailsModal), { ssr: false, loading: () => <ModalSkeleton /> }) as React.FC<any>;
const CorrelationHeatmap = dynamic(() => import('./components/CorrelationHeatmap').then(mod => mod.CorrelationHeatmap), { ssr: false, loading: () => <HeatmapSkeleton /> }) as React.FC<any>;
const SmartAllocationModal = dynamic(() => import('./components/SmartAllocationModal').then(mod => mod.SmartAllocationModal), { ssr: false, loading: () => <ModalSkeleton /> }) as React.FC<any>;
const IncomeProjectionModal = dynamic(() => import('./components/IncomeProjectionModal').then(mod => mod.IncomeProjectionModal), { ssr: false, loading: () => <ModalSkeleton /> }) as React.FC<any>;
const JarvisChat = dynamic(() => import('./components/JarvisChat').then(mod => mod.JarvisChat), { ssr: false, loading: () => <ChatSkeleton /> }) as React.FC<any>;
const QuantDashboard = dynamic(() => import('./components/QuantDashboard').then(mod => mod.QuantDashboard), { ssr: false, loading: () => <QuantSkeleton /> }) as React.FC<any>;

export default function Home() {
  const { data, history, loading, refetch, syncStatus, fundamentalsStatus, mutateSync, mutateFundamentals } = useAssetData();
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [tab, setTab] = useState('Resumo');
  const [isRefetching, setIsRefetching] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);

  const isAddModalOpen = useModalStore(state => state.isAddModalOpen);
  const isSmartModalOpen = useModalStore(state => state.isSmartModalOpen);
  const isIfModalOpen = useModalStore(state => state.isIfModalOpen);
  const editingAsset = useModalStore(state => state.editingAsset);
  const selectedDetailsAsset = useModalStore(state => state.selectedDetailsAsset);
  const newsTicker = useModalStore(state => state.newsTicker);
  const setAddModalOpen = useModalStore(state => state.setAddModalOpen);
  const setSmartModalOpen = useModalStore(state => state.setSmartModalOpen);
  const setIfModalOpen = useModalStore(state => state.setIfModalOpen);
  const setEditingAsset = useModalStore(state => state.setEditingAsset);
  const setSelectedDetailsAsset = useModalStore(state => state.setSelectedDetailsAsset);
  const setNewsTicker = useModalStore(state => state.setNewsTicker);

  const notify = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handlers = usePortfolioHandlers(mutateSync, mutateFundamentals, refetch, notify);
  const metrics = usePortfolioMetrics(data, isHidden, formatMoney);

  const portfolioTabs = [
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

  const analyticsTabs = [
    { id: 'Evolução', icon: <LineChart size={14} />, label: 'Evolução' },
    { id: 'Correlação', icon: <Grip size={14} />, label: 'Correlação' },
    { id: 'Quantitativo', icon: <BarChart3 size={14} />, label: 'Análise Quant' },
    { id: 'Jarvis', icon: <Brain size={14} />, label: 'Jarvis AI' },
  ];

  useEffect(() => {
    if (syncStatus.status === 'error') {
      setTimeout(() => notify(syncStatus.message || "Erro na sincronização de relatórios CVM.", 'error'), 0);
    }
  }, [syncStatus.status, syncStatus.message, notify]);

  useEffect(() => {
    if (fundamentalsStatus.status === 'error') {
      setTimeout(() => notify(fundamentalsStatus.message || "Erro ao atualizar múltiplos do Yahoo.", 'error'), 0);
    }
  }, [fundamentalsStatus.status, fundamentalsStatus.message, notify]);

  const handleManualRefresh = useCallback(() => {
    handlers.handleManualRefresh(setIsRefetching, setShowRefreshSuccess);
  }, [handlers]);

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
          onOpenIfModal={handlers.handleOpenIfModal}
          onOpenSmartModal={handlers.handleOpenSmartModal}
          onOpenAddModal={handlers.handleOpenAddModal}
          onFixAsset={handleFixAsset}
          loading={true}
          isRefetching={false}
          showRefreshSuccess={false}
        />
        <SkeletonLoading />
      </main>
    );
  }


  // --- RENDER FUNCTIONS ---
  
  const renderNavigationTabs = () => (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[125px]">Minha Carteira:</span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {portfolioTabs.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border ${tab === c.id
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                : 'bg-slate-900/45 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:border-slate-700/50'
                }`}
            >
              {c.icon}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-slate-900/50">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[125px]">Análises & IA:</span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-1 md:pb-0">
          {analyticsTabs.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border ${tab === c.id
                ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
                : 'bg-slate-900/45 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:border-slate-700/50'
                }`}
            >
              {c.icon}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSummaryDashboard = () => (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Yield on Cost Médio"
          value={isHidden ? '•••' : metrics.yocMedio.toFixed(2) + '%'}
          subtext="Anual Est."
          icon={Percent}
          colorClass="text-purple-400"
        />
        <StatCard
          title="Total Investido"
          value={metrics.money(metrics.totalInvestido)}
          subtext="Custo de Aquisição"
          icon={PiggyBank}
          colorClass="text-blue-400"
        />
        <StatCard
          title="Lucro / Prejuízo"
          value={isHidden ? '••••••' : (metrics.lucroTotal > 0 ? '+' : '') + formatMoney(metrics.lucroTotal)}
          subtext="Total Histórico"
          icon={BarChart3}
          colorClass={metrics.lucroTotal >= 0 ? "text-green-400" : "text-red-400"}
          dailyResult={metrics.variacaoDiariaTotal}
        />
        <StatCard
          title="Top Insight"
          type="insight"
          colorClass="text-indigo-400"
          icon={Target}
          value={metrics.topCompras.length > 0 ? metrics.topCompras[0].ticker : "--"}
          badge={metrics.topCompras.length > 0 ? metrics.topCompras[0].recomendacao : undefined}
          marquee={metrics.topCompras.length > 0 ? `${metrics.topCompras[0].motivo} • Potencial Identificado •` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[525px]">
        <div className="h-full w-full">
          <RiskRadar alertas={data?.alertas || []} />
        </div>
        <div className="lg:col-span-2 h-full w-full">
          <CategorySummary ativos={data?.ativos || []} categorias={(data as any)?.categorias || []} onUpdate={() => refetch()} />
        </div>
      </div>
    </div>
  );

  const renderDynamicTabContent = () => {
    switch (tab) {
      case 'Resumo': return renderSummaryDashboard();
      case 'Evolução': return <div className="animate-in fade-in duration-500 min-h-[400px] w-full"><HistoryChart data={history} /></div>;
      case 'Correlação': return <div className="animate-in fade-in duration-500 min-h-[400px] w-full"><CorrelationHeatmap /></div>;
      case 'Quantitativo': return <div className="animate-in fade-in duration-500 w-full"><QuantDashboard /></div>;
      case 'Renda Fixa': return <div className="animate-in fade-in duration-500 w-full"><FixedIncomeTab /></div>;
      case 'Financeiro': return <div className="animate-in fade-in duration-500 w-full"><ReceivablesTab /></div>;
      case 'Cartoes': return <div className="animate-in fade-in duration-500 w-full"><CreditCardsTab /></div>;
      case 'Jarvis':
        return (
          <div className="animate-in fade-in duration-500 w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1"><MorningBriefing /></div>
            <div className="lg:col-span-2"><JarvisChat /></div>
          </div>
        );
      default: return null;
    }
  };

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
        onOpenIfModal={handlers.handleOpenIfModal}
        onOpenSmartModal={handlers.handleOpenSmartModal}
        onOpenAddModal={handlers.handleOpenAddModal}
        onFixAsset={handleFixAsset}
        loading={loading}
        isRefetching={isRefetching}
        showRefreshSuccess={showRefreshSuccess}
      />

      {renderNavigationTabs()}

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {renderDynamicTabContent()}

        <AssetsTable
          assets={data?.ativos || []}
          tab={tab}
          onEdit={(a) => setEditingAsset(a)}
          onViewNews={(ticker) => setNewsTicker(ticker)}
          onViewDetails={(a) => setSelectedDetailsAsset(a)}
        />

        <EditModal isOpen={!!editingAsset} onClose={() => setEditingAsset(null)} onSave={() => refetch()} ativo={editingAsset} allAssets={data?.ativos || []} />
        <AddAssetModal isOpen={isAddModalOpen} onClose={() => setAddModalOpen(false)} onSuccess={() => refetch()} />
        <AssetNewsPanel ticker={newsTicker} onClose={() => setNewsTicker(null)} />
        <SmartAllocationModal
          isOpen={isSmartModalOpen}
          onClose={() => setSmartModalOpen(false)}
          ativos={data?.ativos || []}
        />
        <AssetDetailsModal
          isOpen={!!selectedDetailsAsset}
          onClose={() => setSelectedDetailsAsset(null)}
          asset={selectedDetailsAsset}
        />

        {syncStatus.status === 'processing' && (
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-950/90 border border-purple-500/50 text-purple-200 shadow-[0_0_25px_rgba(147,51,234,0.3)] transition-all duration-300 animate-in slide-in-from-left-10 fade-in backdrop-blur-sm">
            <RefreshCw size={18} className="text-purple-400 animate-spin" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Inteligência Operando</span>
              <span className="text-xs font-semibold text-slate-100 tabular-nums">{syncStatus.message || 'Processando lote de dados...'}</span>
            </div>
          </div>
        )}

        {fundamentalsStatus.status === 'processing' && (
          <div className={`fixed ${syncStatus.status === 'processing' ? 'bottom-24' : 'bottom-5'} left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all duration-300 animate-in slide-in-from-left-10 fade-in backdrop-blur-sm`}>
            <Brain size={18} className="text-emerald-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Valuation & Múltiplos</span>
              <span className="text-xs font-semibold text-slate-100">{fundamentalsStatus.message || 'Conectando ao Yahoo Finance...'}</span>
            </div>
          </div>
        )}

        {toast && (
          <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] border transition-all duration-300 animate-in slide-in-from-right-10 fade-in ${toast.type === 'success'
            ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
            : 'bg-red-950/90 border-red-500/50 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
            }`}>
            {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]" /> : <AlertTriangle size={20} />}
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                {toast.type === 'success' ? 'Sucesso' : 'Atenção'}
              </span>
              <span className="text-sm font-medium">{toast.msg}</span>
            </div>
            <button type="button" onClick={() => setToast(null)} className="ml-2 hover:bg-white/10 p-1 rounded-full transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="text-center text-[10px] text-slate-600 mt-12 mb-4">AssetFlow v7.5 (Neon Edition)</div>
      </div>

      {isIfModalOpen && (
        <IncomeProjectionModal onClose={() => setIfModalOpen(false)} />
      )}
    </main>
  );
}
