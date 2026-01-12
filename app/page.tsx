'use client';
import { useState } from 'react';
import {
  TrendingUp, Wallet, DollarSign, Activity,
  Target, Layers, RefreshCw, PiggyBank, BarChart3, LineChart, ArrowUpRight, PlusCircle,
  Brain, Calendar, Eye, EyeOff, Percent, Grip, Building2, Globe, Landmark, Bitcoin, Calculator
} from 'lucide-react';
import Link from 'next/link';
import { usePrivacy } from './context/PrivacyContext';
import { formatMoney } from './utils';
import { StatCard } from './components/StatCard';
import { AssetRow } from './components/AssetRow';
import { RiskRadar } from './components/RiskRadar';
import { HistoryChart } from './components/HistoryChart';
import { CategorySummary } from './components/CategorySummary';
import { EditModal } from './components/EditModal';
import { AddAssetModal } from './components/AddAssetModal';
import AssetNewsPanel from './components/AssetNewsPanel';
import { useAssetData } from './hooks/useAssetData';
import MonteCarloChart from './components/MonteCarloChart';
import CorrelationMatrix from './components/CorrelationMatrix';
import { AlertsButton } from './components/AlertsButton';
import { SmartAllocationModal } from './components/SmartAllocationModal';
import { ReceivablesTab } from './components/ReceivablesTab';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';

