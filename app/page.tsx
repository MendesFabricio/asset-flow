'use client';
import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { apiCall } from './utils/apiClient';
import {
  TrendingUp, Wallet, Target, Layers, RefreshCw, PiggyBank, BarChart3, LineChart, PlusCircle,
  Brain, Calendar, Eye, EyeOff, Percent, Grip, Building2, Globe, Landmark, Bitcoin,
  CheckCircle, AlertTriangle, X, Search, CreditCard
} from 'lucide-react';
import { usePrivacy } from './context/PrivacyContext';
import { formatMoney } from './utils';
import { StatCard } from './components/StatCard';
import { useAssetData } from './hooks/useAssetData';
import { DashboardHeader } from './components/DashboardHeader';
import { AssetsTable } from './components/AssetsTable';
import { Asset } from './types';
import { useModalStore } from './store/modalStore';
import { MorningBriefing } from './components/MorningBriefing';
import { SkeletonLoading } from './components/SkeletonLoading';

const RiskRadar = dynamic(() => import('./components/RiskRadar').then(mod => mod.RiskRadar), { ssr: false, loading: () => <SkeletonLoading /> });
const HistoryChart = dynamic(() => import('./components/HistoryChart').then(mod => mod.HistoryChart), { ssr: false, loading: () => <SkeletonLoading /> });
const CategorySummary = dynamic(() => import('./components/CategorySummary').then(mod => mod.CategorySummary), { ssr: false, loading: () => <SkeletonLoading /> });
const EditModal = dynamic(() => import('./components/EditModal').then(mod => mod.EditModal), { ssr: false, loading: () => <SkeletonLoading /> });
const AddAssetModal = dynamic(() => import('./components/AddAssetModal').then(mod => mod.AddAssetModal), { ssr: false, loading: () => <SkeletonLoading /> });
const AssetNewsPanel = dynamic(() => import('./components/AssetNewsPanel').then(mod => mod.AssetNewsPanel), { ssr: false, loading: () => <SkeletonLoading /> });
const RiskMetricsPanel = dynamic(() => import('./components/RiskMetricsPanel').then(mod => mod.RiskMetricsPanel), { ssr: false, loading: () => <SkeletonLoading /> });
const ReceivablesTab = dynamic(() => import('./components/ReceivablesTab').then(mod => mod.ReceivablesTab), { ssr: false, loading: () => <SkeletonLoading /> });
const CreditCardsTab = dynamic(() => import('./components/CreditCardsTab'), { ssr: false, loading: () => <SkeletonLoading /> });
const FixedIncomeTab = dynamic(() => import('./components/FixedIncomeTab'), { ssr: false, loading: () => <SkeletonLoading /> });
const AssetDetailsModal = dynamic(() => import('./components/AssetDetailsModal').then(mod => mod.AssetDetailsModal), { ssr: false, loading: () => <SkeletonLoading /> });

const MonteCarloChart = dynamic(() => import('./components/MonteCarloChart').then(mod => mod.MonteCarloChart), { ssr: false, loading: () => <SkeletonLoading /> });
const CorrelationHeatmap = dynamic(() => import('./components/CorrelationHeatmap').then(mod => mod.CorrelationHeatmap), { ssr: false, loading: () => <SkeletonLoading /> });

const SmartAllocationModal = dynamic(() => import('./components/SmartAllocationModal').then(mod => mod.SmartAllocationModal), { ssr: false, loading: () => <SkeletonLoading /> });
const IncomeProjectionModal = dynamic(() => import('./components/IncomeProjectionModal').then(mod => mod.IncomeProjectionModal), { ssr: false, loading: () => <SkeletonLoading /> });
const JarvisChat = dynamic(() => import('./components/JarvisChat').then(mod => mod.JarvisChat), { ssr: false, loading: () => <SkeletonLoading /> });
const QuantDashboard = dynamic(() => import('./components/QuantDashboard').then(mod => mod.QuantDashboard), { ssr: false, loading: () => <SkeletonLoading /> });


