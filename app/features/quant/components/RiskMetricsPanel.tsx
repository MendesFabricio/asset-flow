import React, { useEffect, useState, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, ShieldAlert, Target, Zap, Activity,
  AlertTriangle, BarChart3, Info, Scale, HelpCircle
} from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { SEMANTIC_CHART_HEX } from '@/lib/colors';


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
  sectors_alloc?: { 
    sector: string; 
    value: number; 
    percent: number; 
    assets?: { ticker: string; value: number; percent: number }[]; 
  }[];
  leverage_ratio?: number;
  leveraged_assets?: { ticker: string; leverage: number; value: number }[];
  usd_exposure_pct?: number;
  usd_assets?: { ticker: string; value: number }[];
  usd_hedge_suggestion?: string;
  upside_capture_pct?: number;
  downside_capture_pct?: number;
  fii_credit_map?: {
    ticker: string;
    category?: string;
    rating: string;
    duration: number | null;
    indexers: Record<string, number>;
    p_vp?: string | null;
    alavancagem?: string | null;
    caixa_pct?: string | null;
    has_report_pdf?: boolean;
  }[];
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
    <div className="relative bg-surface-elevated border border-border-subtle rounded-xl p-4 flex flex-col gap-1 transition-colors group">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={color} />
          {tooltip && (
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <Info size={11} />
            </button>
          )}
        </div>
      </div>
      <div className={`text-2xl font-semibold font-mono tracking-tight tabular-nums ${color}`}>
        {value}<span className="text-sm font-normal text-text-muted ml-0.5">{unit}</span>
      </div>
      {subtext && <p className="text-2xs text-text-muted leading-tight mt-0.5 tabular-nums">{subtext}</p>}

      {showTip && tooltip && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-56 bg-surface-elevated border border-border-subtle rounded-lg p-2.5 shadow-lg text-2xs text-text-primary leading-relaxed pointer-events-none">
          {tooltip}
        </div>
      )}
    </div>
  );
}

/** Formatador de cores por valor */
function colorByValue(v: number, goodPositive = true): string {
  if (goodPositive) return v > 0 ? 'text-status-success' : v < 0 ? 'text-status-error' : 'text-text-muted';
  return v > 0 ? 'text-status-error' : v < 0 ? 'text-status-success' : 'text-text-muted';
}

/** Tooltip personalizado para o gráfico de drawdown */
const DrawdownTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="bg-surface-elevated border border-border-subtle rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-muted mb-1">{label}</p>
      <p className={`font-semibold font-mono tabular-nums ${v < 0 ? 'text-status-error' : 'text-status-success'}`}>
        {v.toFixed(2)}%
      </p>
    </div>
  );
};

