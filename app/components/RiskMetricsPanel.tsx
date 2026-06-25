'use client';
import { useEffect, useState, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, ShieldAlert, Target, Zap, Activity,
  AlertTriangle, BarChart3, Info
} from 'lucide-react';

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
  drawdown_chart: { date: string; drawdown: number }[];
  interpretacao: {
    beta: string;
    sharpe: string;
    drawdown: string;
    alpha: string;
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5328';

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

  useEffect(() => {
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/api/risk-metrics`, { signal: abortRef.current.signal })
      .then(r => r.json())
      .then((d: RiskMetrics) => {
        if (d.status === 'Sucesso') setData(d);
        else setError(d.msg || 'Erro ao carregar métricas.');
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError('Falha ao conectar ao servidor.');
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

  if (error || !data) {
    return (
      <div className="bg-slate-900/40 border border-red-900/30 rounded-2xl p-6 flex items-center gap-3">
        <AlertTriangle className="text-red-400 shrink-0" size={20} />
        <div>
          <p className="text-sm font-semibold text-red-400">Métricas de risco indisponíveis</p>
          <p className="text-xs text-slate-500 mt-0.5">{error || 'Dados históricos insuficientes.'}</p>
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
            subtext={data.interpretacao.beta}
          />
          <MetricCard
            label="Alpha (α)" value={data.alpha_anual_pct > 0 ? `+${data.alpha_anual_pct.toFixed(2)}` : data.alpha_anual_pct.toFixed(2)}
            unit="% a.a." icon={data.alpha_anual_pct >= 0 ? TrendingUp : TrendingDown}
            color={alphaColor}
            tooltip="Alpha de Jensen: retorno acima/abaixo do esperado pelo CAPM. Alpha positivo = você gerou valor acima do mercado ajustado pelo risco."
            subtext={data.interpretacao.alpha}
          />
          <MetricCard
            label="Sharpe (12m)" value={data.sharpe_12m.toFixed(3)} icon={Target}
            color={sharpeColor}
            tooltip="Sharpe Ratio: retorno excedente por unidade de risco total. >1.0 é bom, >2.0 é excepcional."
            subtext={data.interpretacao.sharpe}
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
            {data.interpretacao.drawdown}
          </p>
        </div>
      </div>
    </div>
  );
}
