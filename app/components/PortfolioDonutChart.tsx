'use client';
import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '../types';
import { Card } from './ui/Card';
import { Shield, Wallet } from 'lucide-react';
import { formatMoney } from '../lib/format';

import { CATEGORY_COLORS } from '../lib/colors';

interface PortfolioDonutChartProps {
  ativos: Asset[];
  onOpenRadar: () => void;
}

export const PortfolioDonutChart: React.FC<PortfolioDonutChartProps> = ({ ativos, onOpenRadar }) => {
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = totalValue > 0 ? ((data.value / totalValue) * 100).toFixed(1) : 0;
      return (
        <div className="bg-surface-card backdrop-blur border border-slate-700 shadow-2xl rounded-xl p-3 ring-1 ring-black/5 z-[100]">
          <p className="text-sm font-bold text-slate-200 mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill || CATEGORY_COLORS[data.name] }}></span>
            {data.name}
          </p>
          <p className="text-xs text-slate-400 font-mono">
            {formatMoney(data.value)} <span className="text-slate-500 ml-1">({percent}%)</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="flex flex-col h-full min-h-[525px] overflow-hidden !bg-surface-card !border-slate-800 shadow-2xl p-0 relative animate-in fade-in duration-500">
      <div className="p-4 border-b border-slate-800 bg-transparent flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Wallet size={16} className="text-indigo-400" />
          </div>
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest leading-none">Distribuição</h3>
        </div>
        <button 
          onClick={onOpenRadar}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-all"
        >
          <Shield size={12} />
          Radar
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center opacity-50">
            <Wallet size={32} className="text-slate-600 mb-2" />
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sem Dados</span>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
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
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || CATEGORY_COLORS['Outros']} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 100 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <div className="p-3 bg-slate-800/50 rounded-full backdrop-blur-md border border-slate-700/50 shadow-inner mb-1">
                <Wallet size={20} className="text-slate-400" />
              </div>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Carteira</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};
