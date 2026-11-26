'use client';

import { useMemo } from 'react';
import { Table } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { SeasonalityRow } from './types';

interface DividendSeasonalityViewProps {
  seasonality: SeasonalityRow[];
  isHidden: boolean;
  money: (val: number) => string;
}

export function DividendSeasonalityView({ seasonality, isHidden, money }: DividendSeasonalityViewProps) {
  const maxSeasonalityVal = useMemo(() => {
    let max = 0.1;
    seasonality.forEach((row) => {
      for (let m = 1; m <= 12; m++) {
        const val = row[`m${m}`] || 0;
        if (val > max) max = val;
      }
    });
    return max;
  }, [seasonality]);

  const getHeatmapStyle = (val: number) => {
    if (!val || val === 0) return undefined;
    const intensity = Math.min(0.85, 0.15 + (val / maxSeasonalityVal) * 0.7);
    return {
      backgroundColor: `rgba(16, 185, 129, ${intensity})`,
      color: intensity > 0.5 ? '#022c22' : '#a7f3d0',
    };
  };

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 backdrop-blur-md overflow-hidden">
      <div className="flex items-center gap-2 mb-6">
        <Table className="text-purple-400" size={16} />
        <h2 className="text-base font-bold text-text-primary">Heatmap Sazonal de Rendimentos</h2>
      </div>

      <div className="overflow-x-auto w-full border border-border-subtle rounded-xl">
        <table className="w-full text-xs text-center border-collapse bg-surface">
          <thead className="bg-surface-elevated text-text-muted font-bold border-b border-border-subtle">
            <tr>
              <th className="p-3 text-left">Ano</th>
              {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m) => (
                <th key={m} className="p-3">{m}</th>
              ))}
              <th className="p-3 font-bold text-text-primary text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {seasonality.map((row) => {
              const yearlyTotal = Array.from({ length: 12 }, (_, i) => row[`m${i + 1}`] || 0).reduce((a, b) => a + b, 0);
              return (
                <tr key={row.year} className="hover:bg-surface-elevated/40">
                  <td className="p-3 font-bold text-text-primary text-left bg-surface-elevated/60">{row.year}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const val = row[`m${i + 1}`] || 0;
                    const style = getHeatmapStyle(val);
                    return (
                      <td
                        key={i}
                        className={`p-3 border border-border-subtle font-mono font-bold text-[10px] ${
                          !style ? 'bg-surface-elevated/20 text-text-muted' : ''
                        }`}
                        style={style}
                      >
                        {val > 0 ? (isHidden ? '•••' : formatMoney(val).replace('R$', '')) : '--'}
                      </td>
                    );
                  })}
                  <td className="p-3 font-mono font-bold text-text-primary text-right bg-surface-elevated/60">
                    {money(yearlyTotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
