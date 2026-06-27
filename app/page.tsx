'use client';
import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { apiCall } from './utils/apiClient';
import {
  TrendingUp, Wallet, Target, Layers, RefreshCw, PiggyBank, BarChart3, LineChart, PlusCircle,
  Brain, Calendar, Eye, EyeOff, Percent, Grip, Building2, Globe, Landmark, Bitcoin,
  CheckCircle, AlertTriangle, X
} from 'lucide-react';
import { usePrivacy } from './context/PrivacyContext';
import { formatMoney } from './utils';
import { StatCard } from './components/StatCard';
import { RiskRadar } from './components/RiskRadar';
import { HistoryChart } from './components/HistoryChart';
import { CategorySummary } from './components/CategorySummary';
import { EditModal } from './components/EditModal';
import { AddAssetModal } from './components/AddAssetModal';
import AssetNewsPanel from './components/AssetNewsPanel';
import { useAssetData } from './hooks/useAssetData';
import { RiskMetricsPanel } from './components/RiskMetricsPanel';
import { ReceivablesTab } from './components/ReceivablesTab';
import { AssetDetailsModal } from './components/AssetDetailsModal';
import { DashboardHeader } from './components/DashboardHeader';
import { AssetsTable } from './components/AssetsTable';
import { Asset } from './types';

const MonteCarloChart = dynamic(() => import('./components/MonteCarloChart'), { ssr: false });
const CorrelationMatrix = dynamic(() => import('./components/CorrelationMatrix'), { ssr: false });
const SmartAllocationModal = dynamic(() => import('./components/SmartAllocationModal').then(mod => mod.SmartAllocationModal), { ssr: false });
const IncomeProjectionModal = dynamic(() => import('./components/IncomeProjectionModal').then(mod => mod.IncomeProjectionModal), { ssr: false });

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
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newsTicker, setNewsTicker] = useState<string | null>(null);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);
  const [isIfModalOpen, setIsIfModalOpen] = useState(false);
  const [selectedDetailsAsset, setSelectedDetailsAsset] = useState<Asset | null>(null);

  const syncingReports = syncStatus.status === 'processing';
  const updatingFundamentals = fundamentalsStatus.status === 'processing';

  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const categories = [
    { id: 'Resumo', icon: <Layers size={16} /> },
    { id: 'Ação', icon: <TrendingUp size={16} /> },
    { id: 'FII', icon: <Building2 size={16} /> },
    { id: 'Internacional', icon: <Globe size={16} /> },
    { id: 'Cripto', icon: <Bitcoin size={16} />, label: 'Criptomoeda' },
    { id: 'Renda Fixa', icon: <Landmark size={16} />, label: 'Renda Fixa' },
    { id: 'Reserva', icon: <Wallet size={16} />, label: 'Reserva' },
    { id: 'Evolução', icon: <LineChart size={16} /> },
    { id: 'Correlação', icon: <Grip size={16} />, label: "Heatmap" },
    { id: 'Financeiro', icon: <Wallet size={16} />, label: 'Reembolsos' },
  ];

  // ── Filtragens Otimizadas com useMemo ────────────────────────────────────
  const filteredAssets = useMemo(() => {
    return data?.ativos?.filter((a) =>
      ['Evolução', 'Correlação', 'Financeiro', 'Resumo'].includes(tab) ? true : a.tipo === tab
    ).sort((a, b) => a.ticker.localeCompare(b.ticker)) || [];
  }, [data?.ativos, tab]);

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
      const divisor = 1 + (variacaoPct / 100);
      const valOntem = divisor > 0.0001 ? totalAtual / divisor : totalAtual;
      return acc + (totalAtual - valOntem);
    }, 0) || 0;
  }, [data?.ativos]);

  const money = (val: number) => isHidden ? '••••••' : formatMoney(val);

  const handleSyncReports = async () => {
    mutateSync({ status: 'processing', message: 'Iniciando barramento de sincronia...' }, false);
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/sync-reports', { method: 'POST' });
      notify(result.msg, 'success');
      mutateSync();
    } catch (e) {
      console.error(e);
      notify("Falha ao conectar com o servidor para sincronizar relatórios.", 'error');
      mutateSync({ status: 'idle', message: '' }, false);
    }
  };

  const handleUpdateFundamentals = async () => {
    mutateFundamentals({ status: 'processing', message: 'Iniciando esteira de múltiplos...' }, false);
    try {
      const result = await apiCall<{ status: string; msg: string }>('/api/update-fundamentals', { method: 'POST' });
      notify(result.msg, 'success');
      mutateFundamentals();
    } catch (e) {
      console.error(e);
      notify("Falha ao conectar com o servidor de fundamentos.", 'error');
      mutateFundamentals({ status: 'idle', message: '' }, false);
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

  if (loading) return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center text-slate-500 gap-4">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="animate-pulse text-sm">Carregando Inteligência...</p>
    </div>
  );

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
        onOpenIfModal={() => setIsIfModalOpen(true)}
        onOpenSmartModal={() => setIsSmartModalOpen(true)}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onFixAsset={handleFixAsset}
        loading={loading}
        isRefetching={isRefetching}
        showRefreshSuccess={showRefreshSuccess}
      />

      {/* TABS DE CATEGORIAS */}
      <div className="max-w-7xl mx-auto px-4 py-4 flex gap-2 overflow-x-auto no-scrollbar">
        {categories.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => setTab(c.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 border ${
              tab === c.id
                ? 'bg-blue-600/10 text-blue-400 border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                : 'bg-slate-900/40 text-slate-500 border-slate-800/60 hover:text-slate-300 hover:border-slate-700/50'
            }`}
          >
            {c.icon}
            <span>{c.label || c.id}</span>
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {tab === 'Resumo' && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 h-[525px]">
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
            <CorrelationMatrix />
          </div>
        )}

        {tab === 'Financeiro' && (
          <div className="animate-in fade-in w-full">
            <ReceivablesTab />
          </div>
        )}

        {/* TABELA DE ATIVOS EXTRAÍDA */}
        <AssetsTable
          assets={filteredAssets}
          tab={tab}
          onEdit={(a) => setEditingAsset(a)}
          onViewNews={(ticker) => setNewsTicker(ticker)}
          onViewDetails={(a) => setSelectedDetailsAsset(a)}
        />

        <EditModal isOpen={!!editingAsset} onClose={() => setEditingAsset(null)} onSave={() => refetch()} ativo={editingAsset} allAssets={data?.ativos || []} />
        <AddAssetModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={() => refetch()} />
        <AssetNewsPanel ticker={newsTicker} onClose={() => setNewsTicker(null)} />

        <SmartAllocationModal
          isOpen={isSmartModalOpen}
          onClose={() => setIsSmartModalOpen(false)}
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
        <IncomeProjectionModal onClose={() => setIsIfModalOpen(false)} />
      )}
    </main>
  );
}
