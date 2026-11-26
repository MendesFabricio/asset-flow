'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Sliders, Play, DollarSign, HelpCircle, TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { MonteCarloSkeleton } from '@/components/ui/Skeletons';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { formatMoney } from '@/lib/format';
import { Asset, DCASimulationData } from '@/types';

const MonteCarloChart = dynamic(() => import('../MonteCarloChart').then((mod) => mod.MonteCarloChart), {
  ssr: false,
  loading: () => <MonteCarloSkeleton />,
});
const MacroStressTestCard = dynamic(() => import('../MacroStressTestCard'), { ssr: false });

interface QuantSimulationsTabProps {
  ativos?: Asset[];
  dcaTicker: string;
  setDcaTicker: (v: string) => void;
  dcaInitialAmount: number;
  setDcaInitialAmount: (v: number) => void;
  dcaMonthlyContribution: number;
  setDcaMonthlyContribution: (v: number) => void;
  dcaResult: DCASimulationData | null;
  dcaLoading: boolean;
  dcaError: string | null;
  runDcaSimulation: () => void;
}

export function QuantSimulationsTab({
  ativos,
  dcaTicker,
  setDcaTicker,
  dcaInitialAmount,
  setDcaInitialAmount,
  dcaMonthlyContribution,
  setDcaMonthlyContribution,
  dcaResult,
  dcaLoading,
  dcaError,
  runDcaSimulation,
}: QuantSimulationsTabProps) {
  const { isHidden } = usePrivacy();
  const palette = useChartPalette();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="flex flex-col bg-surface-card border-border-subtle p-6 h-full">
          <div className="flex items-center gap-2 mb-6">
            <Sliders className="text-accent" size={18} />
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">Parâmetros</h3>
          </div>

          <div className="flex flex-col gap-5 flex-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Ativo para Simular</label>
              <input
                type="text"
                placeholder="Ex: PETR4"
                value={dcaTicker}
                onChange={(e) => setDcaTicker(e.target.value.toUpperCase())}
                className="w-full bg-surface-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent uppercase font-semibold"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Aporte Inicial (Lump Sum)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-text-muted font-bold">R$</span>
                <input
                  type="number"
                  value={dcaInitialAmount}
                  onChange={(e) => setDcaInitialAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-surface-input border border-border-subtle rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent font-semibold"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Aporte Mensal (DCA)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-text-muted font-bold">R$</span>
                <input
                  type="number"
                  value={dcaMonthlyContribution}
                  onChange={(e) => setDcaMonthlyContribution(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-surface-input border border-border-subtle rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {dcaError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-status-error rounded-lg text-[11px] font-semibold">
                ⚠️ {dcaError}
              </div>
            )}

            <button
              type="button"
              onClick={runDcaSimulation}
              disabled={dcaLoading}
              className="flex items-center justify-center gap-2 w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-bold uppercase tracking-wider transition disabled:opacity-50 mt-auto"
            >
              <Play size={12} fill="currentColor" />
              {dcaLoading ? 'Simulando...' : 'Rodar Simulação'}
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-3 flex flex-col gap-4 bg-surface-card border-border-subtle p-6 min-h-[420px]">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="text-status-success" size={18} />
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                DCA vs Lump Sum Simulator (Histórico 1 Ano)
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                  <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                    Compara matematicamente a estratégia de comprar tudo de uma vez (Lump Sum) versus fazer compras menores, recorrentes e mensais (DCA).
                  </div>
                </div>
              </h3>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Visualização comparativa de investimento regular (DCA) contra aporte único (Lump Sum) no último ano.
            </p>
          </div>

          {dcaResult ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-surface-elevated/60 rounded-2xl border border-border-subtle flex justify-between items-center">
                  <div>
                    <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Estratégia Lump Sum</div>
                    <div className="text-xl font-black text-text-primary mt-1">{money(dcaResult.lump_sum.final_value)}</div>
                    <div className="text-[10px] text-text-muted mt-1">Total Investido: {money(dcaResult.lump_sum.invested)}</div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        dcaResult.lump_sum.return_pct >= 0 ? 'bg-emerald-500/10 text-status-success' : 'bg-red-500/10 text-status-error'
                      }`}
                    >
                      {dcaResult.lump_sum.return_pct >= 0 ? `+${dcaResult.lump_sum.return_pct}` : dcaResult.lump_sum.return_pct}%
                    </span>
                    <div className="text-[10px] text-text-secondary mt-1 font-semibold">Lucro: {money(dcaResult.lump_sum.profit)}</div>
                  </div>
                </div>

                <div className="p-4 bg-surface-elevated/60 rounded-2xl border border-border-subtle flex justify-between items-center">
                  <div>
                    <div className="text-[10px] text-accent font-bold uppercase tracking-wider">Estratégia DCA Recorrente</div>
                    <div className="text-xl font-black text-accent mt-1">{money(dcaResult.dca.final_value)}</div>
                    <div className="text-[10px] text-text-muted mt-1">Total Investido: {money(dcaResult.dca.invested)}</div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${
                        dcaResult.dca.return_pct >= 0 ? 'bg-emerald-500/10 text-status-success' : 'bg-red-500/10 text-status-error'
                      }`}
                    >
                      {dcaResult.dca.return_pct >= 0 ? `+${dcaResult.dca.return_pct}` : dcaResult.dca.return_pct}%
                    </span>
                    <div className="text-[10px] text-text-secondary mt-1 font-semibold">Lucro: {money(dcaResult.dca.profit)}</div>
                  </div>
                </div>
              </div>

              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={dcaResult.history} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                    <XAxis dataKey="date" stroke={palette.axis} tick={{ fontSize: 9 }} />
                    <YAxis
                      stroke={palette.axis}
                      tick={{ fontSize: 9 }}
                      tickFormatter={(v) => (isHidden ? '•••' : `R$ ${Number(v).toLocaleString('pt-BR')}`)}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder }}
                      formatter={(val) => money(Number(val))}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="lump_sum_val" name="Valor Lump Sum" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="dca_val" name="Valor DCA" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="dca_invested" name="Investido DCA (Aportes)" stroke="#475569" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-text-muted h-full border border-border-subtle border-dashed rounded-xl">
              <TrendingUp size={36} className="mb-2" />
              <span className="text-xs">Selecione os parâmetros e rode a simulação.</span>
            </div>
          )}
        </Card>
      </div>

      <div className="animate-in fade-in w-full flex flex-col gap-6">
        <MonteCarloChart />
        <MacroStressTestCard ativos={ativos} />
      </div>
    </div>
  );
}
