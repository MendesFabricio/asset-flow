'use client';
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '../types';
import { Card } from './ui/Card';
import { Shield, Wallet } from 'lucide-react';
import { formatMoney } from '../lib/format';

import { CATEGORY_COLORS } from '../lib/colors';
import { usePrivacy } from '../context/PrivacyContext';

interface PortfolioDonutChartProps {
  ativos: Asset[];
  onOpenRadar: () => void;
}

export const PortfolioDonutChart: React.FC<PortfolioDonutChartProps> = React.memo(function PortfolioDonutChart({ ativos, onOpenRadar }) {
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
        <div className="bg-surface-card border border-border-subtle shadow-lg rounded-xl p-3 z-[100]">
          <p className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill || CATEGORY_COLORS[data.name] }}></span>
            {data.name}
          </p>
          <p className="text-xs text-text-muted font-mono tabular-nums">
            {isHidden ? '••••••' : formatMoney(data.value)} <span className="text-text-muted ml-1">({percent}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col h-full min-h-[420px] overflow-hidden bg-surface-card border-border-subtle shadow-sm p-0 relative">
      <div className="p-4 border-b border-border-subtle bg-transparent flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-accent-soft rounded-lg border border-accent/20">
            <Wallet size={16} className="text-accent" />
          </div>
          <h3 className="font-semibold text-text-primary text-xs uppercase tracking-wider leading-none">Distribuição</h3>
        </div>
        <button 
          onClick={onOpenRadar}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-2xs font-semibold tracking-wider uppercase text-text-muted hover:text-accent hover:bg-accent-soft border border-transparent hover:border-accent/20 transition-colors"
        >
          <Shield size={12} />
          Radar
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center opacity-50">
            <Wallet size={32} className="text-text-muted mb-2" />
            <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">Sem Dados</span>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius="65%"
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="p-3 bg-surface-elevated rounded-full border border-border-subtle mb-1">
                <Wallet size={20} className="text-text-muted" />
              </div>
              <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Carteira</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
});
