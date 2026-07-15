import React, { useEffect, useState, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, ShieldAlert, Target, Zap, Activity,
  AlertTriangle, BarChart3, Info, Scale
} from 'lucide-react';
import { apiCall } from '../utils/apiClient';
import { formatMoney } from '../utils';
import { Asset } from '../types';

interface RiskMetrics {
  status: string;
  msg?: string;
  benchmark: string;
  periodo: string;
  n_pregoes: number;
  taxa_livre_risco_pct: number;
  beta: number;
  alpha_anual_pct: number;
  sharpe_12m: number;
  sortino_12m: number;
  calmar_ratio: number;
  retorno_anual_pct: number;
  retorno_benchmark_pct: number;
  volatilidade_anual_pct: number;
  max_drawdown_pct: number;
  var_95_daily_pct: number;
  var_95_monthly_pct: number;
  cvar_95_daily_pct: number;
  cvar_95_monthly_pct: number;
  tracking_error_pct: number;
  drawdown_chart: { date: string; drawdown: number }[];
  sectors_alloc?: { sector: string; value: number; percent: number }[];
  leverage_ratio?: number;
  leveraged_assets?: { ticker: string; leverage: number; value: number }[];
  usd_exposure_pct?: number;
  usd_assets?: { ticker: string; value: number }[];
  usd_hedge_suggestion?: string;
  upside_capture_pct?: number;
  downside_capture_pct?: number;
  fii_credit_map?: { ticker: string; rating: string; duration: number; indexers: Record<string, number> }[];
  interpretacao: {
    beta: string;
    sharpe: string;
    drawdown: string;
    alpha: string;
  };
}



/** Cartão de métrica individual com tooltip inline */
function MetricCard({
  label, value, unit = '', icon: Icon, color, tooltip, subtext
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  tooltip?: string;
  subtext?: string;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-1 hover:border-slate-700 transition-all group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={color} />
          {tooltip && (
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <Info size={11} />
            </button>
          )}
        </div>
      </div>
      <div className={`text-2xl font-bold font-mono tracking-tight ${color}`}>
        {value}<span className="text-sm font-normal text-slate-500 ml-0.5">{unit}</span>
      </div>
      {subtext && <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{subtext}</p>}

      {showTip && tooltip && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-56 bg-slate-800 border border-slate-700 rounded-lg p-2.5 shadow-2xl text-[10px] text-slate-300 leading-relaxed pointer-events-none">
          {tooltip}
        </div>
      )}
    </div>
  );
}

/** Formatador de cores por valor */
function colorByValue(v: number, goodPositive = true): string {
  if (goodPositive) return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-slate-400';
  return v > 0 ? 'text-red-400' : v < 0 ? 'text-emerald-400' : 'text-slate-400';
}

