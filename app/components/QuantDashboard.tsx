'use client';

import { useEffect, useState } from 'react';
import { apiCall } from '../utils/apiClient';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
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
  ResponsiveContainer,
  ReferenceDot,
  TooltipProps
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Target,
  Percent,
  DollarSign,
  Activity,
  Award,
  AlertTriangle,
  Info,
  Sliders,
  Play,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import {
  KellyData,
  AlphaAttributionData,
  RebalanceBandsData,
  DCASimulationData,
  EfficientFrontierData,
  SharpeRollingData,
  MomentumRankingData,
  FrontierPoint
} from '../types';

export function QuantDashboard() {
  const [activeTab, setActiveTab] = useState<'frontier' | 'rebalance' | 'ranking' | 'sharpe' | 'dca'>('frontier');
  
  // Data States
  const [frontierData, setFrontierData] = useState<EfficientFrontierData | null>(null);
  const [rebalanceData, setRebalanceData] = useState<RebalanceBandsData | null>(null);
  const [attributionData, setAttributionData] = useState<AlphaAttributionData | null>(null);
  const [kellyData, setKellyData] = useState<KellyData | null>(null);
  const [momentumData, setMomentumData] = useState<MomentumRankingData | null>(null);
  const [sharpeData, setSharpeData] = useState<SharpeRollingData | null>(null);
  
  // DCA Simulator States
  const [dcaTicker, setDcaTicker] = useState('PETR4');
  const [dcaInitialAmount, setDcaInitialAmount] = useState(10000);
  const [dcaMonthlyContribution, setDcaMonthlyContribution] = useState(1000);
  const [dcaResult, setDcaResult] = useState<DCASimulationData | null>(null);
  const [dcaLoading, setDcaLoading] = useState(false);
  const [dcaError, setDcaError] = useState<string | null>(null);

  // General Loading/Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Slider State (Aversão ao Risco)
  const [riskAversion, setRiskAversion] = useState(3.0);
  const [selectedOptimalPt, setSelectedOptimalPt] = useState<FrontierPoint | null>(null);

  // Sharpe Chart Filter States
  const [sharpeFilter, setSharpeFilter] = useState<string[]>(['portfolio']);

  // Fetch all data
  useEffect(() => {
    setLoading(true);
    setError(null);
    
    Promise.all([
      apiCall<EfficientFrontierData>('/api/quant/efficient-frontier'),
      apiCall<RebalanceBandsData>('/api/quant/rebalance-bands'),
      apiCall<AlphaAttributionData>('/api/quant/attribution-analysis'),
      apiCall<KellyData>('/api/quant/kelly-criterion'),
      apiCall<MomentumRankingData>('/api/quant/momentum-ranking'),
      apiCall<SharpeRollingData>('/api/quant/sharpe-rolling')
    ])
      .then(([frontier, rebalance, attribution, kelly, momentum, sharpe]) => {
        if (frontier.status === 'Sucesso') setFrontierData(frontier);
        if (rebalance.status === 'Sucesso') setRebalanceData(rebalance);
        if (attribution.status === 'Sucesso') setAttributionData(attribution);
        if (kelly.status === 'Sucesso') setKellyData(kelly);
        if (momentum.status === 'Sucesso') setMomentumData(momentum);
        
        if (sharpe.status === 'Sucesso') {
          setSharpeData(sharpe);
          // Adiciona portfolio e os 3 primeiros tickers à exibição inicial
          const keys = Object.keys(sharpe.series);
          setSharpeFilter(keys.slice(0, 4));
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Erro ao carregar os dados quantitativos. Verifique a conexão com o servidor.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Recalcular portfólio ótimo baseado na aversão ao risco do slider
  useEffect(() => {
    if (!frontierData || frontierData.frontier.length === 0) return;
    
    // A utilidade de um portfólio é U = Retorno - 0.5 * A * Volatilidade^2
    // A aversão ao risco é dividida por 100 para ajustar a escala percentual dos retornos/volatilidade
    let bestPt: FrontierPoint | null = null;
    let maxUtility = -Infinity;

    frontierData.frontier.forEach((pt) => {
      const r = pt.retorno / 100.0;
      const v = pt.volatilidade / 100.0;
      const utility = r - 0.5 * riskAversion * (v ** 2);
      
      if (utility > maxUtility) {
        maxUtility = utility;
        bestPt = pt;
      }
    });

    if (bestPt) {
      setSelectedOptimalPt(bestPt);
    }
  }, [riskAversion, frontierData]);

  // Run DCA Simulation
  const runDcaSimulation = () => {
    if (!dcaTicker.trim()) return;
    setDcaLoading(true);
    setDcaError(null);
    
    apiCall<DCASimulationData>(`/api/quant/dca-lump-sum?ticker=${encodeURIComponent(dcaTicker)}&initial_amount=${dcaInitialAmount}&monthly_contribution=${dcaMonthlyContribution}`)
      .then((res) => {
        if (res.status === 'Sucesso') {
          setDcaResult(res);
        } else {
          setDcaError(res.status || 'Falha ao processar simulação.');
        }
      })
      .catch((err) => {
        console.error(err);
        setDcaError('Erro ao comunicar com a API do simulador.');
      })
      .finally(() => {
        setDcaLoading(false);
      });
  };

  // Trigger initial DCA simulation if tickers are loaded
  useEffect(() => {
    if (rebalanceData && rebalanceData.data.length > 0) {
      const firstTicker = rebalanceData.data[0].ticker;
      setDcaTicker(firstTicker);
    }
  }, [rebalanceData]);

  // Run initial simulation once we resolve the default ticker
  useEffect(() => {
    if (dcaTicker) {
      runDcaSimulation();
    }
  }, [dcaTicker]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse p-6">
        <div className="h-20 bg-slate-900/40 rounded-2xl border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-900/40 rounded-2xl border border-slate-800 col-span-2" />
          <div className="h-64 bg-slate-900/40 rounded-2xl border border-slate-800" />
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

  // Format Recharts Point Tooltip
  const scatterTooltipFormatter = (value: any, name: any) => {
    if (name === 'Retorno Esperado') return [`${value}% a.a.`, name];
    if (name === 'Volatilidade') return [`${value}% a.a.`, name];
    return [value, name];
  };

  return (
    <div className="flex flex-col gap-6 w-full p-6 text-slate-300">
      
      {/* 🚀 SUB-CABALHEIRO QUANT */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-900">
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
        </div>
        
        {/* TAB CONTROLS */}
        <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('frontier')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === 'frontier'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Markowitz
          </button>
          <button
            onClick={() => setActiveTab('rebalance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === 'rebalance'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Banda de Rebalanceamento
          </button>
          <button
            onClick={() => setActiveTab('ranking')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === 'ranking'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Kelly & Momentum
          </button>
          <button
            onClick={() => setActiveTab('sharpe')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === 'sharpe'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sharpe Rolling
          </button>
          <button
            onClick={() => setActiveTab('dca')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
              activeTab === 'dca'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            DCA vs Lump Sum
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────── */}
      {/* 📊 TAB 1: FRONTEIRA EFICIENTE (MARKOWITZ) */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'frontier' && frontierData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6 min-h-[480px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Sliders className="text-blue-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Fronteira Eficiente de Markowitz Interativa
                </h3>
              </div>
              <div className="text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
                Calculado em background com 5.000 simulações
              </div>
            </div>

            {/* Scatter Plot Chart */}
            <div className="h-[320px] w-full relative">
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
                  
                  {/* Nuvem de Portfólios */}
                  <Scatter
                    name="Portfólios Simulados"
                    data={frontierData.cloud}
                    fill="#475569"
                    opacity={0.3}
                    shape="circle"
                  />

                  {/* Linha da Fronteira Eficiente */}
                  <Scatter
                    name="Fronteira Eficiente"
                    data={frontierData.frontier}
                    fill="#3b82f6"
                    line={{ stroke: '#3b82f6', strokeWidth: 2 }}
                    shape="circle"
                  />

                  {/* Pontos Especiais */}
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

                  {/* Destaque do Portfólio Ótimo com base no Slider */}
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
            </div>

            {/* Slider de Risco */}
            <div className="flex flex-col gap-2 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
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
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div>
              <div className="flex items-center gap-2">
                <Target className="text-emerald-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Alocação do Portfólio Sugerido
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Pesos ótimos calculados em tempo real de acordo com seu perfil selecionado.
              </p>
            </div>

            {selectedOptimalPt ? (
              <div className="flex flex-col gap-4 mt-2">
                <div className="grid grid-cols-2 gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800 text-center">
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
      {activeTab === 'rebalance' && rebalanceData && attributionData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Rebalance Bands Table */}
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div>
              <div className="flex items-center gap-2">
                <Target className="text-teal-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Desvios de Peso e Banda de Tolerância (±2%)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Identifique ativos que saíram da faixa de tolerância em relação à meta declarada.
              </p>
            </div>

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
                      <tr key={item.ticker} className="hover:bg-slate-900/20 transition">
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
                              ? 'bg-slate-900 border border-slate-800 text-slate-500'
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
          </Card>

          {/* Alpha Attribution Card */}
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Award className="text-emerald-400" size={18} />
                  <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                    Análise de Atribuição de Alpha (CAPM)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Quantificação do Alpha excedente (retorno não correlacionado ao mercado) gerado por ativo.
                </p>
              </div>
              
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-center">
                <div className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Alpha da Carteira</div>
                <div className="text-base font-bold text-emerald-300">{attributionData.portfolio_alpha_pct}% a.a.</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 bg-slate-900/40 p-3 rounded-xl border border-slate-800 text-center mb-2">
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Retorno EWMA</div>
                <div className="text-sm font-bold text-slate-300">{attributionData.portfolio_return_pct}% a.a.</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Beta EWMA</div>
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
                  <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Ativo</th>
                    <th className="pb-3 text-right">Peso</th>
                    <th className="pb-3 text-right">Beta</th>
                    <th className="pb-3 text-right">Alpha Ativo</th>
                    <th className="pb-3 text-right">Contrib. Alpha</th>
                    <th className="pb-3 text-right pr-2">Aproveitamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs">
                  {attributionData.data.map((item) => {
                    const isPositive = item.weighted_alpha_pct >= 0;
                    
                    return (
                      <tr key={item.ticker} className="hover:bg-slate-900/20 transition">
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

      {/* ──────────────────────────────────────────────────────── */}
      {/* 📊 TAB 3: CRITÉRIO DE KELLY & MOMENTUM RANKING */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'ranking' && kellyData && momentumData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Kelly Criterion Sizing Card */}
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="text-blue-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Dimensionamento Ótimo de Kelly Fracionário
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Sizing sugerido baseado em taxa de acerto e payoffs históricos. Teto estipulado de no máximo 12%.
              </p>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Ativo</th>
                    <th className="pb-3 text-right">Taxa de Ganho</th>
                    <th className="pb-3 text-right">Win/Loss Ratio</th>
                    <th className="pb-3 text-right">Kelly Integral</th>
                    <th className="pb-3 text-right">1/2 Kelly</th>
                    <th className="pb-3 text-right pr-2 font-bold text-blue-400">1/4 Kelly (Sugerido)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs">
                  {kellyData.data.map((item) => (
                    <tr key={item.ticker} className="hover:bg-slate-900/20 transition">
                      <td className="py-3 pl-2 font-bold text-slate-300">{item.ticker}</td>
                      <td className="py-3 text-right">{item.win_rate}%</td>
                      <td className="py-3 text-right">{item.win_loss_ratio}</td>
                      <td className="py-3 text-right text-slate-500">{item.kelly_full}%</td>
                      <td className="py-3 text-right text-slate-400">{item.kelly_half_limit}%</td>
                      <td className="py-3 text-right pr-2 font-bold text-blue-400 bg-blue-500/5">{item.kelly_quarter_limit}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Momentum Cross-Sectional Ranking */}
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="text-emerald-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Ranking Cross-Sectional de Momentum (12m - 1m)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Ordenação de ativos pelo retorno acumulado de 12 meses excluindo o último mês (mean-reversion).
              </p>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Ativo</th>
                    <th className="pb-3 text-right pr-2">Momentum Score (12m-1m)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs">
                  {momentumData.data.map((item) => (
                    <tr key={item.ticker} className="hover:bg-slate-900/20 transition">
                      <td className="py-3 pl-2 text-slate-400">
                        {item.rank === 1 ? (
                          <Badge variant="emerald" className="px-1 text-[9px] font-bold">1º LUGAR</Badge>
                        ) : (
                          `#${item.rank}`
                        )}
                      </td>
                      <td className="py-3 font-bold text-slate-300">{item.ticker}</td>
                      <td className={`py-3 text-right pr-2 font-bold ${
                        item.momentum_score_pct >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {item.momentum_score_pct > 0 ? `+${item.momentum_score_pct}` : item.momentum_score_pct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 📊 TAB 4: SHARPE ROLLING (JANELA 90d) */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'sharpe' && sharpeData && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Checkbox filters */}
          <Card className="flex flex-col gap-3 !bg-slate-950 !border-slate-900 p-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-blue-400" size={18} />
              <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Ativos no Gráfico</h3>
            </div>
            
            <div className="flex flex-col gap-2.5 max-h-[350px] overflow-y-auto pr-1">
              {Object.keys(sharpeData.series).map((col) => {
                const isChecked = sharpeFilter.includes(col);
                const isPort = col === 'portfolio';
                
                return (
                  <label key={col} className="flex items-center gap-2 cursor-pointer py-1 border-b border-slate-900/40 hover:text-slate-100 transition text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setSharpeFilter(sharpeFilter.filter(k => k !== col));
                        } else {
                          setSharpeFilter([...sharpeFilter, col]);
                        }
                      }}
                      className="rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span className={isPort ? 'font-bold text-blue-400' : 'text-slate-300'}>
                      {isPort ? 'Carteira Consolidada' : col}
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* Sharpe Time Chart */}
          <Card className="lg:col-span-3 flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="text-blue-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  Evolução do Sharpe Ratio Móvel (90 Dias Úteis)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitore a eficiência estatística das suas posições. Valores abaixo de zero indicam retorno pior que a Selic.
              </p>
            </div>

            <div className="h-[300px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sharpeData.dates.map((date, dateIdx) => {
                    const row: any = { date };
                    sharpeFilter.forEach((col) => {
                      if (sharpeData.series[col]) {
                        row[col] = sharpeData.series[col][dateIdx];
                      }
                    });
                    return row;
                  })}
                  margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    labelClassName="text-slate-400 font-bold"
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  
                  {sharpeFilter.map((col, idx) => {
                    const isPort = col === 'portfolio';
                    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#e2e8f0'];
                    const color = isPort ? '#f43f5e' : colors[idx % colors.length];
                    
                    return (
                      <Line
                        key={col}
                        type="monotone"
                        dataKey={col}
                        name={isPort ? 'Carteira Consolidada' : col}
                        stroke={color}
                        strokeWidth={isPort ? 2.5 : 1.2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* 📊 TAB 5: SIMULADOR DCA VS LUMP SUM */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'dca' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Controls Column */}
          <Card className="flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6 h-fit">
            <div className="flex items-center gap-2">
              <Sliders className="text-blue-400" size={18} />
              <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Parâmetros</h3>
            </div>
            
            {/* Ticker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Ativo para Simular</label>
              <input
                type="text"
                placeholder="Ex: PETR4"
                value={dcaTicker}
                onChange={(e) => setDcaTicker(e.target.value.toUpperCase())}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 uppercase font-semibold"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
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
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                />
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={runDcaSimulation}
              disabled={dcaLoading}
              className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
            >
              <Play size={12} fill="currentColor" />
              {dcaLoading ? 'Simulando...' : 'Rodar Simulação'}
            </button>

            {dcaError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-[11px] font-semibold">
                ⚠️ {dcaError}
              </div>
            )}
          </Card>

          {/* Graph & Stats Column */}
          <Card className="lg:col-span-3 flex flex-col gap-4 !bg-slate-950 !border-slate-900 p-6 min-h-[420px]">
            <div>
              <div className="flex items-center gap-2">
                <DollarSign className="text-emerald-400" size={18} />
                <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">
                  DCA vs Lump Sum Simulator (Histórico 1 Ano)
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
                  <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800 flex justify-between items-center">
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
                  <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800 flex justify-between items-center">
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

    </div>
  );
}