export const RiskMetricsPanel = React.memo(function RiskMetricsPanel() {
  const { isHidden } = usePrivacy();
  const palette = useChartPalette();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));
  const [data, setData] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'exposure' | 'credit'>('overview');
  const [analyzingTicker, setAnalyzingTicker] = useState<string | null>(null);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadRiskMetrics = (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    apiCall<RiskMetrics>('/api/risk-metrics', signal ? { signal } : undefined)
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
          setError(e.message || 'Falha ao conectar ao servidor.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    loadRiskMetrics(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const handleAnalyzePdf = async (ticker: string) => {
    setAnalyzingTicker(ticker);
    setAnalyzeMsg(null);
    try {
      const res = await apiCall<{ status: string; msg?: string }>('/api/ai/analyze-pdf', {
        method: 'POST',
        body: JSON.stringify({ ticker }),
      });
      if (res.status === 'Sucesso' || res.status === 'Aviso') {
        setAnalyzeMsg(`${ticker}: dados extraídos do relatório oficial.`);
        loadRiskMetrics();
      } else {
        setAnalyzeMsg(`${ticker}: ${res.msg || 'não foi possível extrair do PDF.'}`);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setAnalyzeMsg(`${ticker}: ${err?.message || 'falha ao analisar relatório.'}`);
    } finally {
      setAnalyzingTicker(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-xl p-6 animate-pulse">
        <div className="h-4 bg-surface-input rounded w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-input rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.status !== 'Sucesso') {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <AlertTriangle className="text-status-warning mb-3" size={36} />
        <p className="text-sm font-semibold text-text-primary">
           {error || data?.msg || 'Métricas de Risco Indisponíveis'}
        </p>
        <p className="text-xs text-text-muted mt-2 max-w-md">
          Aguarde o cadastro de pelo menos 2 ativos de renda variável ou a consolidação de dados históricos mínimos (30 dias) para o cálculo destas métricas.
        </p>
      </div>
    );
  }

  const betaValue = data?.beta ?? 1;
  const betaColor = betaValue > 1.1 ? 'text-status-warning' : betaValue < 0.9 ? 'text-accent' : 'text-status-success';
  const alphaValue = data?.alpha_anual_pct ?? 0;
  const alphaColor = colorByValue(alphaValue);
  const sharpeValue = data?.sharpe_12m ?? 0;
  const sharpeColor = sharpeValue > 1 ? 'text-status-success' : sharpeValue > 0 ? 'text-status-warning' : 'text-status-error';
  const drawdownChart = data?.drawdown_chart ?? [];
  const drawdownMin = drawdownChart.length > 0
    ? Math.min(...drawdownChart.map(d => d.drawdown))
    : 0;
  const drawdownMax = Math.max(0, ...drawdownChart.map(d => d.drawdown));

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-elevated rounded-t-xl">
        <div className="flex items-center gap-2.5 group relative cursor-pointer">
          <div className="p-1.5 bg-accent-soft rounded-lg border border-accent/20">
            <Activity size={16} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              Atribuição de Performance
              <HelpCircle size={14} className="text-text-muted" />
            </h3>
            <p className="text-2xs text-text-muted tabular-nums">vs. {data?.benchmark ?? 'IBOV'} - {data?.periodo ?? '12m'} - {data?.n_pregoes ?? 0} pregões</p>
          </div>
          
          <div className="absolute top-full left-0 mt-2 hidden group-hover:block w-72 p-3 bg-surface-elevated text-text-primary text-xs rounded-lg shadow-lg border border-border-subtle z-50">
            Exibe o risco real do portfólio comparado ao benchmark e divide o retorno entre o gerado pelo mercado (Beta) e o gerado ativamente (Alpha).
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-input border border-border-subtle rounded-lg px-2.5 py-1">
          <BarChart3 size={11} className="text-text-muted" />
          <span className="text-2xs text-text-muted tabular-nums">CDI: {data?.taxa_livre_risco_pct?.toFixed(2) ?? '0.00'}% a.a.</span>
        </div>
      </div>

      <div className="p-5 space-y-5 flex flex-col">
        {/* Sub-Tabs Nav */}
        <div className="w-full lg:w-3/4 p-1 bg-surface-input rounded-xl border border-border-subtle mb-4 self-center">
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
                  onClick={() => setActiveSubTab(tab.id as 'overview' | 'exposure' | 'credit')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-2xs sm:text-xs font-semibold uppercase tracking-wider transition-colors ${
                    isActive
                      ? 'bg-surface-card text-accent border border-border-subtle'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-card/60'
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
            label="Alpha (a)" value={alphaValue > 0 ? `+${alphaValue.toFixed(2)}` : alphaValue.toFixed(2)}
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
            color={(data?.sortino_12m ?? 0) > 1 ? 'text-status-success' : (data?.sortino_12m ?? 0) > 0 ? 'text-status-warning' : 'text-status-error'}
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
            color={(data?.volatilidade_anual_pct ?? 0) > 30 ? 'text-status-error' : (data?.volatilidade_anual_pct ?? 0) > 20 ? 'text-status-warning' : 'text-status-success'}
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
            color="text-status-warning"
            tooltip="VaR Histórico 95% Mensal: A perda máxima esperada para o portfólio no período de 1 mês, com 95% de nível de confiança."
            subtext={`Diário: ${(data?.var_95_daily_pct ?? 0).toFixed(2)}%`}
          />
          <MetricCard
            label="Conditional VaR (CVaR 95%)"
            value={(data?.cvar_95_monthly_pct ?? 0).toFixed(2)}
            unit="%"
            icon={Zap}
            color="text-status-error"
            tooltip="CVaR (Expected Shortfall): Perda média esperada nos piores 5% dos cenários do período."
            subtext={`Diário: ${(data?.cvar_95_daily_pct ?? 0).toFixed(2)}%`}
          />
          <MetricCard
            label="Tracking Error"
            value={(data?.tracking_error_pct ?? 0).toFixed(2)}
            unit="%"
            icon={Activity}
            color="text-accent"
            tooltip="Tracking Error anualizado: Desvio-padrão da diferença de retornos entre a carteira e o IBOVESPA. Mede o risco ativo do gestor."
            subtext="Volatilidade ativa vs. IBOV"
          />
        </div>

        {/* Gráfico de Drawdown */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert size={12} className="text-status-error" />
              Drawdown Histórico (12m)
            </h4>
            <span className="text-2xs bg-status-error/10 text-status-error border border-status-error/20 px-2 py-0.5 rounded-md font-mono tabular-nums">
              Pior: {(data?.max_drawdown_pct ?? 0).toFixed(2)}%
            </span>
          </div>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={drawdownChart} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SEMANTIC_CHART_HEX.redLight} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={SEMANTIC_CHART_HEX.redLight} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: palette.axis, fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(data.drawdown_chart.length / 5)}
                />
                <YAxis
                  tick={{ fill: palette.axis, fontSize: 9 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[drawdownMin * 1.1, Math.max(0.5, drawdownMax * 1.1)]}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip content={<DrawdownTooltip />} />
                <Area
                  type="monotone"
                  dataKey="drawdown"
                  stroke={SEMANTIC_CHART_HEX.redLight}
                  strokeWidth={1.5}
                  fill="url(#ddGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: SEMANTIC_CHART_HEX.redLight, strokeWidth: 0 }}
                />
                {/* Linha de referência zero */}
                <CartesianGrid
                  horizontalCoordinatesGenerator={() => []}
                  verticalCoordinatesGenerator={() => []}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-2xs text-text-muted text-center mt-1">
            {data?.interpretacao?.drawdown ?? ''}
          </p>
        </div>
        </>
        )}

        {/* Exposição e Setores */}
        {activeSubTab === 'exposure' && (
        <div className="pt-2 grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* 1. Concentração Setorial Real */}
          {data?.sectors_alloc && data.sectors_alloc.length > 0 && (
            <div className="bg-surface p-4 rounded-xl border border-border-subtle h-full">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Scale size={12} className="text-accent" />
                Concentração Setorial Real
              </h4>
              <div className="space-y-2.5">
                {data.sectors_alloc.map((s, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-2xs font-semibold">
                      <span className="text-text-primary">{s.sector}</span>
                      <span className="text-text-muted font-mono tabular-nums">{s.percent}% <span className="text-2xs text-text-muted">({money(s.value)})</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-surface-input rounded-full relative group cursor-pointer">
                      <div 
                        className="h-full bg-accent rounded-full" 
                        style={{ width: `${s.percent}%` }}
                      />
                      {s.assets && s.assets.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 p-2 bg-surface-elevated rounded-lg shadow-lg border border-border-subtle z-50 pointer-events-none">
                          <div className="font-semibold text-text-primary mb-1 border-b border-border-subtle pb-1 text-2xs uppercase tracking-wider">{s.sector}</div>
                          {s.assets.map(a => (
                            <div key={a.ticker} className="flex justify-between items-center py-0.5 text-2xs tabular-nums">
                              <span className="text-text-primary">{a.ticker}</span>
                              <span className="font-mono text-text-muted">{a.percent}%</span>
                            </div>
                          ))}
                        </div>
                      )}
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
              <div className="bg-surface p-4 rounded-xl border border-border-subtle flex flex-col gap-2 h-full">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Zap size={12} className="text-status-warning" />
                    Hedge Ratio Cambial
                  </h4>
                  <span className="text-2xs font-semibold font-mono tabular-nums text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-md border border-status-warning/20">
                    {data.usd_exposure_pct}% USD
                  </span>
                </div>
                {data?.usd_assets && data.usd_assets.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {data.usd_assets.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-2xs font-mono tabular-nums">
                        <span className="text-text-primary">{a.ticker}</span>
                        <span className="text-text-muted">{money(a.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-2xs text-text-muted mt-auto leading-relaxed border-t border-border-subtle pt-2">
                  {data?.usd_hedge_suggestion}
                </p>
              </div>
            )}

            {/* Alavancagem */}
            {data?.leverage_ratio !== undefined && (
              <div className="bg-surface p-4 rounded-xl border border-border-subtle flex flex-col gap-2 h-full">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <Scale size={12} className="text-status-error" />
                    Alavancagem
                  </h4>
                  <span className={`text-2xs font-semibold font-mono tabular-nums px-2 py-0.5 rounded-md border ${
                    data.leverage_ratio > 1.0 
                      ? 'text-status-error bg-status-error/10 border-status-error/20' 
                      : 'text-text-muted bg-surface-input border-border-subtle'
                  }`}>
                    {data.leverage_ratio}x
                  </span>
                </div>
                {data?.leveraged_assets && data.leveraged_assets.length > 0 ? (
                  <div className="space-y-1 mt-1">
                    {data.leveraged_assets.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-2xs font-mono tabular-nums">
                        <span className="text-text-primary">{a.ticker} (x{a.leverage})</span>
                        <span className="text-text-muted">{money(a.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-2xs text-text-muted mt-auto leading-relaxed text-center">
                    Sem derivativos alavancados.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. Upside/Downside Capture Ratios */}
          {data?.upside_capture_pct !== undefined && (
            <div className="bg-surface p-4 rounded-xl border border-border-subtle h-full flex flex-col">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Activity size={12} className="text-status-success" />
                Capture Ratio vs IBOV
              </h4>
              <div className="grid grid-cols-2 gap-3 text-center flex-1">
                <div className="bg-surface-card p-3 rounded-lg border border-border-subtle h-full">
                  <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Upside Capture</span>
                  <div className="text-xl font-semibold font-mono text-status-success tabular-nums mt-1">
                    {data.upside_capture_pct}%
                  </div>
                  <p className="text-2xs text-text-muted mt-1 leading-normal">Fração capturada em meses de alta do IBOV</p>
                </div>
                <div className="bg-surface-card p-3 rounded-lg border border-border-subtle">
                  <span className="text-2xs font-semibold text-text-muted uppercase tracking-wide">Downside Capture</span>
                  <div className="text-xl font-semibold font-mono text-status-error tabular-nums mt-1">
                    {data?.downside_capture_pct}%
                  </div>
                  <p className="text-2xs text-text-muted mt-1 leading-normal">Fração capturada em meses de queda do IBOV</p>
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
            <div className="bg-surface p-4 rounded-xl border border-border-subtle h-full mt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-accent" />
                  Mapa de Risco de Crédito &amp; Saúde (FIIs &amp; Renda Fixa)
                </h4>
                {analyzeMsg && (
                  <span className="text-2xs text-accent font-medium">{analyzeMsg}</span>
                )}
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-2xs text-text-muted uppercase tracking-wider font-semibold text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle pb-1 text-text-muted">
                      <th className="py-1.5">Ativo</th>
                      <th className="py-1.5 text-right">P/VP</th>
                      <th className="py-1.5 text-right">Alavancagem</th>
                      <th className="py-1.5 text-right">Caixa (% PL)</th>
                      <th className="py-1.5 text-right">Rating / Prazo</th>
                      <th className="py-1.5 text-right">Indexadores</th>
                      <th className="py-1.5 text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.fii_credit_map.map((f, i) => {
                      const hasCredit = f.rating !== 'N/D' || (f.duration !== null && f.duration !== undefined);
                      return (
                        <tr key={i} className="hover:bg-surface-input/40">
                          <td className="py-2 text-text-primary font-mono font-semibold">
                            <span>{f.ticker}</span>
                            {f.category && (
                              <span className="ml-2 text-2xs px-1.5 py-0.5 rounded-md bg-surface-input text-text-muted">
                                {f.category}
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-text-primary">{f.p_vp || '-'}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-status-warning">{f.alavancagem || '-'}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-status-success">{f.caixa_pct || '-'}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-accent">
                            {hasCredit
                              ? `${f.rating}${f.duration !== null && f.duration !== undefined && f.duration > 0 ? ` · ${f.duration}a` : ''}`
                              : 'N/D'}
                          </td>
                          <td className="py-2 text-right font-mono text-2xs text-text-muted tabular-nums">
                            {Object.keys(f.indexers).length > 0
                              ? Object.entries(f.indexers).map(([k, v]) => `${k}:${v}%`).join(' | ')
                              : 'N/D'}
                          </td>
                          <td className="py-2 text-right">
                            {f.has_report_pdf ? (
                              <button
                                type="button"
                                disabled={analyzingTicker === f.ticker}
                                onClick={() => handleAnalyzePdf(f.ticker)}
                                className="px-2 py-0.5 rounded-md bg-accent-soft hover:bg-accent/20 text-accent border border-accent/30 text-2xs font-semibold uppercase disabled:opacity-50"
                              >
                                {analyzingTicker === f.ticker ? 'Lendo...' : hasCredit ? 'Re-ler' : 'Ler PDF'}
                              </button>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-text-muted bg-surface rounded-xl border border-dashed border-border-subtle mt-2">
              <ShieldAlert size={32} className="mb-3 text-text-muted" />
              <p className="text-sm font-semibold text-text-primary">Sem FIIs ou Renda Fixa</p>
              <p className="text-xs text-text-muted mt-1 text-center max-w-sm">
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
