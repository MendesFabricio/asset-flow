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
  FileText,
  Download,
  Activity,
  Brain,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

const MonteCarloChart = dynamic(() => import('./MonteCarloChart').then(mod => mod.MonteCarloChart), { ssr: false, loading: () => <MonteCarloSkeleton /> });
const RiskMetricsPanel = dynamic(() => import('./RiskMetricsPanel').then(mod => mod.RiskMetricsPanel), { ssr: false, loading: () => <MetricsGridSkeleton /> });
const CorrelationHeatmap = dynamic(() => import('./CorrelationHeatmap').then(mod => mod.CorrelationHeatmap), { ssr: false, loading: () => <CorrelationSkeleton /> });

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
import { KellyData } from '@/types';

import { useToast } from '@/context/ToastContext';
import { useQuantData } from '../hooks/useQuantData';
import { useDcaSimulation } from '../hooks/useDcaSimulation';
import { useQuantReports } from '../hooks/useQuantReports';

export function QuantDashboard() {
  const { notify } = useToast();
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
    markowitz,
    riskParity,
    currentAlloc,
    selectedOptimalPt,
    loading,
    error,
  } = useQuantData(riskAversion);

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

  // Format Recharts Point Tooltip
  const scatterTooltipFormatter = (value: any, name: any) => {
    if (name === 'Retorno Esperado') return [`${value}% a.a.`, name];
    if (name === 'Volatilidade') return [`${value}% a.a.`, name];
    return [value, name];
  };

  // Otimizando o Render do ScatterChart (Pesado)
  const renderScatterChart = useMemo(() => {
    if (!frontierData) return null;
    return (
      <ResponsiveContainer width="100%" height="100%">
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
            {[
              { id: 'performance', label: 'Risco & Performance', icon: <Activity size={14} /> },
              { id: 'optimization', label: 'Otimização', icon: <Target size={14} /> },
              { id: 'simulations', label: 'Simuladores', icon: <TrendingUp size={14} /> },
              { id: 'reports', label: 'Relatórios & Sentimento', icon: <Brain size={14} /> }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                    isActive
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
      {(!frontierData || !rebalanceData) && (activeTab === 'optimization' || activeTab === 'performance') ? (
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
                      .filter(([_, w]) => w > 0.1)
                      .sort(([_, wa], [__, wb]) => wb - wa)
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
                          <td className={`py-3 text-right font-semibold ${
                            isNormal ? 'text-slate-400' : isExcedente ? 'text-red-400' : 'text-emerald-400'
                          }`}>
                            {item.deviation_pct > 0 ? `+${item.deviation_pct}` : item.deviation_pct}%
                          </td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              isNormal 
                                ? 'bg-surface-card border border-slate-800 text-slate-500'
                                : isExcedente
                                  ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className={`py-3 text-right pr-2 font-medium ${
                            isNormal ? 'text-slate-500' : isExcedente ? 'text-red-400/80' : 'text-emerald-400/80'
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
                        <strong>Markowitz:</strong> Busca o maior retorno possível pelo risco aceito (Fronteira Eficiente).<br/><strong>Paridade de Risco:</strong> Divide o risco igualmente entre os ativos, ideal para estratégias defensivas.
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
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        dcaResult.lump_sum.return_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
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
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        dcaResult.dca.return_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
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
                  <ResponsiveContainer width="100%" height="100%">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* FEAR & GREED CARD */}
          <Card className="flex flex-col gap-6 bg-surface-card !border-slate-900 p-6">
            <div className="flex items-center gap-2 border-b border-slate-900 pb-3">
              <Compass className="text-emerald-400" size={18} />
              <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                Fear & Greed Index Local
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal">
                    O índice de Medo e Ganância (Fear & Greed) analisa os ativos da sua carteira para descobrir se o seu micromercado está eufórico (bom momento para proteger lucros) ou em pânico (potenciais pechinchas).
                  </div>
                </div>
              </h3>
            </div>
            
            {loadingReports ? (
              <div className="flex justify-center items-center h-48 animate-pulse text-slate-500 text-xs">
                Carregando sentimento...
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                {/* SVG Gauge */}
                <div className="relative w-36 h-20">
                  <svg className="w-full h-full" viewBox="0 0 120 70">
                    {/* Background Arc */}
                    <path
                      d="M 10 60 A 50 50 0 0 1 110 60"
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="8"
                      strokeLinecap="round"
                    />
                    {/* Active Gauge Arc */}
                    <path
                      d="M 10 60 A 50 50 0 0 1 110 60"
                      fill="none"
                      stroke={
                        (fearGreedData?.score || 50) < 25
                          ? '#ef4444' // Red
                          : (fearGreedData?.score || 50) < 45
                          ? '#f97316' // Orange
                          : (fearGreedData?.score || 50) <= 55
                          ? '#eab308' // Yellow
                          : (fearGreedData?.score || 50) <= 75
                          ? '#84cc16' // Lime
                          : '#22c55e' // Green
                      }
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="157.08"
                      strokeDashoffset={157.08 - (157.08 * (fearGreedData?.score || 50)) / 100}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  {/* Score Text Overlay */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end h-full">
                    <span className="text-2xl font-black text-slate-100 tracking-tight leading-none">
                      {fearGreedData?.score || 50}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 rounded ${
                      (fearGreedData?.score || 50) < 25
                        ? 'bg-red-500/10 text-red-400'
                        : (fearGreedData?.score || 50) < 45
                        ? 'bg-orange-500/10 text-orange-400'
                        : (fearGreedData?.score || 50) <= 55
                        ? 'bg-yellow-500/10 text-yellow-400'
                        : (fearGreedData?.score || 50) <= 75
                        ? 'bg-lime-500/10 text-lime-400'
                        : 'bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {fearGreedData?.label || 'Neutro'}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 max-w-[200px] leading-relaxed mt-2">
                  Índice proprietário derivado do RSI médio, do percentual acima da média 20d e da volatilidade dos seus próprios ativos.
                </p>

                {/* Sub-metrics */}
                <div className="w-full flex flex-col gap-2 mt-4 text-xs text-left border-t border-slate-900 pt-4">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">RSI Médio Ponderado:</span>
                    <span className="font-bold text-slate-300">{fearGreedData?.avg_rsi || 50}/100</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">Acima da Média 20d:</span>
                    <span className="font-bold text-slate-300">{fearGreedData?.above_sma_pct || 0}% dos ativos</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">Força de Drawdown/Retorno:</span>
                    <span className="font-bold text-slate-300">{fearGreedData?.drawdown_score || 50}/100</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* REPORTS MANAGER CARD */}
          <Card className="lg:col-span-2 flex flex-col gap-4 bg-surface-card !border-slate-900 p-6 min-h-[400px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider flex items-center gap-2">
                  Central de Relatórios Patrimoniais (PDF)
                  <div className="relative group/tt flex items-center cursor-pointer normal-case">
                    <HelpCircle size={14} className="text-slate-500 hover:text-blue-400 transition-colors" />
                    <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-slate-900 text-slate-300 text-[10px] rounded shadow-xl border border-slate-700 z-50 font-normal text-left">
                      Gera uma fotografia imutável em PDF da sua alocação, lucros e posições no instante atual. Ideal para prestação de contas, imposto de renda ou arquivo pessoal trimestral.
                    </div>
                  </div>
                </h3>
              </div>
              <button
                disabled={generatingReport || loadingReports}
                onClick={handleGenerateReport}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-40 flex items-center gap-2"
              >
                {generatingReport ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando...
                  </>
                ) : (
                  'Gerar Relatório Atual'
                )}
              </button>
            </div>

            {loadingReports ? (
              <div className="flex justify-center items-center h-48 animate-pulse text-slate-500 text-xs">
                Carregando relatórios salvos...
              </div>
            ) : reportsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-500 h-full border border-slate-900 border-dashed rounded-xl">
                <FileText size={36} className="mb-2 text-slate-700" />
                <span className="text-xs">Nenhum relatório gerado ainda.</span>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <th className="pb-3 pl-2">Relatório</th>
                      <th className="pb-3">Data de Criação</th>
                      <th className="pb-3 text-right">Tamanho</th>
                      <th className="pb-3 text-right pr-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-xs">
                    {reportsList.map((rep) => {
                      const cleanDate = rep.created_at
                        ? new Date(rep.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'N/A';
                      
                      const sizeKb = rep.size_bytes ? (rep.size_bytes / 1024).toFixed(1) : '0.0';
                      const repLabel = rep.filename
                        ? rep.filename
                            .replace("relatorio_patrimonial_", "Relatório ")
                            .replace(".pdf", "")
                        : "Relatório Patrimonial";
                      
                      return (
                        <tr key={rep.filename} className="hover:bg-surface-card/20 transition">
                          <td className="py-3 pl-2 font-bold text-slate-300 flex items-center gap-2">
                            <FileText size={14} className="text-slate-500" />
                            {repLabel}
                          </td>
                          <td className="py-3 text-slate-400">{cleanDate}</td>
                          <td className="py-3 text-right text-slate-400">{sizeKb} KB</td>
                          <td className="py-3 text-right pr-2">
                            <button
                              onClick={() =>
                                window.open(
                                  `/api/quant/download-report?filename=${encodeURIComponent(
                                    rep.filename
                                  )}`,
                                  '_blank'
                                )
                              }
                              className="px-2 py-1 bg-surface-card hover:bg-slate-800 border border-slate-800 text-slate-300 rounded text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1.5 ml-auto"
                            >
                              <Download size={10} />
                              Baixar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'simulations' && (
        <div className="animate-in fade-in w-full">
          <MonteCarloChart />
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="animate-in fade-in w-full flex flex-col gap-6">
          <RiskMetricsPanel />
          
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
                                  Beta &gt; 1: Mais volátil que o mercado.<br/>Beta &lt; 1: Menos volátil.
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
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
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
}
