'use client';
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '../types';
import { Card } from './ui/Card';
import { Wallet } from 'lucide-react';
import { formatMoney } from '../lib/format';

import { CATEGORY_COLORS } from '../lib/colors';
import { usePrivacy } from '../context/PrivacyContext';

interface PortfolioDonutChartProps {
  ativos: Asset[];
}

export const PortfolioDonutChart: React.FC<PortfolioDonutChartProps> = React.memo(function PortfolioDonutChart({ ativos }) {
  const data = useMemo(() => {
    if (!ativos || ativos.length === 0) return [];
    
    const grouped = ativos.reduce((acc: Record<string, number>, asset) => {
      const cat = asset.tipo || 'Outros';
      acc[cat] = (acc[cat] || 0) + asset.total_atual;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [ativos]);

  const totalValue = useMemo(() => data.reduce((acc, curr) => acc + curr.value, 0), [data]);

  const { isHidden } = usePrivacy();

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; pct: string; fill?: string } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : 0;
      return (
        <div className="bg-surface-card backdrop-blur border border-border-subtle shadow-2xl rounded-xl p-3 ring-1 ring-black/5 z-[100]">
          <p className="text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill || CATEGORY_COLORS[data.name] }}></span>
            {data.name}
          </p>
          <p className="text-xs text-text-muted font-mono">
            {isHidden ? '••••••' : formatMoney(data.value)} <span className="opacity-75 ml-1">({percent}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col h-full min-h-[420px] overflow-hidden bg-surface-card border-border-subtle shadow-2xl p-0 relative animate-in fade-in duration-300">
      <div className="p-4 border-b border-border-subtle bg-transparent flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Wallet size={16} className="text-indigo-400" />
          </div>
          <h3 className="font-bold text-text-primary text-xs uppercase tracking-widest leading-none">Distribuição</h3>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-4 gap-3">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center opacity-50">
            <Wallet size={32} className="text-text-muted mb-2" />
            <span className="text-xs text-text-muted font-bold uppercase tracking-wider">Sem Dados</span>
          </div>
        ) : (
          <>
            <div className="relative w-full h-[250px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius="64%"
                    outerRadius="90%"
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                    isAnimationActive={true}
                    animationDuration={300}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Outros']} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 px-4 text-center">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Total</span>
                <span className="text-xs font-bold text-text-primary font-mono mt-0.5">
                  {isHidden ? '••••••' : formatMoney(totalValue)}
                </span>
              </div>
            </div>
            <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-border-subtle">
              {data.slice(0, 6).map((entry) => {
                const pct = totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1).replace('.', ',') : '0,0';
                return (
                  <div key={entry.name} className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-text-muted truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Outros'] }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="font-mono font-bold text-text-primary">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Card>
  );
});