export default function Home() {
  const { data, history, loading, refreshing, error, refetch } = useAssetData();
  const { isHidden, togglePrivacy } = usePrivacy();

  // 1. Estado da Notificação (Toast)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // 2. Função auxiliar para disparar a notificação
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000); // Some após 3 segundos
  };

  const [tab, setTab] = useState('Resumo');
  const [editingAsset, setEditingAsset] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newsTicker, setNewsTicker] = useState<string | null>(null);
  const [updatingFundamentals, setUpdatingFundamentals] = useState(false);
  const [syncingReports, setSyncingReports] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);

  // 🆕 Novo State para o Modal de Aporte Inteligente
  const [isSmartModalOpen, setIsSmartModalOpen] = useState(false);

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

  const filteredAssets = data?.ativos?.filter((a) =>
    ['Evolução', 'Correlação'].includes(tab) ? true : a.tipo === tab
  ).sort((a, b) => a.ticker.localeCompare(b.ticker)) || [];

  const topCompras = data?.ativos?.filter((a) => a.falta_comprar > 0).sort((a, b) => b.score - a.score).slice(0, 3) || [];
  const lucroTotal = data?.resumo?.LucroTotal || 0;

  const yocMedio = data?.resumo?.TotalInvestido > 0
    ? ((data.resumo.RendaMensal * 12) / data.resumo.TotalInvestido) * 100
    : 0;

  // 👇 CÁLCULO CORRIGIDO DA VARIAÇÃO DIÁRIA TOTAL 👇
  const variacaoDiariaTotal = data?.ativos?.reduce((acc: number, asset: any) => {
    const variacaoPct = asset.change_percent || 0;
    const totalAtual = asset.total_atual || 0;

    // Cálculo Reverso: Se hoje = ontem * (1 + pct), então ontem = hoje / (1 + pct)
    const divisor = 1 + (variacaoPct / 100);
    // Proteção contra divisão por zero se algo bizarro acontecer
    const valOntem = divisor > 0.0001 ? totalAtual / divisor : totalAtual;

    // O lucro do dia é a diferença entre o valor de hoje e o valor de ontem
    return acc + (totalAtual - valOntem);
  }, 0) || 0;

  const money = (val: number) => isHidden ? '••••••' : formatMoney(val);

  const handleSyncReports = async () => {
    setSyncingReports(true);
    try {
      const response = await fetch('http://localhost:5328/api/sync-reports', { method: 'POST' });
      const result = await response.json();
      if (result.status === "Sucesso") {
        notify(result.msg, 'success');
        refetch(true);
      } else {
        notify("Erro: " + result.msg, 'error');
      }
    } catch (e) {
      console.error(e);
      notify("Falha ao conectar com o servidor para sincronizar relatórios.", 'error');
    } finally {
      setSyncingReports(false);
    }
  };

  const handleUpdateFundamentals = async () => {
    setUpdatingFundamentals(true);
    try {
      await fetch('http://localhost:5328/api/update-fundamentals', { method: 'POST' });
      notify("Sucesso! Inteligência atualizada.", 'success');
      refetch(true);
    } catch (e) { console.error(e); }
    finally { setUpdatingFundamentals(false); }
  };

  const handleManualRefresh = async () => {
    setIsRefetching(true);
    try {
      await fetch('http://localhost:5328/api/refresh_prices', { method: 'POST' });
      await refetch(true);

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
    const assetToEdit = data?.ativos.find((a: any) => a.id === assetId);
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

      {/* HEADER FIXO */}
      <div className="sticky top-0 z-30 bg-[#0b0f19]/95 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)]">
              <Wallet className="text-white" size={18} />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">AssetFlow <span className="text-blue-500 text-xs font-normal ml-1">Pro</span></h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Link href="/agenda" className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-slate-700 group">
                <Calendar size={16} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
                <span className="hidden sm:inline">Proventos</span>
              </Link>

              {/* 🆕 BOTÃO SIMULADOR DE APORTE (COM GLOW ROXO) */}
              <button
                onClick={() => setIsSmartModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-purple-500/50 shadow-[0_0_15px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(147,51,234,0.6)] duration-300"
              >
                <Calculator size={16} />
                <span className="hidden sm:inline">Simular Aporte</span>
              </button>

              {/* 🆕 BOTÃO NOVO ATIVO (COM GLOW AZUL) */}
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] duration-300"
              >
                <PlusCircle size={16} /> <span className="hidden sm:inline">Novo Ativo</span>
              </button>
            </div>

            <div className="h-6 w-px bg-slate-800 mx-1"></div>

            <div className="flex items-center gap-2">
              <button onClick={togglePrivacy} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors">
                {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>

              <AlertsButton onFixAsset={handleFixAsset} />

              <button
                onClick={handleSyncReports}
                disabled={syncingReports}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 disabled:opacity-50 group relative"
                title="Sincronizar Relatórios CVM"
              >
                <Layers size={16} className={syncingReports ? 'animate-bounce text-blue-400' : 'text-slate-400'} />
                {syncingReports && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                )}
              </button>

              <button onClick={handleUpdateFundamentals} disabled={updatingFundamentals} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 disabled:opacity-50">
                <Brain size={16} className={updatingFundamentals ? 'animate-pulse text-emerald-400' : ''} />
              </button>

              <button
                onClick={handleManualRefresh}
                disabled={refreshing || isRefetching || showRefreshSuccess}
                className={`p-2 rounded-lg border transition-all duration-300 ${showRefreshSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  } disabled:opacity-50`}
                title="Recarregar dados"
              >
                <RefreshCw
                  size={16}
                  className={`${(refreshing || isRefetching) ? 'animate-spin' : ''} ${showRefreshSuccess ? 'text-emerald-400' : ''}`}
                />
              </button>
            </div>

            <div className="text-right hidden md:block border-l border-slate-800 pl-4 ml-2 min-w-[140px]">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Patrimônio</p>
              <p className="text-lg font-bold text-white leading-tight mt-0.5">
                {data ? money(data.resumo.Total) : '...'}
              </p>
              {data?.resumo?.RendaMensal > 0 && (
                <div className="text-[10px] text-emerald-500 font-bold mt-1 flex items-center justify-end gap-1 leading-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  {money(data.resumo.RendaMensal)}
                  <span className="text-[8px] opacity-70 ml-0.5 uppercase tracking-tighter">est.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 flex gap-4 overflow-x-auto no-scrollbar border-t border-slate-800/30">
          {categories.map((c) => (
            <button key={c.id} onClick={() => setTab(c.id)} className={`flex items-center gap-2 px-1 py-3 text-xs font-medium transition-all relative border-b-2 whitespace-nowrap ${tab === c.id ? 'border-blue-500 text-white shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              {c.icon}{c.label || c.id}
            </button>
          ))}
        </div>
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
                value={money(data?.resumo?.TotalInvestido || 0)}
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
                // 👇 AQUI ESTÁ A LIGAÇÃO COM O NOVO CÁLCULO
                dailyResult={variacaoDiariaTotal}
              />

              {/* TOP INSIGHT */}
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
                <CategorySummary ativos={data?.ativos || []} categorias={data?.categorias || []} onUpdate={() => refetch(true)} />
              </div>
            </div>

            {/* MONTE CARLO */}
            <div className="w-full relative z-0">
              <MonteCarloChart />
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

        {/* TABELA DE ATIVOS */}
        {!['Resumo', 'Evolução', 'Correlação', 'Financeiro'].includes(tab) && (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl animate-in slide-in-from-bottom-4 mt-6">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="p-4 pl-6">Ativo</th>
                    <th className="p-4 text-right">Minha Posição</th>
                    <th className="p-4 text-right hidden sm:table-cell">Preço</th>
                    <th className="p-4 text-right">Resultado</th>
                    <th className="p-4 text-right hidden md:table-cell">Meta</th>
                    <th className="p-4 text-right">Aporte</th>
                    {(tab === 'Ação' || tab === 'FII') && <th className="p-4 text-center hidden lg:table-cell w-24">Indicadores</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredAssets.length > 0 ? filteredAssets.map((ativo, index) => (
                    <AssetRow key={ativo.ticker} ativo={ativo} tab={tab} onEdit={(a) => setEditingAsset(a)} onViewNews={(ticker) => setNewsTicker(ticker)} index={index} total={filteredAssets.length} />
                  )) : <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum ativo encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <EditModal isOpen={!!editingAsset} onClose={() => setEditingAsset(null)} onSave={() => refetch(true)} ativo={editingAsset} allAssets={data?.ativos || []} />
        <AddAssetModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSuccess={() => refetch(true)} />
        <AssetNewsPanel ticker={newsTicker} onClose={() => setNewsTicker(null)} />

        {/* 🆕 MODAL DE SIMULAÇÃO DE APORTE */}
        <SmartAllocationModal
          isOpen={isSmartModalOpen}
          onClose={() => setIsSmartModalOpen(false)}
          ativos={data?.ativos || []}
        />

        {/* 👇 COMPONENTE DO TOAST (COM GLOW SUTIL) 👇 */}
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
            <button onClick={() => setToast(null)} className="ml-2 hover:bg-white/10 p-1 rounded-full transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="text-center text-[10px] text-slate-600 mt-12 mb-4">AssetFlow v7.5 (Neon Edition)</div>
      </div>
    </main>
  );
}
