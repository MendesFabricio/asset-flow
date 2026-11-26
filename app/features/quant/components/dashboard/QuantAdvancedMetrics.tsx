'use client';

import React, { useMemo, useState } from 'react';
import { Activity, Award, ChevronDown, ChevronUp, HelpCircle, Target } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { useChartPalette } from '@/lib/chartPalette';
import { AlphaAttributionData } from '@/types';
import { KellyCriterionItem, SharpeRollingData } from '../../hooks/useQuantData';

interface QuantAdvancedMetricsProps {
  loading: boolean;
  kellyData: KellyCriterionItem[];
  sharpeRollingData: SharpeRollingData | null;
  attributionData: AlphaAttributionData | null;
}

export function QuantAdvancedMetrics({
  loading,
  kellyData,
  sharpeRollingData,
  attributionData,
}: QuantAdvancedMetricsProps) {
  const palette = useChartPalette();
  const [showAlpha, setShowAlpha] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-status-warning">
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
                      <td className="py-2 text-right font-mono font-semibold text-status-warning">{item.kelly_quarter_limit.toFixed(2)}%</td>
                      <td className="py-2 text-right font-mono text-text-primary">{item.kelly_half_limit.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle font-semibold ${
                  rollingChartData[rollingChartData.length - 1].sharpe >= 0 ? 'text-status-success' : 'text-status-error'
                }`}
              >
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
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.axis }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: palette.axis }} />
                  <ReferenceLine y={0} stroke={palette.axis} strokeDasharray="3 3" strokeOpacity={0.6} />
                  <ReferenceLine y={1} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                  <Tooltip
                    contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder, fontSize: '11px' }}
                    formatter={(value) => [Number(value).toFixed(3), 'Sharpe 60d']}
                    labelFormatter={(_, payload) => (payload?.[0]?.payload?.date ? `Pregão: ${payload[0].payload.date}` : '')}
                  />
                  <Line type="monotone" dataKey="sharpe" name="Carteira" stroke="#38bdf8" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {attributionData && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowAlpha(!showAlpha)}
            className="flex items-center justify-between p-4 bg-surface-card hover:bg-surface-elevated rounded-xl border border-border-subtle transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-status-success group-hover:scale-110 transition-transform">
                <Award size={18} />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-text-primary text-sm tracking-wider flex items-center gap-2">
                  Desempenho vs Mercado (Alpha CAPM)
                  <HelpCircle size={14} className="text-text-muted" />
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Ativos que geram retorno além do esperado pelo risco (Beta vs IBOV).
                </p>
              </div>
            </div>
            {showAlpha ? <ChevronUp size={20} className="text-text-muted" /> : <ChevronDown size={20} className="text-text-muted" />}
          </button>

          {showAlpha && (
            <Card className="flex flex-col gap-4 bg-surface-card border-border-subtle p-6">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-text-secondary text-xs uppercase tracking-wider">Resumo do Portfólio (CAPM)</h3>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-center">
                  <div className="text-[9px] text-status-success font-bold uppercase tracking-wider">Alpha da Carteira</div>
                  <div className="text-base font-bold text-status-success">{attributionData.portfolio_alpha_pct}% a.a.</div>
                </div>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase tracking-wider">
                      <th className="pb-3 pl-2">Ativo</th>
                      <th className="pb-3 text-right">Peso</th>
                      <th className="pb-3 text-right">Beta</th>
                      <th className="pb-3 text-right">Alpha Ativo</th>
                      <th className="pb-3 text-right pr-2">Contrib. Alpha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-xs">
                    {attributionData.data.map((item) => {
                      const isPositive = item.weighted_alpha_pct >= 0;
                      return (
                        <tr key={item.ticker} className="hover:bg-surface-elevated/40 transition">
                          <td className="py-2.5 pl-2 font-bold text-text-primary">{item.ticker}</td>
                          <td className="py-2.5 text-right">{item.weight_pct}%</td>
                          <td className="py-2.5 text-right">{item.beta}</td>
                          <td className={`py-2.5 text-right ${item.asset_alpha_pct >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {item.asset_alpha_pct > 0 ? `+${item.asset_alpha_pct}` : item.asset_alpha_pct}%
                          </td>
                          <td className={`py-2.5 text-right pr-2 font-bold ${isPositive ? 'text-status-success' : 'text-status-error'}`}>
                            {item.weighted_alpha_pct > 0 ? `+${item.weighted_alpha_pct}` : item.weighted_alpha_pct}%
                          </td>
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
    </div>
  );
}