export default function Home() {
  const {
    data,
    history,
    loading,
    refetch,
    syncStatus,
    fundamentalsStatus,
    mutateSync,
    mutateFundamentals
  } = useAssetData();

  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [tab, setTab] = useState('Resumo');
  const {
    isAddModalOpen,
    isSmartModalOpen,
    isIfModalOpen,
    editingAsset,
    selectedDetailsAsset,
    newsTicker,
    setAddModalOpen,
    setSmartModalOpen,
    setIfModalOpen,
    setEditingAsset,
    setSelectedDetailsAsset,
    setNewsTicker,
  } = useModalStore();

  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);


  const syncingReports = syncStatus.status === 'processing';
  const updatingFundamentals = fundamentalsStatus.status === 'processing';

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const portfolioTabs = [
    { id: 'Resumo', icon: <Layers size={14} />, label: 'Resumo' },
    { id: 'Ação', icon: <TrendingUp size={14} />, label: 'Ações' },
    { id: 'FII', icon: <Building2 size={14} />, label: 'FIIs' },
    { id: 'Internacional', icon: <Globe size={14} />, label: 'Internacional' },
    { id: 'Cripto', icon: <Bitcoin size={14} />, label: 'Cripto' },
    { id: 'Renda Fixa', icon: <Landmark size={14} />, label: 'Renda Fixa' },
    { id: 'Reserva', icon: <Wallet size={14} />, label: 'CDB / LCI' },
    { id: 'Financeiro', icon: <Wallet size={14} />, label: 'Reembolsos' },
    { id: 'Cartoes', icon: <CreditCard size={14} />, label: 'Cartões' },
  ];

  const analyticsTabs = [
    { id: 'Evolução', icon: <LineChart size={14} />, label: 'Evolução' },
    { id: 'Correlação', icon: <Grip size={14} />, label: 'Correlação' },
    { id: 'Quantitativo', icon: <BarChart3 size={14} />, label: 'Análise Quant' },
    { id: 'Jarvis', icon: <Brain size={14} />, label: 'Jarvis AI' },
  ];



  const topCompras = useMemo(() => {
    return data?.ativos?.filter((a) => a.falta_comprar > 0).sort((a, b) => b.score - a.score).slice(0, 3) || [];
  }, [data?.ativos]);

  const lucroTotal = useMemo(() => {
    return data?.resumo?.LucroTotal || 0;
  }, [data?.resumo?.LucroTotal]);

  const totalInvestido = useMemo(() => {
    return data?.resumo?.TotalInvestido ?? 0;
  }, [data?.resumo?.TotalInvestido]);

  const rendaMensal = useMemo(() => {
    return data?.resumo?.RendaMensal ?? 0;
  }, [data?.resumo?.RendaMensal]);

  const yocMedio = useMemo(() => {
    return totalInvestido > 0 ? ((rendaMensal * 12) / totalInvestido) * 100 : 0;
  }, [totalInvestido, rendaMensal]);

  const variacaoDiariaTotal = useMemo(() => {
    return data?.ativos?.reduce((acc: number, asset: Asset) => {
      const variacaoPct = (asset as Asset & { change_percent?: number }).change_percent || 0;
      const totalAtual = asset.total_atual || 0;
      const valOntem = totalAtual / (1 + variacaoPct / 100);
      return acc + (totalAtual - valOntem);
    }, 0) || 0;
  }, [data?.ativos]);

  const money = (val: number) => isHidden ? '••••••' : formatMoney(val);

  // Monitora alterações nos canais SSE de sincronismo para notificar erros/sucessos ao usuário via Toast
  useEffect(() => {
    if (syncStatus.status === 'error') {
      notify(syncStatus.message || "Erro na sincronização de relatórios CVM.", 'error');
    }
  }, [syncStatus.status]);

  useEffect(() => {
    if (fundamentalsStatus.status === 'error') {
      notify(fundamentalsStatus.message || "Erro ao atualizar múltiplos do Yahoo.", 'error');
    }
  }, [fundamentalsStatus.status]);

  const handleSyncReports = async () => {
    // Força o estado local para processando imediatamente (Optimistic UI)
    mutateSync({ status: 'processing', message: 'Iniciando barramento de sincronia...' }, false);
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/sync-reports', { method: 'POST' });
      notify(result.msg, 'success');
      mutateSync();
    } catch (e: any) {
      console.error(e);

      // ✅ SE FOR CONFLITO (409): Avisa o usuário e revalida para pegar o progresso real ativo
      if (e.message?.includes('409')) {
        notify("Uma sincronização já está em andamento em segundo plano. Conectando ao canal...", 'error');
        mutateSync(); // Força a busca do estado real de processamento do backend
      } else {
        // Se for um erro de rede ou queda do backend, aí sim joga para idle
        notify("Falha ao conectar com o servidor para sincronizar relatórios.", 'error');
        mutateSync({ status: 'idle', message: '' }, false);
      }
    }
  };

  const handleUpdateFundamentals = async () => {
    // Força o estado local para processando imediatamente (Optimistic UI)
    mutateFundamentals({ status: 'processing', message: 'Iniciando esteira de múltiplos...' }, false);
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/update-fundamentals', { method: 'POST' });
      notify(result.msg, 'success');
      mutateFundamentals();
    } catch (e: any) {
      console.error(e);

      // ✅ SE FOR CONFLITO (409): Avisa o usuário e sincroniza com o lote em andamento
      if (e.message?.includes('409')) {
        notify("A esteira de múltiplos do Yahoo já está rodando. Sincronizando com o lote...", 'error');
        mutateFundamentals(); // Revalida para trazer o status e mensagem corretos do backend
      } else {
        // Erro físico de conexão externa
        notify("Falha ao conectar com o servidor de fundamentos.", 'error');
        mutateFundamentals({ status: 'idle', message: '' }, false);
      }
    }
  };

  const handleManualRefresh = async () => {
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
  };

  const handleFixAsset = (assetId: number) => {
    const assetToEdit = data?.ativos.find((a: Asset) => (a as Asset & { id?: number }).id === assetId);
    if (assetToEdit) setEditingAsset(assetToEdit);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative">
        <DashboardHeader
          total={0}
          rendaMensal={0}
          money={(v) => '••••••'}
          syncStatus={{ status: 'idle', message: '' }}
          fundamentalsStatus={{ status: 'idle', message: '' }}
          onSyncReports={handleSyncReports}
          onUpdateFundamentals={handleUpdateFundamentals}
          onManualRefresh={handleManualRefresh}
          onOpenIfModal={() => setIfModalOpen(true)}
          onOpenSmartModal={() => setSmartModalOpen(true)}
          onOpenAddModal={() => setAddModalOpen(true)}
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
    <main className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans selection:bg-blue-500/30 pb-20 relative">
      {/* HEADER PRINCIPAL EXTRAÍDO */}
      <DashboardHeader
        total={data?.resumo?.Total || 0}
        rendaMensal={rendaMensal}
        money={money}
        syncStatus={syncStatus}
        fundamentalsStatus={fundamentalsStatus}
        onSyncReports={handleSyncReports}
        onUpdateFundamentals={handleUpdateFundamentals}
        onManualRefresh={handleManualRefresh}
        onOpenIfModal={() => setIfModalOpen(true)}
        onOpenSmartModal={() => setSmartModalOpen(true)}
        onOpenAddModal={() => setAddModalOpen(true)}
        onFixAsset={handleFixAsset}
        loading={loading}
        isRefetching={isRefetching}
        showRefreshSuccess={showRefreshSuccess}
      />

      {/* TABS DE CATEGORIAS E BUSCA */}
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
        {/* Ativos e Carteira */}
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

        {/* Análises e Inteligência */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-slate-900/50">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[125px]">Análises & Jarvis:</span>
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

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {tab === 'Resumo' && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
            <MorningBriefing />
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Yield on Cost Médio"
                value={isHidden ? '•••' : yocMedio.toFixed(2) + '%'}
                subtext="Anual Est."
                icon={Percent}
                colorClass="text-purple-400"
              />
              <StatCard
                title="Total Investido"
                value={money(totalInvestido)}
                subtext="Custo de Aquisição"
                icon={PiggyBank}
                colorClass="text-blue-400"
              />
              <StatCard
                title="Lucro / Prejuízo"
                value={isHidden ? '••••••' : (lucroTotal > 0 ? '+' : '') + formatMoney(lucroTotal)}
                subtext="Total Histórico"
                icon={BarChart3}
                colorClass={lucroTotal >= 0 ? "text-green-400" : "text-red-400"}
                dailyResult={variacaoDiariaTotal}
              />
              <StatCard
                title="Top Insight"
                type="insight"
                colorClass="text-indigo-400"
                icon={Target}
                value={topCompras.length > 0 ? topCompras[0].ticker : "--"}
                badge={topCompras.length > 0 ? topCompras[0].recomendacao : undefined}
                marquee={topCompras.length > 0 ? `${topCompras[0].motivo} • Potencial Identificado •` : undefined}
              />
            </div>

            {/* GRID PRINCIPAL */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[525px]">
              <div className="h-full">
                <RiskRadar alertas={data?.alertas || []} />
              </div>
              <div className="lg:col-span-2 h-full">
                <CategorySummary ativos={data?.ativos || []} categorias={(data as any)?.categorias || []} onUpdate={() => refetch()} />
              </div>
            </div>

            {/* MONTE CARLO */}
            <div className="w-full relative z-0">
              <MonteCarloChart />
            </div>

            {/* ATRIBUIÇÃO DE PERFORMANCE */}
            <div className="w-full">
              <RiskMetricsPanel />
            </div>
          </div>
        )}

        {tab === 'Evolução' && (
          <div className="animate-in fade-in h-[400px] w-full">
            <HistoryChart data={history} />
          </div>
        )}

        {tab === 'Correlação' && (
          <div className="animate-in fade-in w-full">
            <CorrelationHeatmap />
          </div>
        )}

        {tab === 'Quantitativo' && (
          <div className="animate-in fade-in w-full">
            <QuantDashboard />
          </div>
        )}

        {tab === 'Renda Fixa' && (
          <div className="animate-in fade-in w-full">
            <FixedIncomeTab />
          </div>
        )}

        {tab === 'Financeiro' && (
          <div className="animate-in fade-in w-full">
            <ReceivablesTab />
          </div>
        )}

        {tab === 'Cartoes' && (
          <div className="animate-in fade-in w-full">
            <CreditCardsTab />
          </div>
        )}

        {tab === 'Jarvis' && (
          <div className="animate-in fade-in w-full">
            <JarvisChat />
          </div>
        )}


        {/* TABELA DE ATIVOS EXTRAÍDA */}
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

        {/* WIDGET FLUTUANTE DE PROGRESSO REAL-TIME CVM */}
        {syncingReports && (
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-purple-950/90 border border-purple-500/50 text-purple-200 shadow-[0_0_25px_rgba(147,51,234,0.3)] transition-all duration-300 animate-in slide-in-from-left-10 fade-in backdrop-blur-sm">
            <RefreshCw size={18} className="text-purple-400 animate-spin" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">Inteligência Operando</span>
              <span className="text-xs font-semibold text-slate-100 tabular-nums">{syncStatus.message || 'Processando lote de dados...'}</span>
            </div>
          </div>
        )}

        {/* WIDGET FLUTUANTE DE FUNDAMENTOS REAL-TIME YAHOO */}
        {updatingFundamentals && (
          <div className={`fixed ${syncingReports ? 'bottom-24' : 'bottom-5'} left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.3)] transition-all duration-300 animate-in slide-in-from-left-10 fade-in backdrop-blur-sm`}>
            <Brain size={18} className="text-emerald-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Valuation & Múltiplos</span>
              <span className="text-xs font-semibold text-slate-100">{fundamentalsStatus.message || 'Conectando ao Yahoo Finance...'}</span>
            </div>
          </div>
        )}

        {/* TOAST NOTIFICATIONS */}
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
