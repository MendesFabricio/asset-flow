'use client';
import { useEffect, useState, useRef } from 'react';
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

export function RiskMetricsPanel() {
  const [data, setData] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Estados quantitativos adicionais
  const [markowitz, setMarkowitz] = useState<Record<string, number>>({});
  const [riskParity, setRiskParity] = useState<Record<string, number>>({});
  const [currentAlloc, setCurrentAlloc] = useState<Record<string, number>>({});

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

    // Busca otimização de Markowitz
    apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/optimize')
      .then(res => {
        if (res.status === 'Sucesso') setMarkowitz(res.weights);
        else setMarkowitz({});
      }).catch(() => setMarkowitz({}));

    // Busca paridade de risco
    apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/risk-parity')
      .then(res => {
        if (res.status === 'Sucesso') setRiskParity(res.weights);
        else setRiskParity({});
      }).catch(() => setRiskParity({}));

    apiCall<Asset[]>('/api/assets')
      .then(res => {
        const assetsList = Array.isArray(res) ? res : [];
        if (assetsList && assetsList.length > 0) {
          const totalVal = assetsList.reduce((acc: number, curr: Asset) => {
            const val = parseFloat(curr.total_atual as any || 0);
            return acc + (isNaN(val) ? 0 : val);
          }, 0);
          const mapping: Record<string, number> = {};
          assetsList.forEach((a: Asset) => {
            const val = parseFloat(a.total_atual as any || 0);
            const pct = totalVal > 0 ? ((isNaN(val) ? 0 : val) / totalVal) * 100 : 0;
            if (a.ticker) {
              mapping[a.ticker.toUpperCase()] = pct;
            }
          });
          setCurrentAlloc(mapping);
        }
      }).catch(() => {});

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

  if (error || !data) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex items-center gap-3">
        <Info className="text-indigo-400 shrink-0" size={20} />
        <div>
          <p className="text-sm font-semibold text-slate-350">Métricas de Risco & Performance</p>
          <p className="text-xs text-slate-500 mt-1">{error || 'Aguardando o cadastro de ativos de renda variável ou a consolidação de dados históricos mínimos (30 dias) para computar as métricas.'}</p>
        </div>
      </div>
    );
  }

  const betaColor = data.beta > 1.1 ? 'text-amber-400' : data.beta < 0.9 ? 'text-blue-400' : 'text-emerald-400';
  const alphaColor = colorByValue(data.alpha_anual_pct);
  const sharpeColor = data.sharpe_12m > 1 ? 'text-emerald-400' : data.sharpe_12m > 0 ? 'text-amber-400' : 'text-red-400';
  const drawdownMin = data.drawdown_chart.length > 0
    ? Math.min(...data.drawdown_chart.map(d => d.drawdown))
    : 0;
  const drawdownMax = Math.max(0, ...data.drawdown_chart.map(d => d.drawdown));

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Activity size={16} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Atribuição de Performance</h3>
            <p className="text-[10px] text-slate-500">vs. {data.benchmark} • {data.periodo} • {data.n_pregoes} pregões</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700 rounded-lg px-2.5 py-1">
          <BarChart3 size={11} className="text-slate-500" />
          <span className="text-[10px] text-slate-400">CDI: {data.taxa_livre_risco_pct}% a.a.</span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Grade de Métricas Principais */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Beta (β)" value={data.beta.toFixed(3)} icon={Activity}
            color={betaColor}
            tooltip={`Beta mede a sensibilidade do portfólio ao mercado.\n1.0 = move igual ao IBOV\n>1.0 = amplifica movimentos`}
            subtext={data.interpretacao?.beta ?? ''}
          />
          <MetricCard
            label="Alpha (α)" value={data.alpha_anual_pct > 0 ? `+${data.alpha_anual_pct.toFixed(2)}` : data.alpha_anual_pct.toFixed(2)}
            unit="% a.a." icon={data.alpha_anual_pct >= 0 ? TrendingUp : TrendingDown}
            color={alphaColor}
            tooltip="Alpha de Jensen: retorno acima/abaixo do esperado pelo CAPM. Alpha positivo = você gerou valor acima do mercado ajustado pelo risco."
            subtext={data.interpretacao?.alpha ?? ''}
          />
          <MetricCard
            label="Sharpe (12m)" value={data.sharpe_12m.toFixed(3)} icon={Target}
            color={sharpeColor}
            tooltip="Sharpe Ratio: retorno excedente por unidade de risco total. >1.0 é bom, >2.0 é excepcional."
            subtext={data.interpretacao?.sharpe ?? ''}
          />
          <MetricCard
            label="Sortino (12m)" value={data.sortino_12m.toFixed(3)} icon={ShieldAlert}
            color={data.sortino_12m > 1 ? 'text-emerald-400' : data.sortino_12m > 0 ? 'text-amber-400' : 'text-red-400'}
            tooltip="Sortino: como Sharpe, mas divide apenas pela volatilidade negativa. Penaliza perdas, não ganhos."
            subtext={`Calmar: ${data.calmar_ratio.toFixed(2)}`}
          />
        </div>

        {/* Linha de Retornos */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Retorno Anual" value={`${data.retorno_anual_pct > 0 ? '+' : ''}${data.retorno_anual_pct.toFixed(2)}`}
            unit="%" icon={TrendingUp} color={colorByValue(data.retorno_anual_pct)}
            subtext="Portfólio (log-retornos)"
          />
          <MetricCard
            label="IBOVESPA" value={`${data.retorno_benchmark_pct > 0 ? '+' : ''}${data.retorno_benchmark_pct.toFixed(2)}`}
            unit="%" icon={BarChart3} color={colorByValue(data.retorno_benchmark_pct)}
            subtext="Benchmark (12m)"
          />
          <MetricCard
            label="Volatilidade" value={data.volatilidade_anual_pct.toFixed(2)}
            unit="% a.a." icon={Zap}
            color={data.volatilidade_anual_pct > 30 ? 'text-red-400' : data.volatilidade_anual_pct > 20 ? 'text-amber-400' : 'text-emerald-400'}
            tooltip="Desvio-padrão anualizado dos retornos diários do portfólio."
            subtext={`Max Drawdown: ${data.max_drawdown_pct.toFixed(2)}%`}
          />
        </div>

        {/* Linha de Risco e Caudas (VaR, CVaR, Tracking Error) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricCard
            label="Value at Risk (VaR 95%)"
            value={data.var_95_monthly_pct.toFixed(2)}
            unit="%"
            icon={ShieldAlert}
            color="text-amber-500"
            tooltip="VaR Histórico 95% Mensal: A perda máxima esperada para o portfólio no período de 1 mês, com 95% de nível de confiança."
            subtext={`Diário: ${data.var_95_daily_pct.toFixed(2)}%`}
          />
          <MetricCard
            label="Conditional VaR (CVaR 95%)"
            value={data.cvar_95_monthly_pct.toFixed(2)}
            unit="%"
            icon={Zap}
            color="text-red-400"
            tooltip="CVaR (Expected Shortfall): Perda média esperada nos piores 5% dos cenários do período."
            subtext={`Diário: ${data.cvar_95_daily_pct.toFixed(2)}%`}
          />
          <MetricCard
            label="Tracking Error"
            value={data.tracking_error_pct.toFixed(2)}
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
              Pior: {data.max_drawdown_pct.toFixed(2)}%
            </span>
          </div>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.drawdown_chart} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
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
            {data.interpretacao?.drawdown ?? ''}
          </p>
        </div>

        {/* 🛡️ GESTÃO DE RISCO AVANÇADA (Sprint 12) */}
        <div className="pt-5 border-t border-slate-800/85 grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* 1. Concentração Setorial Real */}
          {data.sectors_alloc && data.sectors_alloc.length > 0 && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
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
            {data.usd_exposure_pct !== undefined && (
              <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Zap size={12} className="text-amber-400" />
                    Hedge Ratio Cambial
                  </h4>
                  <span className="text-[10px] font-black font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {data.usd_exposure_pct}% USD
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {data.usd_hedge_suggestion}
                </p>
              </div>
            )}

            {/* Alavancagem */}
            {data.leverage_ratio !== undefined && (
              <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50 flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Scale size={12} className="text-red-400" />
                    Alavancagem Implícita
                  </h4>
                  <span className="text-[10px] font-black font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                    {data.leverage_ratio}x Exposição
                  </span>
                </div>
                {data.leveraged_assets && data.leveraged_assets.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-500">Ativos Alavancados Detectados:</p>
                    {data.leveraged_assets.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-300">{a.ticker} (x{a.leverage})</span>
                        <span className="text-slate-400">{formatMoney(a.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Nenhum ETF ou derivativo alavancado detectado. Risco de alavancagem neutro.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Linha 2 de Risco Avançado */}
        <div className="pt-5 border-t border-slate-800/85 grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* 3. Upside/Downside Capture Ratios */}
          {data.upside_capture_pct !== undefined && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Activity size={12} className="text-emerald-400" />
                Capture Ratio vs IBOV
              </h4>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Upside Capture</span>
                  <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                    {data.upside_capture_pct}%
                  </div>
                  <p className="text-[8px] text-slate-500 mt-1 leading-normal">Fração capturada em meses de alta do IBOV</p>
                </div>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-850">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Downside Capture</span>
                  <div className="text-xl font-bold font-mono text-red-400 mt-1">
                    {data.downside_capture_pct}%
                  </div>
                  <p className="text-[8px] text-slate-500 mt-1 leading-normal">Fração capturada em meses de queda do IBOV</p>
                </div>
              </div>
            </div>
          )}

          {/* 4. Risco de Crédito de FIIs de Recebíveis */}
          {data.fii_credit_map && data.fii_credit_map.length > 0 && (
            <div className="bg-slate-950/30 p-4 rounded-xl border border-slate-800/50">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <ShieldAlert size={12} className="text-indigo-400" />
                Mapa de Risco de Crédito (Recebíveis FII)
              </h4>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-[9px] text-slate-400 uppercase tracking-wider font-semibold text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 pb-1 text-slate-500">
                      <th className="py-1">FII</th>
                      <th className="py-1">Rating Médio</th>
                      <th className="py-1 text-right">Duration</th>
                      <th className="py-1 text-right">Indexadores (CRIs)</th>
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
          )}
        </div>

        {/* Otimização de Portfólio */}
        {Object.keys(markowitz).length > 0 && (
          <div className="pt-5 border-t border-slate-800/85">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <Scale size={12} className="text-indigo-400" />
              Sugestão de Rebalanceamento Quantitativo
            </h4>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-[10px] text-slate-400 uppercase tracking-wider font-semibold text-left">
                <thead>
                  <tr className="border-b border-slate-800 pb-2 text-slate-500">
                    <th className="py-2">Ativo</th>
                    <th className="py-2 text-right">Alocação Atual</th>
                    <th className="py-2 text-right text-blue-400">Sharpe Máximo (Markowitz)</th>
                    <th className="py-2 text-right text-indigo-400">Paridade de Risco (Risk Parity)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {Object.keys({ ...markowitz, ...riskParity }).map((ticker) => {
                    const cleanTicker = ticker.toUpperCase();
                    const current = currentAlloc[cleanTicker] || 0;
                    const markoVal = markowitz[ticker] || 0;
                    const parityVal = riskParity[ticker] || 0;
                    return (
                      <tr key={ticker} className="hover:bg-slate-900/20">
                        <td className="py-2 text-white font-mono font-bold">{cleanTicker}</td>
                        <td className="py-2 text-right font-mono">{current.toFixed(1)}%</td>
                        <td className="py-2 text-right text-blue-400 font-mono">{markoVal.toFixed(1)}%</td>
                        <td className="py-2 text-right text-indigo-400 font-mono">{parityVal.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