/** Tooltip personalizado para o gráfico de drawdown */
const DrawdownTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className={`font-bold font-mono ${v < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
        {v.toFixed(2)}%
      </p>
    </div>
  );
};

export const RiskMetricsPanel = React.memo(function RiskMetricsPanel() {
  const [data, setData] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'exposure' | 'credit'>('overview');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    apiCall<RiskMetrics>('/api/risk-metrics', { signal: abortRef.current.signal })
      .then((d: RiskMetrics) => {
        if (d.status === 'Sucesso') setData(d);
        else {
          setData(null);
          setError(d.msg || 'Erro ao carregar métricas.');
        }
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setData(null);
          setError('Falha ao conectar ao servidor.');
        }
      })
      .finally(() => setLoading(false));

    return () => abortRef.current?.abort();
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-slate-800 rounded w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.status !== 'Sucesso') {
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <AlertTriangle className="text-amber-500 mb-3" size={36} />
        <p className="text-sm font-semibold text-slate-300">
          {error || data?.msg || 'Métricas de Risco Indisponíveis'}
        </p>
        <p className="text-xs text-slate-500 mt-2 max-w-md">
          Aguarde o cadastro de pelo menos 2 ativos de renda variável ou a consolidação de dados históricos mínimos (30 dias) para o cálculo destas métricas.
        </p>
      </div>
    );
  }

  const betaValue = data?.beta ?? 1;
  const betaColor = betaValue > 1.1 ? 'text-amber-400' : betaValue < 0.9 ? 'text-blue-400' : 'text-emerald-400';
  const alphaValue = data?.alpha_anual_pct ?? 0;
  const alphaColor = colorByValue(alphaValue);
  const sharpeValue = data?.sharpe_12m ?? 0;
  const sharpeColor = sharpeValue > 1 ? 'text-emerald-400' : sharpeValue > 0 ? 'text-amber-400' : 'text-red-400';
  const drawdownChart = data?.drawdown_chart ?? [];
  const drawdownMin = drawdownChart.length > 0
    ? Math.min(...drawdownChart.map(d => d.drawdown))
    : 0;
  const drawdownMax = Math.max(0, ...drawdownChart.map(d => d.drawdown));

  return (
    <div className="bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-900 flex items-center justify-between bg-gradient-to-r from-slate-950 via-indigo-950/20 to-slate-950">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Activity size={16} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Atribuição de Performance</h3>
            <p className="text-[10px] text-slate-500">vs. {data?.benchmark ?? 'IBOV'} • {data?.periodo ?? '12m'} • {data?.n_pregoes ?? 0} pregões</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700 rounded-lg px-2.5 py-1">
          <BarChart3 size={11} className="text-slate-500" />
          <span className="text-[10px] text-slate-400">CDI: {data?.taxa_livre_risco_pct?.toFixed(2) ?? '0.00'}% a.a.</span>
        </div>
      </div>

      <div className="p-5 space-y-5 flex flex-col">
        {/* Sub-Tabs Nav */}
        <div className="w-full lg:w-3/4 p-1 bg-slate-900/50 rounded-xl border border-slate-800/60 shadow-inner mb-4 self-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
            {[
              { id: 'overview', label: 'Visão Geral', icon: <Activity size={14} /> },
              { id: 'exposure', label: 'Exposições', icon: <Target size={14} /> },
              { id: 'credit', label: 'Risco de Crédito', icon: <ShieldAlert size={14} /> }
            ].map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
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

        {activeSubTab === 'overview' && (
          <>
            {/* Grade de Métricas Principais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Beta (β)" value={betaValue.toFixed(3)} icon={Activity}
            color={betaColor}
            tooltip={`Beta mede a sensibilidade do portfólio ao mercado.\n1.0 = move igual ao IBOV\n>1.0 = amplifica movimentos`}
            subtext={data?.interpretacao?.beta ?? ''}
          />
          <MetricCard
            label="Alpha (α)" value={alphaValue > 0 ? `+${alphaValue.toFixed(2)}` : alphaValue.toFixed(2)}
            unit="% a.a." icon={alphaValue >= 0 ? TrendingUp : TrendingDown}
            color={alphaColor}
            tooltip="Alpha de Jensen: retorno acima/abaixo do esperado pelo CAPM. Alpha positivo = você gerou valor acima do mercado ajustado pelo risco."
            subtext={data?.interpretacao?.alpha ?? ''}
          />
          <MetricCard
            label="Sharpe (12m)" value={sharpeValue.toFixed(3)} icon={Target}
            color={sharpeColor}
            tooltip="Sharpe Ratio: retorno excedente por unidade de risco total. >1.0 é bom, >2.0 é excepcional."
            subtext={data?.interpretacao?.sharpe ?? ''}
          />
          <MetricCard
            label="Sortino (12m)" value={(data?.sortino_12m ?? 0).toFixed(3)} icon={ShieldAlert}
            color={(data?.sortino_12m ?? 0) > 1 ? 'text-emerald-400' : (data?.sortino_12m ?? 0) > 0 ? 'text-amber-400' : 'text-red-400'}
            tooltip="Sortino: como Sharpe, mas divide apenas pela volatilidade negativa. Penaliza perdas, não ganhos."
            subtext={`Calmar: ${(data?.calmar_ratio ?? 0).toFixed(2)}`}
          />
        </div>

        {/* Linha de Retornos */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Retorno Anual" value={`${(data?.retorno_anual_pct ?? 0) > 0 ? '+' : ''}${(data?.retorno_anual_pct ?? 0).toFixed(2)}`}
            unit="%" icon={TrendingUp} color={colorByValue(data?.retorno_anual_pct ?? 0)}
            subtext="Portfólio (log-retornos)"
          />
          <MetricCard
            label="IBOVESPA" value={`${(data?.retorno_benchmark_pct ?? 0) > 0 ? '+' : ''}${(data?.retorno_benchmark_pct ?? 0).toFixed(2)}`}
            unit="%" icon={BarChart3} color={colorByValue(data?.retorno_benchmark_pct ?? 0)}
            subtext="Benchmark (12m)"
          />
          <MetricCard
            label="Volatilidade" value={(data?.volatilidade_anual_pct ?? 0).toFixed(2)}
            unit="% a.a." icon={Zap}
            color={(data?.volatilidade_anual_pct ?? 0) > 30 ? 'text-red-400' : (data?.volatilidade_anual_pct ?? 0) > 20 ? 'text-amber-400' : 'text-emerald-400'}
            tooltip="Desvio-padrão anualizado dos retornos diários do portfólio."
            subtext={`Max Drawdown: ${(data?.max_drawdown_pct ?? 0).toFixed(2)}%`}
          />
        </div>

        {/* Linha de Risco e Caudas (VaR, CVaR, Tracking Error) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Value at Risk (VaR 95%)"
            value={(data?.var_95_monthly_pct ?? 0).toFixed(2)}
            unit="%"
            icon={ShieldAlert}
            color="text-amber-500"
            tooltip="VaR Histórico 95% Mensal: A perda máxima esperada para o portfólio no período de 1 mês, com 95% de nível de confiança."
            subtext={`Diário: ${(data?.var_95_daily_pct ?? 0).toFixed(2)}%`}
          />
          <MetricCard
            label="Conditional VaR (CVaR 95%)"
            value={(data?.cvar_95_monthly_pct ?? 0).toFixed(2)}
            unit="%"
            icon={Zap}
            color="text-red-400"
            tooltip="CVaR (Expected Shortfall): Perda média esperada nos piores 5% dos cenários do período."
            subtext={`Diário: ${(data?.cvar_95_daily_pct ?? 0).toFixed(2)}%`}
          />
          <MetricCard
            label="Tracking Error"
            value={(data?.tracking_error_pct ?? 0).toFixed(2)}
            unit="%"
            icon={Activity}
            color="text-indigo-400"
            tooltip="Tracking Error anualizado: Desvio-padrão da diferença de retornos entre a carteira e o IBOVESPA. Mede o risco ativo do gestor."
            subtext="Volatilidade ativa vs. IBOV"
          />
        </div>

        {/* Gráfico de Drawdown */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-red-400" />
              Drawdown Histórico (12m)
            </h4>
            <span className="text-[10px] bg-red-900/20 text-red-400 border border-red-900/30 px-2 py-0.5 rounded-full font-mono">
              Pior: {(data?.max_drawdown_pct ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={drawdownChart} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#475569', fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(data.drawdown_chart.length / 5)}
                />
                <YAxis
                  tick={{ fill: '#475569', fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[drawdownMin * 1.1, Math.max(0.5, drawdownMax * 1.1)]}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip content={<DrawdownTooltip />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke="#f87171"
                  strokeWidth={1.5}
                  fill="url(#ddGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: '#f87171', strokeWidth: 0 }}
                />
                {/* Linha de referência zero */}
                <CartesianGrid
                  horizontalCoordinatesGenerator={() => []}
                  verticalCoordinatesGenerator={() => []}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-1">
            {data?.interpretacao?.drawdown ?? ''}
          </p>
        </div>
        </>
        )}

        {/* 🛡️ EXPOSIÇÃO E SETORES */}
        {activeSubTab === 'exposure' && (
        <div className="pt-2 grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* 1. Concentração Setorial Real */}
          {data?.sectors_alloc && data.sectors_alloc.length > 0 && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 h-full">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Scale size={12} className="text-indigo-400" />
                Concentração Setorial Real
              </h4>
              <div className="space-y-2.5">
                {data.sectors_alloc.map((s, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-300">{s.sector}</span>
                      <span className="text-slate-400 font-mono">{s.percent}% <span className="text-[8px] text-slate-600">({formatMoney(s.value)})</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full" 
                        style={{ width: `${s.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Cobertura Cambial & Alavancagem */}
          <div className="flex flex-col gap-4">
            
            {/* Cambial */}
            {data?.usd_exposure_pct !== undefined && (
              <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 flex flex-col gap-2 h-full">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Zap size={12} className="text-amber-400" />
                    Hedge Ratio Cambial
                  </h4>
                  <span className="text-[10px] font-black font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {data.usd_exposure_pct}% USD
                  </span>
                </div>
                {data?.usd_assets && data.usd_assets.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {data.usd_assets.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-300">{a.ticker}</span>
                        <span className="text-slate-400">{formatMoney(a.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[9px] text-slate-500 mt-auto leading-relaxed border-t border-slate-800/50 pt-2">
                  {data?.usd_hedge_suggestion}
                </p>
              </div>
            )}

            {/* Alavancagem */}
            {data?.leverage_ratio !== undefined && (
              <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 flex flex-col gap-2 h-full">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Scale size={12} className="text-red-400" />
                    Alavancagem
                  </h4>
                  <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded border ${
                    data.leverage_ratio > 1.0 
                      ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                      : 'text-slate-400 bg-slate-900 border-slate-800'
                  }`}>
                    {data.leverage_ratio}x
                  </span>
                </div>
                {data?.leveraged_assets && data.leveraged_assets.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {data.leveraged_assets.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-300">{a.ticker} (x{a.leverage})</span>
                        <span className="text-slate-400">{formatMoney(a.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-500 mt-auto leading-relaxed text-center">
                    Sem derivativos alavancados.
                  </p>
                )}
              </div>
            )}
          </div>



          
          {/* 3. Upside/Downside Capture Ratios */}
          {data?.upside_capture_pct !== undefined && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 h-full flex flex-col">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Activity size={12} className="text-emerald-400" />
                Capture Ratio vs IBOV
              </h4>
              <div className="grid grid-cols-2 gap-3 text-center flex-1">
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850 h-full">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Upside Capture</span>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {data.upside_capture_pct}%
                  </div>
                  <p className="text-[8px] text-slate-500 mt-1 leading-normal">Fração capturada em meses de alta do IBOV</p>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Downside Capture</span>
                  <div className="text-xl font-bold font-mono text-red-400 mt-1">
                    {data?.downside_capture_pct}%
                  </div>
                  <p className="text-[8px] text-slate-500 mt-1 leading-normal">Fração capturada em meses de queda do IBOV</p>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* 4. Risco de Crédito (FIIs e Renda Fixa) */}
        {activeSubTab === 'credit' && (
          <>
          {data?.fii_credit_map && data.fii_credit_map.length > 0 ? (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 h-full mt-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <ShieldAlert size={12} className="text-indigo-400" />
                Mapa de Risco de Crédito (FIIs & Renda Fixa)
              </h4>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-[9px] text-slate-400 uppercase tracking-wider font-semibold text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 pb-1 text-slate-500">
                      <th className="py-1">Ativo</th>
                      <th className="py-1">Rating Médio</th>
                      <th className="py-1 text-right">Duration</th>
                      <th className="py-1 text-right">Indexadores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {data.fii_credit_map.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-900/20">
                        <td className="py-1.5 text-white font-mono font-bold">{f.ticker}</td>
                        <td className="py-1.5 text-indigo-400">{f.rating}</td>
                        <td className="py-1.5 text-right font-mono">{f.duration} anos</td>
                        <td className="py-1.5 text-right font-mono text-[8px] text-slate-500">
                          {Object.entries(f.indexers).map(([k, v]) => `${k}:${v}%`).join(" | ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 bg-slate-900/20 rounded-xl border border-dashed border-slate-800 mt-2">
              <ShieldAlert size={32} className="mb-3 text-slate-700" />
              <p className="text-sm font-semibold text-slate-400">Sem FIIs ou Renda Fixa</p>
              <p className="text-xs text-slate-500 mt-1 text-center max-w-sm">
                Esta aba monitora o risco de crédito e prazo de vencimento de suas posições em Renda Fixa e FIIs de Papel.
              </p>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
});
