'use client';

import { useMemo, useState } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import type { Asset } from '@/types';

interface ShockState {
  acaoPct: number;
  fiiPct: number;
  intlPct: number;
  usdDeltaPct: number;
  criptoPct: number;
}

const DEFAULT_SHOCKS: ShockState = {
  acaoPct: 0,
  fiiPct: 0,
  intlPct: 0,
  usdDeltaPct: 0,
  criptoPct: 0,
};

const PRESETS: { label: string; shocks: ShockState }[] = [
  {
    label: 'Crash IBOV (-20%)',
    shocks: { acaoPct: -20, fiiPct: -10, intlPct: -8, usdDeltaPct: 10, criptoPct: -25 },
  },
  {
    label: 'Choque Juros (+2% SELIC)',
    shocks: { acaoPct: -12, fiiPct: -15, intlPct: -5, usdDeltaPct: 6, criptoPct: -10 },
  },
  {
    label: 'Dólar Forte (+15%)',
    shocks: { acaoPct: -4, fiiPct: -2, intlPct: 0, usdDeltaPct: 15, criptoPct: 5 },
  },
  {
    label: 'Inverno Cripto (-40%)',
    shocks: { acaoPct: -2, fiiPct: 0, intlPct: -3, usdDeltaPct: 0, criptoPct: -40 },
  },
];

export default function MacroStressTestCard({ ativos = [] }: { ativos?: Asset[] }) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [shocks, setShocks] = useState<ShockState>(DEFAULT_SHOCKS);

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  const simulation = useMemo(() => {
    let baseTotal = 0;
    let stressedTotal = 0;
    const byCategory: Record<string, { before: number; after: number }> = {};

    ativos.forEach((asset) => {
      const val = Number(asset.total_atual) || 0;
      if (val <= 0) return;

      const cat = asset.tipo || 'Outros';
      let factor = 1.0;

      if (cat === 'Ação') {
        factor = 1 + shocks.acaoPct / 100;
      } else if (cat === 'FII') {
        factor = 1 + shocks.fiiPct / 100;
      } else if (cat === 'Internacional') {
        factor = (1 + shocks.intlPct / 100) * (1 + shocks.usdDeltaPct / 100);
      } else if (cat === 'Cripto') {
        factor = (1 + shocks.criptoPct / 100) * (1 + shocks.usdDeltaPct / 100);
      }

      const nextVal = Math.max(0, val * factor);
      baseTotal += val;
      stressedTotal += nextVal;

      if (!byCategory[cat]) byCategory[cat] = { before: 0, after: 0 };
      byCategory[cat].before += val;
      byCategory[cat].after += nextVal;
    });

    const delta = stressedTotal - baseTotal;
    const deltaPct = baseTotal > 0 ? (delta / baseTotal) * 100 : 0;

    return {
      baseTotal,
      stressedTotal,
      delta,
      deltaPct,
      categories: Object.entries(byCategory).map(([name, vals]) => ({
        name,
        before: vals.before,
        after: vals.after,
        delta: vals.after - vals.before,
        deltaPct: vals.before > 0 ? ((vals.after - vals.before) / vals.before) * 100 : 0,
      })),
    };
  }, [ativos, shocks]);

  if (ativos.length === 0) return null;

  return (
    <Card className="p-6 mt-6 flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-amber-400" size={18} />
          <div>
            <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider">
              Stress Test Macroeconômico Instantâneo
            </h3>
            <p className="text-xs text-text-secondary">
              Avalie a resiliência do patrimônio diante de choques em Bolsa, FIIs, Dólar e Cripto em tempo real.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShocks(DEFAULT_SHOCKS)}
          className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border-subtle px-3 py-1.5 rounded-lg self-start"
        >
          <RotateCcw size={12} />
          Resetar
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => setShocks(preset.shocks)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border-subtle bg-surface hover:border-amber-500/50 text-text-primary transition"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
        {[
          { key: 'acaoPct' as const, label: 'Ações B3' },
          { key: 'fiiPct' as const, label: 'FIIs' },
          { key: 'intlPct' as const, label: 'Ativos USD' },
          { key: 'usdDeltaPct' as const, label: 'Câmbio USD/BRL' },
          { key: 'criptoPct' as const, label: 'Cripto' },
        ].map(({ key, label }) => (
          <div key={key} className="p-3 rounded-xl bg-surface border border-border-subtle space-y-2">
            <div className="flex justify-between font-bold">
              <span className="text-text-secondary">{label}</span>
              <span className={shocks[key] >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {shocks[key] > 0 ? `+${shocks[key]}` : shocks[key]}%
              </span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={shocks[key]}
              onChange={(e) => setShocks((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        ))}
      </div>

      {/* Resumo de Impacto */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-surface border border-border-subtle">
          <span className="text-[10px] uppercase text-text-secondary block">Patrimônio Base</span>
          <span className="text-lg font-black text-text-primary">{maskMoney(simulation.baseTotal)}</span>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border-subtle">
          <span className="text-[10px] uppercase text-text-secondary block">Patrimônio Pós-Choque</span>
          <span className="text-lg font-black text-text-primary">{maskMoney(simulation.stressedTotal)}</span>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border-subtle">
          <span className="text-[10px] uppercase text-text-secondary block">Impacto Estimado</span>
          <span className={`text-lg font-black ${simulation.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {simulation.delta >= 0 ? '+' : ''}
            {maskMoney(simulation.delta)} ({simulation.deltaPct >= 0 ? '+' : ''}
            {simulation.deltaPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Quebra por categoria */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border-subtle text-[10px] uppercase text-text-secondary">
              <th className="py-2">Classe</th>
              <th className="py-2 text-right">Antes</th>
              <th className="py-2 text-right">Pós-Choque</th>
              <th className="py-2 text-right">Variação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {simulation.categories.map((row) => (
              <tr key={row.name}>
                <td className="py-2 font-bold text-text-primary">{row.name}</td>
                <td className="py-2 text-right text-text-secondary">{maskMoney(row.before)}</td>
                <td className="py-2 text-right text-text-primary font-semibold">{maskMoney(row.after)}</td>
                <td className={`py-2 text-right font-bold ${row.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {row.delta >= 0 ? '+' : ''}
                  {maskMoney(row.delta)} ({row.deltaPct >= 0 ? '+' : ''}
                  {row.deltaPct.toFixed(1)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
