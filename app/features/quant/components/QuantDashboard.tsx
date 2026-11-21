'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MonteCarloSkeleton, MetricsGridSkeleton, CorrelationSkeleton } from '@/components/ui/Skeletons';
import {
  BarChart3,
  AlertTriangle,
  Info,
  Sliders,
  Target,
  Award,
  TrendingUp,
  Play,
  DollarSign,
  Compass,
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

const MonteCarloChart = dynamic(() => import('./MonteCarloChart').then(mod => mod.MonteCarloChart), { ssr: false, loading: () => <MonteCarloSkeleton /> });
const RiskMetricsPanel = dynamic(() => import('./RiskMetricsPanel').then(mod => mod.RiskMetricsPanel), { ssr: false, loading: () => <MetricsGridSkeleton /> });
const CorrelationHeatmap = dynamic(() => import('./CorrelationHeatmap').then(mod => mod.CorrelationHeatmap), { ssr: false, loading: () => <CorrelationSkeleton /> });
const TaxSellSimulatorCard = dynamic(() => import('./TaxSellSimulatorCard'), { ssr: false });
const MacroStressTestCard = dynamic(() => import('./MacroStressTestCard'), { ssr: false });

import { Card } from '@/components/ui/Card';
import {
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

import { useToast } from '@/context/ToastContext';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatMoney } from '@/lib/format';
import type { Asset } from '@/types';
import { useQuantData } from '../hooks/useQuantData';
import { useDcaSimulation } from '../hooks/useDcaSimulation';
import { useQuantReports } from '../hooks/useQuantReports';
import { QuantReportsTab } from './QuantReportsTab';

export const QuantDashboard = React.memo(function QuantDashboard({ ativos }: { ativos?: Asset[] }) {
  const { notify } = useToast();
  const { isHidden } = usePrivacy();
  const [activeTab, setActiveTab] = useState<'performance' | 'optimization' | 'simulations' | 'reports'>('performance');

  // Slider State (Aversão ao Risco)
  const [riskAversion, setRiskAversion] = useState(3.0);

  // Accordions State
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showAlpha, setShowAlpha] = useState(false);

  // Dados quantitativos base + otimização
  const {
    frontierData,
    rebalanceData,
    attributionData,
    kellyData,
    momentumData,
    sharpeRollingData,
    exposureData,
    markowitz,
    riskParity,
    currentAlloc,
    selectedOptimalPt,
    loading,
    optLoading,
    error,
  } = useQuantData(riskAversion, ativos, activeTab);

  // Relatórios & Sentimento (Fear & Greed)
  const {
    fearGreedData,
    reportsList,
    loadingReports,
    generatingReport,
    fetchReportsAndFG,
    handleGenerateReport,
  } = useQuantReports(notify);

  // Simulador DCA vs. Aporte Único
  const {
    ticker: dcaTicker,
    setTicker: setDcaTicker,
    initialAmount: dcaInitialAmount,
    setInitialAmount: setDcaInitialAmount,
    monthlyContribution: dcaMonthlyContribution,
    setMonthlyContribution: setDcaMonthlyContribution,
    result: dcaResult,
    loading: dcaLoading,
    error: dcaError,
    runSimulation: runDcaSimulation,
  } = useDcaSimulation(rebalanceData?.data?.[0]?.ticker);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportsAndFG();
    }
  }, [activeTab, fetchReportsAndFG]);

  const tabs = useMemo(() => ([
    { id: 'performance', label: 'Risco & Performance', icon: <Activity size={14} /> },
    { id: 'optimization', label: 'Otimização', icon: <Target size={14} /> },
    { id: 'simulations', label: 'Simuladores', icon: <TrendingUp size={14} /> },
    { id: 'reports', label: 'Relatórios & Sentimento', icon: <Brain size={14} /> }
  ] as const), []);

  // Format Recharts Point Tooltip
  const scatterTooltipFormatter = (value: string | number | undefined, name: string | number | undefined) => {
    if (name === 'Retorno Esperado') return [`${value ?? 0}% a.a.`, String(name)];
    if (name === 'Volatilidade') return [`${value ?? 0}% a.a.`, String(name)];
    return [value ?? '', String(name ?? '')];
  };

  // Accordion: Correlação será abaixo; prepara séries de Sharpe Rolling & Exposição Setorial
  const rollingChartData = useMemo(() => {
    const dates = sharpeRollingData?.dates;
    const port = sharpeRollingData?.series?.portfolio;
    if (!dates || !port || dates.length === 0) return [];
    const len = Math.min(dates.length, port.length);
    const items: { date: string; label: string; sharpe: number }[] = [];
    for (let i = 0; i < len; i++) {
      const d = dates[i];
      const parts = d.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
      items.push({ date: d, label, sharpe: Number(port[i] ?? 0) });
    }
    return items;
  }, [sharpeRollingData]);

  const sectorExposureRows = useMemo(() => {
    if (!exposureData) return { rows: [], total: 0, maxPct: 0 };
    const raw = Object.entries(exposureData).map(([sector, tickers]) => {
      const entries = Object.entries(tickers || {}).sort((a, b) => b[1] - a[1]);
      const sectorTotal = entries.reduce((acc, [, v]) => acc + (Number(v) || 0), 0);
      return { sector, sectorTotal, tickers: entries };
    }).filter((r) => r.sectorTotal > 0);
    const grandTotal = raw.reduce((acc, r) => acc + r.sectorTotal, 0);
    const rows = raw
      .sort((a, b) => b.sectorTotal - a.sectorTotal)
      .map((r) => ({
        ...r,
        pct: grandTotal > 0 ? (r.sectorTotal / grandTotal) * 100 : 0,
      }));
    return { rows, total: grandTotal, maxPct: rows[0]?.pct ?? 0 };
  }, [exposureData]);

  // Otimizando o Render do ScatterChart (Pesado)
  const renderScatterChart = useMemo(() => {
    if (!frontierData) return null;
    return (
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            type="number"
            dataKey="volatilidade"
            name="Volatilidade"
            unit="%"
            domain={['dataMin - 1', 'dataMax + 1']}
            stroke="#64748b"
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="retorno"
            name="Retorno Esperado"
            unit="%"
            domain={['dataMin - 1', 'dataMax + 1']}
            stroke="#64748b"
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#3b82f6' }}
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
            formatter={scatterTooltipFormatter}
          />

          <Scatter
            name="Portfólios Simulados"
            data={frontierData.cloud}
            fill="#475569"
            opacity={0.3}
            shape="circle"
          />

          <Scatter
            name="Fronteira Eficiente"
            data={frontierData.frontier}
            fill="#3b82f6"
            line={{ stroke: '#3b82f6', strokeWidth: 2 }}
            shape="circle"
          />

          <Scatter
            name="Sharpe Máximo"
            data={[frontierData.max_sharpe]}
            fill="#10b981"
            shape="cross"
          />

          <Scatter
            name="Mínima Volatilidade"
            data={[frontierData.min_vol]}
            fill="#f59e0b"
            shape="cross"
          />

          {selectedOptimalPt && (
            <Scatter
              name="Seu Nível de Risco"
              data={[selectedOptimalPt]}
              fill="#ec4899"
              shape="circle"
            />
          )}

          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }, [frontierData, selectedOptimalPt]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse p-6">
        <div className="h-20 bg-surface-card/40 rounded-2xl border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-surface-card/40 rounded-2xl border border-slate-800 col-span-2" />
          <div className="h-64 bg-surface-card/40 rounded-2xl border border-slate-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center !bg-[#0f172a] !border-slate-800 min-h-[400px] m-6">
        <AlertTriangle className="text-amber-500 mb-4" size={48} />
        <h3 className="font-bold text-slate-200 text-lg">Houve um problema de carregamento</h3>
        <p className="text-slate-400 text-sm mt-2 max-w-md">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition"
        >
          Tentar Novamente
        </button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full p-6 text-slate-300">

      {/* 🚀 SUB-CABALHEIRO QUANT */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-surface-card p-4 rounded-2xl border border-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 rounded border border-emerald-500/20 text-emerald-400">
              <BarChart3 size={18} />
            </span>
            <h2 className="text-lg font-bold text-slate-100 uppercase tracking-wider">
              Análise Quantitativa Avançada (Pro)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Modelos matemáticos integrados, dimensionamento de risco por probabilidade e fronteira eficiente.
          </p>

          {/* HERO KPIs */}
          <div className="flex flex-wrap gap-4 mt-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
              <span className={`w-2 h-2 rounded-full ${(rebalanceData?.data?.filter(a => a.status !== 'NORMAL').length || 0) > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                Ações a Tomar: <span className="text-white ml-1">{rebalanceData?.data?.filter(a => a.status !== 'NORMAL').length || 0}</span>
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={12} className="text-slate-500 hover:text-blue-400 transition-colors" />
                  <div className="absolute top-full mt-2 hidden group-hover/tt:block w-48 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal text-left">
                    Ativos que saíram da banda de tolerância e exigem sua atenção no rebalanceamento.
                  </div>
                </div>
              </span>
            </div>
            {attributionData && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <Target size={14} className="text-blue-400" />
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  Beta da Carteira: <span className="text-white ml-1">{attributionData.portfolio_beta.toFixed(2)}</span>
                  <div className="relative group/tt flex items-center cursor-pointer normal-case">
                    <HelpCircle size={12} className="text-slate-500 hover:text-blue-400 transition-colors" />
                    <div className="absolute top-full mt-2 hidden group-hover/tt:block w-48 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal text-left">
                      Mede a sensibilidade da carteira ao mercado. Beta = 1 acompanha o mercado. Beta {'<'} 1 é mais defensivo.
                    </div>
                  </div>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* TAB CONTROLS (SEGMENTED CONTROL PREMIUM) */}
        <div className="w-full xl:w-auto p-1 bg-surface-card/50 rounded-xl border border-slate-800/60 shadow-inner">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${isActive
                    ? 'bg-slate-800 text-blue-400 shadow-md ring-1 ring-slate-700/50'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                    }`}
                >
                  {tab.icon}
                  <span className="text-center">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'optimization' && optLoading ? (
        <MetricsGridSkeleton />
      ) : (!frontierData || !rebalanceData) && activeTab === 'optimization' ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center !bg-[#0f172a] !border-slate-800 min-h-[350px]">
          <Info className="text-indigo-400 mb-4 animate-pulse" size={32} />
          <h3 className="font-bold text-slate-200 text-sm">Dados Quantitativos Insuficientes</h3>
          <p className="text-slate-500 text-xs mt-2 max-w-sm leading-relaxed">
            É necessário ter ao menos 2 ativos de renda variável cadastrados em sua carteira com histórico mínimo de cotações para computar os modelos de Markowitz, Paridade de Risco, Critério de Kelly e correlação.
          </p>
        </Card>
      ) : (
        <>
          {activeTab === 'optimization' && frontierData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 flex flex-col gap-4 bg-surface-card !border-slate-900 p-6 min-h-[480px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Sliders className="text-blue-400" size={18} />
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                      Fronteira Eficiente de Markowitz Interativa
                      <div className="relative group/tt flex items-center cursor-pointer normal-case">
                        <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                        <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                          Mostra as melhores combinações possíveis de ativos (pontos no gráfico) para maximizar o retorno em diferentes níveis de risco.
                        </div>
                      </div>
                    </h3>
                  </div>
                  <div className="text-xs text-slate-500 bg-surface-card border border-slate-800 rounded-lg px-2.5 py-1">
                    Calculado em background com 5.000 simulações
                  </div>
                </div>

                {/* Scatter Plot Chart */}
                <div className="h-[320px] w-full relative">
                  {renderScatterChart}
                </div>

                {/* Slider de Risco */}
                <div className="flex flex-col gap-2 bg-surface-card/60 p-4 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-400">Aversão ao Risco (A)</span>
                    <span className="text-pink-400 px-2 py-0.5 bg-pink-500/10 border border-pink-500/20 rounded">
                      A = {riskAversion.toFixed(1)} {riskAversion < 2 ? '(Agressivo)' : riskAversion > 6 ? '(Conservador)' : '(Moderado)'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={riskAversion}
                    onChange={(e) => setRiskAversion(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-pink-500 focus:outline-none"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0.5 (Foco em Retorno)</span>
                    <span>5.0 (Moderado)</span>
                    <span>10.0 (Foco em Menor Risco)</span>
                  </div>
                </div>
              </Card>

              {/* Allocation Breakdown Card */}
              <Card className="flex flex-col gap-4 bg-surface-card !border-slate-900 p-6">
                <div>
                  <div className="flex items-center gap-2">
                    <Target className="text-emerald-400" size={18} />
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                      Alocação do Portfólio Sugerido
                      <div className="relative group/tt flex items-center cursor-pointer normal-case">
                        <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                        <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                          Pesos de cada ativo que resultam no ponto ótimo escolhido na Fronteira Eficiente. Use isso como meta para o seu rebalanceamento.
                        </div>
                      </div>
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pesos ótimos calculados em tempo real de acordo com seu perfil selecionado.
                  </p>
                </div>

                {selectedOptimalPt ? (
                  <div className="flex flex-col gap-4 mt-2">
                    <div className="grid grid-cols-2 gap-3 bg-surface-card/40 p-3 rounded-xl border border-slate-800 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Retorno Esperado</div>
                        <div className="text-lg font-bold text-emerald-400">{selectedOptimalPt.retorno}% a.a.</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Volatilidade</div>
                        <div className="text-lg font-bold text-amber-500">{selectedOptimalPt.volatilidade}% a.a.</div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-2">
                      <span className="text-slate-400">Sharpe Ratio</span>
                      <span className="font-bold text-slate-200">{selectedOptimalPt.sharpe}</span>
                    </div>

                    {/* Pesos sugeridos */}
                    <div className="flex flex-col gap-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Distribuição de Pesos</div>
                      <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                        {Object.entries(selectedOptimalPt.weights)
                          .filter(([, w]) => w > 0.1)
                          .sort(([, wa], [, wb]) => wb - wa)
                          .map(([ticker, weight]) => (
                            <div key={ticker} className="flex flex-col gap-1">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-slate-300">{ticker}</span>
                                <span className="text-blue-400 font-bold">{weight.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${weight}%` }} />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-full">
                    <Sliders size={24} className="mb-2" />
                    <span className="text-xs">Mova o slider para gerar a sugestão.</span>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* 📊 TAB 2: BANDA DE REBALANCEAMENTO DE TOLERÂNCIA */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'optimization' && rebalanceData && (
            <div className="w-full mt-6 animate-in fade-in">

              {/* Rebalance Bands Table */}
              <Card className="flex flex-col gap-4 bg-surface-card !border-slate-900 p-6 h-full">
                <div>
                  <div className="flex items-center gap-2">
                    <Target className="text-teal-400" size={18} />
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                      Desvios de Peso e Banda de Tolerância (±2%)
                      <div className="relative group/tt flex items-center cursor-pointer normal-case">
                        <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                        <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                          As bandas de tolerância indicam quando um ativo subiu ou caiu tanto que sua carteira ficou desbalanceada em relação à sua alocação ideal estipulada.
                        </div>
                      </div>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Identifique ativos que saíram da faixa de tolerância em relação à meta declarada.
                  </p>
                </div>

                {rebalanceData.data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-500 bg-surface-card/20 rounded-xl border border-dashed border-slate-800">
                    <Target size={32} className="mb-3 text-slate-700" />
                    <p className="text-sm font-semibold text-slate-400">Nenhum desvio significativo.</p>
                    <p className="text-xs text-slate-500 mt-1 text-center max-w-sm">
                      Sua carteira está dentro das bandas de tolerância de ±2% em relação à alocação alvo ideal.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          <th className="pb-3 pl-2">Ativo</th>
                          <th className="pb-3 text-right">Peso Atual</th>
                          <th className="pb-3 text-right">Meta</th>
                          <th className="pb-3 text-right">Desvio</th>
                          <th className="pb-3 text-center">Status</th>
                          <th className="pb-3 text-right pr-2">Recomendação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 text-xs">
                        {rebalanceData.data.map((item) => {
                          const isNormal = item.status === 'NORMAL';
                          const isExcedente = item.status === 'EXCEDENTE';

                          return (
                            <tr key={item.ticker} className="hover:bg-surface-card/20 transition">
                              <td className="py-3 pl-2 font-bold text-slate-300">{item.ticker}</td>
                              <td className="py-3 text-right">{item.weight_pct}%</td>
                              <td className="py-3 text-right">{item.target_pct}%</td>
                              <td className={`py-3 text-right font-semibold ${isNormal ? 'text-slate-400' : isExcedente ? 'text-red-400' : 'text-emerald-400'
                                }`}>
                                {item.deviation_pct > 0 ? `+${item.deviation_pct}` : item.deviation_pct}%
                              </td>
                              <td className="py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isNormal
                                  ? 'bg-surface-card border border-slate-800 text-slate-500'
                                  : isExcedente
                                    ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                                  }`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className={`py-3 text-right pr-2 font-medium ${isNormal ? 'text-slate-500' : isExcedente ? 'text-red-400/80' : 'text-emerald-400/80'
                                }`}>
                                {item.action_note}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Otimização de Portfólio (Movido de RiskMetricsPanel) */}
              {Object.keys(markowitz).length > 0 && (
                <Card className="flex flex-col gap-4 bg-surface-card !border-slate-900 p-6 mt-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Compass className="text-indigo-400" size={18} />
                      <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                        Sugestão de Rebalanceamento Quantitativo
                        <div className="relative group/tt flex items-center cursor-pointer normal-case">
                          <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                            <strong>Markowitz:</strong> Busca o maior retorno possível pelo risco aceito (Fronteira Eficiente).<br /><strong>Paridade de Risco:</strong> Divide o risco igualmente entre os ativos, ideal para estratégias defensivas.
                          </div>
                        </div>
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Distribuição de pesos ideal segundo os modelos de Markowitz (Sharpe Máximo) e Paridade de Risco.
                      Dica: Utilize essas sugestões para ajustar metas da carteira.
                    </p>
                  </div>

                  <div className="overflow-x-auto w-full mt-2">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          <th className="pb-3 pl-2">Ativo</th>
                          <th className="pb-3 text-right">Alocação Atual</th>
                          <th className="pb-3 text-right text-blue-400">Sharpe Máximo (Markowitz)</th>
                          <th className="pb-3 text-right text-indigo-400 pr-2">Paridade de Risco</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 text-xs">
                        {Object.keys({ ...markowitz, ...riskParity }).map((ticker) => {
                          const cleanTicker = ticker.toUpperCase();
                          const current = currentAlloc[cleanTicker] || 0;
                          const markoVal = markowitz[ticker] || 0;
                          const parityVal = riskParity[ticker] || 0;
                          return (
                            <tr key={ticker} className="hover:bg-surface-card/20 transition">
                              <td className="py-3 pl-2 font-bold text-slate-300">{cleanTicker}</td>
                              <td className="py-3 text-right">{current.toFixed(1)}%</td>
                              <td className="py-3 text-right font-bold text-blue-400">{markoVal.toFixed(1)}%</td>
                              <td className="py-3 text-right font-bold text-indigo-400 pr-2">{parityVal.toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'optimization' && <TaxSellSimulatorCard ativos={ativos} />}


          {/* ──────────────────────────────────────────────────────── */}
          {/* 📊 TAB 5: SIMULADOR DCA VS LUMP SUM */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'simulations' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

              {/* Controls Column */}
              <Card className="flex flex-col bg-surface-card !border-slate-900 p-6 h-full">
                <div className="flex items-center gap-2 mb-6">
                  <Sliders className="text-blue-400" size={18} />
                  <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Parâmetros</h3>
                </div>

                <div className="flex flex-col gap-5 flex-1">
                  {/* Ticker */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ativo para Simular</label>
                    <input
                      type="text"
                      placeholder="Ex: PETR4"
                      value={dcaTicker}
                      onChange={(e) => setDcaTicker(e.target.value.toUpperCase())}
                      className="w-full bg-surface-card border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 uppercase font-semibold"
                    />
                  </div>

                  {/* Aporte Inicial */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aporte Inicial (Lump Sum)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">R$</span>
                      <input
                        type="number"
                        value={dcaInitialAmount}
                        onChange={(e) => setDcaInitialAmount(parseInt(e.target.value) || 0)}
                        className="w-full bg-surface-card border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>
                  </div>

                  {/* Aporte Mensal */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aporte Mensal (DCA)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">R$</span>
                      <input
                        type="number"
                        value={dcaMonthlyContribution}
                        onChange={(e) => setDcaMonthlyContribution(parseInt(e.target.value) || 0)}
                        className="w-full bg-surface-card border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  {dcaError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[11px] font-semibold">
                      ⚠️ {dcaError}
                    </div>
                  )}

                  {/* Run Button */}
                  <button
                    onClick={runDcaSimulation}
                    disabled={dcaLoading}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 mt-auto"
                  >
                    <Play size={12} fill="currentColor" />
                    {dcaLoading ? 'Simulando...' : 'Rodar Simulação'}
                  </button>
                </div>
              </Card>

              {/* Graph & Stats Column */}
              <Card className="lg:col-span-3 flex flex-col gap-4 bg-surface-card !border-slate-900 p-6 min-h-[420px]">
                <div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="text-emerald-400" size={18} />
                    <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                      DCA vs Lump Sum Simulator (Histórico 1 Ano)
                      <div className="relative group/tt flex items-center cursor-pointer normal-case">
                        <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                        <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                          Compara matematicamente a estratégia de comprar tudo de uma vez (Lump Sum) versus fazer compras menores, recorrentes e mensais (DCA - Dollar Cost Averaging).
                        </div>
                      </div>
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Visualização comparativa de investimento regular (DCA) contra aporte único (Lump Sum) no último ano.
                  </p>
                </div>

                {dcaResult ? (
                  <div className="flex flex-col gap-6">

                    {/* Comparativo Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                      {/* Card Lump Sum */}
                      <div className="p-4 bg-surface-card/40 rounded-2xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Estratégia Lump Sum</div>
                          <div className="text-xl font-black text-slate-200 mt-1">
                            R$ {dcaResult.lump_sum.final_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Total Investido: R$ {dcaResult.lump_sum.invested.toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${dcaResult.lump_sum.return_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                            {dcaResult.lump_sum.return_pct >= 0 ? `+${dcaResult.lump_sum.return_pct}` : dcaResult.lump_sum.return_pct}%
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                            Lucro: R$ {dcaResult.lump_sum.profit.toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>

                      {/* Card DCA */}
                      <div className="p-4 bg-surface-card/40 rounded-2xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Estratégia DCA Recorrente</div>
                          <div className="text-xl font-black text-blue-400 mt-1">
                            R$ {dcaResult.dca.final_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Total Investido: R$ {dcaResult.dca.invested.toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${dcaResult.dca.return_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                            {dcaResult.dca.return_pct >= 0 ? `+${dcaResult.dca.return_pct}` : dcaResult.dca.return_pct}%
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                            Lucro: R$ {dcaResult.dca.profit.toLocaleString('pt-BR')}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Line Chart */}
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={dcaResult.history} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 9 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                            labelClassName="text-slate-400 font-bold"
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Line
                            type="monotone"
                            dataKey="lump_sum_val"
                            name="Valor Lump Sum"
                            stroke="#94a3b8"
                            strokeWidth={1.5}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="dca_val"
                            name="Valor DCA"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="dca_invested"
                            name="Investido DCA (Aportes)"
                            stroke="#475569"
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-slate-500 h-full border border-slate-900 border-dashed rounded-xl">
                    <TrendingUp size={36} className="mb-2" />
                    <span className="text-xs">Selecione os parâmetros e rode a simulação.</span>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* 📁 TAB 6: RELATÓRIOS & SENTIMENTO (FEAR & GREED LOCAL + PDF) */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'reports' && (
            <QuantReportsTab
              fearGreedData={fearGreedData}
              reportsList={reportsList}
              loadingReports={loadingReports}
              generatingReport={generatingReport}
              onGenerateReport={handleGenerateReport}
            />
          )}

          {activeTab === 'simulations' && (
            <div className="animate-in fade-in w-full flex flex-col gap-6">
              <MonteCarloChart />
              <MacroStressTestCard ativos={ativos} />
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="animate-in fade-in w-full flex flex-col gap-6">
              <RiskMetricsPanel />

              {/* Momentum Ranking & Kelly Sizing */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Momentum Ranking */}
                <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
                        <TrendingUp size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Top Momentum Ranking</h3>
                        <p className="text-[11px] text-text-secondary">Força relativa em 12M (ex-último mês)</p>
                      </div>
                    </div>
                    {momentumData.length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary">
                        Top {Math.min(8, momentumData.length)} / {momentumData.length}
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div className="py-6 text-center text-xs text-text-secondary">Calculando ranking de momentum...</div>
                  ) : momentumData.length === 0 ? (
                    <div className="py-6 text-center text-xs text-text-secondary">Dados insuficientes de cotações em renda variável.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-subtle text-text-secondary text-[11px]">
                            <th className="text-left py-1.5 font-medium w-10">#</th>
                            <th className="text-left py-1.5 font-medium">Ativo</th>
                            <th className="text-right py-1.5 font-medium">Score Momentum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/50">
                          {momentumData.slice(0, 8).map((item) => {
                            const pos = item.momentum_score_pct >= 0;
                            return (
                              <tr key={item.ticker} className="hover:bg-surface/60 transition-colors">
                                <td className="py-2 font-mono text-text-secondary">#{item.rank}</td>
                                <td className="py-2 font-bold text-text-primary">{item.ticker}</td>
                                <td className="py-2 text-right font-mono font-semibold">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded ${pos ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                      }`}
                                  >
                                    {pos ? '+' : ''}{item.momentum_score_pct.toFixed(2)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Critério de Kelly */}
                <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-amber-400">
                        <Target size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Critério de Kelly — Dimensionamento</h3>
                        <p className="text-[11px] text-text-secondary">Peso máximo sugerido (Kelly 1/4 e 1/2, teto 12%)</p>
                      </div>
                    </div>
                    {kellyData.length > 0 && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary">
                        Top {Math.min(8, kellyData.length)} / {kellyData.length}
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div className="py-6 text-center text-xs text-text-secondary">Calculando fracionamento de Kelly...</div>
                  ) : kellyData.length === 0 ? (
                    <div className="py-6 text-center text-xs text-text-secondary">Dados insuficientes para cálculo do Critério de Kelly.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border-subtle text-text-secondary text-[11px]">
                            <th className="text-left py-1.5 font-medium">Ativo</th>
                            <th className="text-right py-1.5 font-medium">Win Rate</th>
                            <th className="text-right py-1.5 font-medium">Payoff</th>
                            <th className="text-right py-1.5 font-medium">1/4 Kelly</th>
                            <th className="text-right py-1.5 font-medium">1/2 Kelly</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle/50">
                          {kellyData.slice(0, 8).map((item) => (
                            <tr key={item.ticker} className="hover:bg-surface/60 transition-colors">
                              <td className="py-2 font-bold text-text-primary">{item.ticker}</td>
                              <td className="py-2 text-right font-mono text-text-secondary">{item.win_rate.toFixed(1)}%</td>
                              <td className="py-2 text-right font-mono text-text-secondary">{item.win_loss_ratio.toFixed(2)}x</td>
                              <td className="py-2 text-right font-mono font-semibold text-amber-400">{item.kelly_quarter_limit.toFixed(2)}%</td>
                              <td className="py-2 text-right font-mono text-text-primary">{item.kelly_half_limit.toFixed(2)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Sharpe Rolling (Janela 60d) & Exposição Setorial */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Sharpe Rolling */}
                <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20 text-sky-400">
                        <Activity size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Sharpe Rolling (Janela 60d)</h3>
                        <p className="text-[11px] text-text-secondary">Evolução da relação retorno/risco ajustada à Selic</p>
                      </div>
                    </div>
                    {rollingChartData.length > 0 && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle font-semibold ${rollingChartData[rollingChartData.length - 1].sharpe >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                        Atual: {rollingChartData[rollingChartData.length - 1].sharpe.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div className="py-10 text-center text-xs text-text-secondary">Calculando série de Sharpe móvel...</div>
                  ) : rollingChartData.length === 0 ? (
                    <div className="py-10 text-center text-xs text-text-secondary">Histórico insuficiente para Sharpe Rolling (mín. 60 pregões).</div>
                  ) : (
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <LineChart data={rollingChartData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} minTickGap={24} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '11px' }}
                            formatter={(value) => [Number(value).toFixed(3), 'Sharpe 60d']}
                            labelFormatter={(_, payload) => (payload?.[0]?.payload?.date ? `Pregão: ${payload[0].payload.date}` : '')}
                          />
                          <Line
                            type="monotone"
                            dataKey="sharpe"
                            name="Carteira"
                            stroke="#38bdf8"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Exposição Setorial & Concentração */}
                <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
                        <Compass size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Exposição Setorial & Concentração</h3>
                        <p className="text-[11px] text-text-secondary">Distribuição patrimonial por setor econômico</p>
                      </div>
                    </div>
                    {sectorExposureRows.rows.length > 0 && (
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${sectorExposureRows.maxPct > 30
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        }`}>
                        {sectorExposureRows.maxPct > 30 ? 'Concentração (>30%)' : 'Diversificada'}
                      </span>
                    )}
                  </div>

                  {loading ? (
                    <div className="py-10 text-center text-xs text-text-secondary">Analisando exposição setorial...</div>
                  ) : sectorExposureRows.rows.length === 0 ? (
                    <div className="py-10 text-center text-xs text-text-secondary">Sem posições ativas para calcular exposição setorial.</div>
                  ) : (
                    <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {sectorExposureRows.rows.map((sec) => {
                        const over = sec.pct > 30;
                        const topTickers = sec.tickers.slice(0, 4).map(([t]) => t).join(', ');
                        const moreCount = sec.tickers.length > 4 ? ` +${sec.tickers.length - 4}` : '';
                        return (
                          <div key={sec.sector} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-semibold text-text-primary truncate">{sec.sector}</span>
                              <div className="flex items-center gap-2 shrink-0 font-mono">
                                <span className="text-text-secondary">
                                  {isHidden ? 'R$ •••••' : formatMoney(sec.sectorTotal)}
                                </span>
                                <span className={`font-bold ${over ? 'text-amber-400' : 'text-sky-400'}`}>
                                  {sec.pct.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                              <div
                                className={`h-full rounded-full ${over ? 'bg-amber-400' : 'bg-indigo-400'}`}
                                style={{ width: `${Math.min(100, Math.max(2, sec.pct))}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-text-secondary truncate">
                              {topTickers}{moreCount}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Accordion: Correlação */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowCorrelation(!showCorrelation)}
                  className="flex items-center justify-between p-4 bg-surface-card hover:bg-slate-800/80 rounded-xl border border-slate-800/60 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
                      <Activity size={18} />
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-slate-200 text-sm tracking-wider flex items-center gap-2">
                        Diversificação de Risco (Correlação)
                        <div className="relative group/tt flex items-center cursor-pointer">
                          <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                          <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50">
                            Ativos com correlação negativa (vermelho) tendem a se mover em direções opostas. Correlação positiva (azul) indica que caem ou sobem juntos.
                          </div>
                        </div>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Descubra se seus ativos tendem a cair todos juntos em uma crise.
                      </p>
                    </div>
                  </div>
                  {showCorrelation ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                </button>
                {showCorrelation && (
                  <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                    <CorrelationHeatmap />
                  </div>
                )}
              </div>

              {/* Accordion: Alpha Attribution Card */}
              {attributionData && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowAlpha(!showAlpha)}
                    className="flex items-center justify-between p-4 bg-surface-card hover:bg-slate-800/80 rounded-xl border border-slate-800/60 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                        <Award size={18} />
                      </div>
                      <div className="text-left">
                        <h3 className="font-bold text-slate-200 text-sm tracking-wider flex items-center gap-2">
                          Desempenho vs Mercado (Alpha)
                          <div className="relative group/tt flex items-center cursor-pointer">
                            <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50">
                              Mede o rendimento de um ativo além do esperado pelo mercado (Alpha) e sua sensibilidade às variações do IBOV (Beta).
                            </div>
                          </div>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Saiba quais ativos realmente geram valor independente de a bolsa estar subindo ou caindo.
                        </p>
                      </div>
                    </div>
                    {showAlpha ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                  </button>

                  {showAlpha && (
                    <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                      <Card className="flex flex-col gap-4 bg-surface-card/50 !border-slate-800/80 p-6 h-full mt-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-slate-300 text-xs uppercase tracking-wider">
                                Resumo do Portfólio (CAPM)
                              </h3>
                            </div>
                          </div>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-center">
                            <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Alpha da Carteira</div>
                            <div className="text-base font-bold text-emerald-300">{attributionData.portfolio_alpha_pct}% a.a.</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 bg-slate-900/40 p-3 rounded-xl border border-slate-800/60 text-center mb-2">
                          <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Retorno EWMA</div>
                            <div className="text-sm font-bold text-slate-300">{attributionData.portfolio_return_pct}% a.a.</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              Beta EWMA
                            </div>
                            <div className="text-sm font-bold text-slate-300">{attributionData.portfolio_beta}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Benchmark (IBOV)</div>
                            <div className="text-sm font-bold text-slate-300">EWMA indexado</div>
                          </div>
                        </div>

                        <div className="overflow-x-auto w-full">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                <th className="pb-3 pl-2">Ativo</th>
                                <th className="pb-3 text-right">Peso</th>
                                <th className="pb-3 text-right">
                                  Beta
                                  <div className="inline-block ml-1 relative group/th cursor-pointer">
                                    <HelpCircle size={10} className="inline text-slate-500 hover:text-blue-400" />
                                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover/th:block w-48 p-2 bg-slate-900 text-slate-300 text-[9px] rounded shadow-xl border border-slate-700 z-50 text-left font-normal normal-case">
                                      Beta &gt; 1: Mais volátil que o mercado.<br />Beta &lt; 1: Menos volátil.
                                    </div>
                                  </div>
                                </th>
                                <th className="pb-3 text-right">
                                  Alpha Ativo
                                  <div className="inline-block ml-1 relative group/th cursor-pointer">
                                    <HelpCircle size={10} className="inline text-slate-500 hover:text-blue-400" />
                                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover/th:block w-48 p-2 bg-slate-900 text-slate-300 text-[9px] rounded shadow-xl border border-slate-700 z-50 text-left font-normal normal-case">
                                      Retorno % adicional gerado pelo ativo que não é explicado pelas subidas do mercado.
                                    </div>
                                  </div>
                                </th>
                                <th className="pb-3 text-right">Contrib. Alpha</th>
                                <th className="pb-3 text-right pr-2">Aproveitamento</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-xs">
                              {attributionData.data.map((item) => {
                                const isPositive = item.weighted_alpha_pct >= 0;

                                return (
                                  <tr key={item.ticker} className="hover:bg-slate-800/30 transition">
                                    <td className="py-3 pl-2 font-bold text-slate-300">{item.ticker}</td>
                                    <td className="py-3 text-right">{item.weight_pct}%</td>
                                    <td className="py-3 text-right">{item.beta}</td>
                                    <td className={`py-3 text-right ${item.asset_alpha_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {item.asset_alpha_pct > 0 ? `+${item.asset_alpha_pct}` : item.asset_alpha_pct}%
                                    </td>
                                    <td className={`py-3 text-right font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {item.weighted_alpha_pct > 0 ? `+${item.weighted_alpha_pct}` : item.weighted_alpha_pct}%
                                    </td>
                                    <td className="py-3 text-right pr-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}>
                                        {item.pct_contribution}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
});
