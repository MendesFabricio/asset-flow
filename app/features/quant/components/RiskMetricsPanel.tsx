'use client';

import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Target,
  Zap,
  Activity,
  AlertTriangle,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { colorByValue, RiskMetrics } from './risk-metrics/types';
import { DrawdownTooltip, MetricCard } from './risk-metrics/MetricCard';
import { RiskExposureAndCreditTabs } from './risk-metrics/RiskExposureAndCreditTabs';

export const RiskMetricsPanel = React.memo(function RiskMetricsPanel() {
  const { isHidden } = usePrivacy();
  const palette = useChartPalette();
  const money = (val: number) => (isHidden ? 'R$ •••••' : formatMoney(val));
  const [data, setData] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'exposure' | 'credit'>('overview');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiCall<RiskMetrics>('/api/risk-metrics', { signal: controller.signal })
      .then((d: RiskMetrics) => {
        if (d.status === 'Sucesso') setData(d);
        else {
          setData(null);
          setError(d.msg || 'Erro ao carregar métricas.');
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setData(null);
          setError(e.message || 'Falha ao conectar ao servidor.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 animate-pulse">
        <div className="h-4 bg-surface-elevated rounded w-48 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface-elevated rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || data.status !== 'Sucesso') {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <AlertTriangle className="text-status-warning mb-3" size={36} />
        <p className="text-sm font-semibold text-text-primary">{error || data?.msg || 'Métricas de Risco Indisponíveis'}</p>
        <p className="text-xs text-text-muted mt-2 max-w-md">
          Aguarde o cadastro de pelo menos 2 ativos de renda variável ou a consolidação de dados históricos mínimos (30 dias) para o cálculo destas métricas.
        </p>
      </div>
    );
  }

  const betaValue = data.beta ?? 1;
  const betaColor = betaValue > 1.1 ? 'text-status-warning' : betaValue < 0.9 ? 'text-accent' : 'text-status-success';
  const alphaValue = data.alpha_anual_pct ?? 0;
  const alphaColor = colorByValue(alphaValue);
  const sharpeValue = data.sharpe_12m ?? 0;
  const sharpeColor = sharpeValue > 1 ? 'text-status-success' : sharpeValue > 0 ? 'text-status-warning' : 'text-status-error';
  const drawdownChart = data.drawdown_chart ?? [];
  const drawdownMin = drawdownChart.length > 0 ? Math.min(...drawdownChart.map((d) => d.drawdown)) : 0;
  const drawdownMax = Math.max(0, ...drawdownChart.map((d) => d.drawdown));

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl">
      <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-elevated/40 rounded-t-2xl">
        <div className="flex items-center gap-2.5 group relative cursor-pointer">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Activity size={16} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              Atribuição de Performance
              <HelpCircle size={14} className="text-text-muted" />
            </h3>
            <p className="text-[10px] text-text-muted">
              vs. {data.benchmark ?? 'IBOV'} - {data.periodo ?? '12m'} - {data.n_pregoes ?? 0} pregões
            </p>
          </div>
          <div className="absolute top-full left-0 mt-2 hidden group-hover:block w-72 p-3 bg-surface-card text-text-secondary text-xs rounded shadow-xl border border-border-subtle z-50">
            Exibe o risco real do portfólio comparado ao benchmark e divide o retorno entre o gerado pelo mercado (Beta) e o gerado ativamente (Alpha).
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-lg px-2.5 py-1">
          <BarChart3 size={11} className="text-text-muted" />
          <span className="text-[10px] text-text-secondary">CDI: {data.taxa_livre_risco_pct?.toFixed(2) ?? '0.00'}% a.a.</span>
        </div>
      </div>

      <div className="p-5 space-y-5 flex flex-col">
        <div className="w-full lg:w-3/4 p-1 bg-surface rounded-xl border border-border-subtle shadow-inner mb-4 self-center">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
            {[
              { id: 'overview', label: 'Visão Geral', icon: <Activity size={14} /> },
              { id: 'exposure', label: 'Exposições', icon: <Target size={14} /> },
              { id: 'credit', label: 'Risco de Crédito', icon: <ShieldAlert size={14} /> },
            ].map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id as 'overview' | 'exposure' | 'credit')}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${isActive
                      ? 'bg-surface-elevated text-accent shadow-md ring-1 ring-border-subtle'
                      : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated/40'
                    }`}
                >
                  {tab.icon}
                  <span className="text-center">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeSubTab === 'overview' ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Beta (β)"
                value={betaValue.toFixed(3)}
                icon={Activity}
                color={betaColor}
                tooltip="Beta mede a sensibilidade do portfólio ao mercado. 1.0 = move igual ao IBOV."
                subtext={data.interpretacao?.beta ?? ''}
              />
              <MetricCard
                label="Alpha (a)"
                value={alphaValue > 0 ? `+${alphaValue.toFixed(2)}` : alphaValue.toFixed(2)}
                unit="% a.a."
                icon={alphaValue >= 0 ? TrendingUp : TrendingDown}
                color={alphaColor}
                tooltip="Alpha de Jensen: retorno acima/abaixo do esperado pelo CAPM."
                subtext={data.interpretacao?.alpha ?? ''}
              />
              <MetricCard
                label="Sharpe (12m)"
                value={sharpeValue.toFixed(3)}
                icon={Target}
                color={sharpeColor}
                tooltip="Sharpe Ratio: retorno excedente por unidade de risco total."
                subtext={data.interpretacao?.sharpe ?? ''}
              />
              <MetricCard
                label="Sortino (12m)"
                value={(data.sortino_12m ?? 0).toFixed(3)}
                icon={ShieldAlert}
                color={(data.sortino_12m ?? 0) > 1 ? 'text-status-success' : (data.sortino_12m ?? 0) > 0 ? 'text-status-warning' : 'text-status-error'}
                tooltip="Sortino: divide apenas pela volatilidade negativa."
                subtext={`Calmar: ${(data.calmar_ratio ?? 0).toFixed(2)}`}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label="Retorno Anual"
                value={`${(data.retorno_anual_pct ?? 0) > 0 ? '+' : ''}${(data.retorno_anual_pct ?? 0).toFixed(2)}`}
                unit="%"
                icon={TrendingUp}
                color={colorByValue(data.retorno_anual_pct ?? 0)}
                subtext="Portfólio (log-retornos)"
              />
              <MetricCard
                label="IBOVESPA"
                value={`${(data.retorno_benchmark_pct ?? 0) > 0 ? '+' : ''}${(data.retorno_benchmark_pct ?? 0).toFixed(2)}`}
                unit="%"
                icon={BarChart3}
                color={colorByValue(data.retorno_benchmark_pct ?? 0)}
                subtext="Benchmark (12m)"
              />
              <MetricCard
                label="Volatilidade"
                value={(data.volatilidade_anual_pct ?? 0).toFixed(2)}
                unit="% a.a."
                icon={Zap}
                color={(data.volatilidade_anual_pct ?? 0) > 30 ? 'text-status-error' : (data.volatilidade_anual_pct ?? 0) > 20 ? 'text-status-warning' : 'text-status-success'}
                tooltip="Desvio-padrão anualizado dos retornos diários do portfólio."
                subtext={`Max Drawdown: ${(data.max_drawdown_pct ?? 0).toFixed(2)}%`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MetricCard
                label="Value at Risk (VaR 95%)"
                value={(data.var_95_monthly_pct ?? 0).toFixed(2)}
                unit="%"
                icon={ShieldAlert}
                color="text-status-warning"
                tooltip="VaR Histórico 95% Mensal: Perda máxima esperada no período de 1 mês."
                subtext={`Diário: ${(data.var_95_daily_pct ?? 0).toFixed(2)}%`}
              />
              <MetricCard
                label="Conditional VaR (CVaR 95%)"
                value={(data.cvar_95_monthly_pct ?? 0).toFixed(2)}
                unit="%"
                icon={Zap}
                color="text-status-error"
                tooltip="CVaR (Expected Shortfall): Perda média esperada nos piores 5% dos cenários."
                subtext={`Diário: ${(data.cvar_95_daily_pct ?? 0).toFixed(2)}%`}
              />
              <MetricCard
                label="Tracking Error"
                value={(data.tracking_error_pct ?? 0).toFixed(2)}
                unit="%"
                icon={Activity}
                color="text-indigo-400"
                tooltip="Tracking Error anualizado vs IBOVESPA."
                subtext="Volatilidade ativa vs. IBOV"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-status-error" />
                  Drawdown Histórico (12m)
                </h4>
                <span className="text-[10px] bg-red-500/10 text-status-error border border-red-500/20 px-2 py-0.5 rounded-full font-mono">
                  Pior: {(data.max_drawdown_pct ?? 0).toFixed(2)}%
                </span>
              </div>
              <div className="h-36 w-full">
                {drawdownChart.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-text-muted">
                    Sem histórico de drawdown suficiente no período.
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={drawdownChart} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: palette.axis, fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.floor(drawdownChart.length / 5)}
                    />
                    <YAxis
                      tick={{ fill: palette.axis, fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      domain={[drawdownMin * 1.1, Math.max(0.5, drawdownMax * 1.1)]}
                      tickFormatter={(v) => Math.abs(drawdownMin) < 10 ? `${v.toFixed(1)}%` : `${v.toFixed(0)}%`}
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
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
              <p className="text-[10px] text-text-muted text-center mt-1">{data.interpretacao?.drawdown ?? ''}</p>
            </div>
          </>
        ) : (
          <RiskExposureAndCreditTabs activeSubTab={activeSubTab} data={data} money={money} />
        )}
      </div>
    </div>
  );
});
