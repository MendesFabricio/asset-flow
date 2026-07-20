'use client';
import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '../lib/format';
import { Card } from './ui/Card';
import { LineChart as LineChartIcon, TrendingUp, Layers, Activity } from 'lucide-react';
import { useChartPalette } from '../lib/chartPalette';

interface HistoryChartItem {
  date: string;
  Patrimônio: number;
  Investido: number;
  IPCA_6?: number;
  [key: string]: any; // Allow dynamic asset classes
}

const CLASS_COLORS: Record<string, string> = {
  'Ação': '#3b82f6', // blue
  'FII': '#8b5cf6', // purple
  'Renda Fixa': '#10b981', // emerald
  'Cripto': '#f59e0b', // amber
  'Internacional': '#ec4899', // pink
  'Reserva': '#64748b', // slate
  'Outros': '#94a3b8'
};

const getColor = (name: string, index: number) => CLASS_COLORS[name] || `hsl(${index * 45}, 70%, 50%)`;

export const HistoryChart = ({ data }: { data: HistoryChartItem[] }) => {
  const [viewMode, setViewMode] = useState<'total' | 'classes'>('total');
  const palette = useChartPalette();

  // Extrai as classes de ativos dinamicamente ignorando as chaves padrão
  const assetClasses = useMemo(() => {
    if (!data) return [];
    const keys = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => {
        if (!['date', 'Patrimônio', 'Investido', 'IPCA_6', 'Lucro'].includes(key)) {
          keys.add(key);
        }
      });
    });
    return Array.from(keys);
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface-card p-8 rounded-xl border border-slate-800 text-center text-slate-500 h-[400px] flex flex-col items-center justify-center gap-4 animate-pulse">
        <div className="p-4 bg-slate-800/50 rounded-full">
          <LineChartIcon size={32} className="text-slate-600" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest">Aguardando dados históricos...</p>
        <span className="text-[10px] text-slate-600 uppercase max-w-[200px]">O gráfico será desenhado automaticamente após o primeiro fechamento diário.</span>
      </div>
    );
  }

  const lastItem = data[data.length - 1];
  const lastPatrimonio = lastItem?.Patrimônio || 0;
  const lastInvestido = lastItem?.Investido || 0;
  const growth = lastInvestido > 0 ? ((lastPatrimonio - lastInvestido) / lastInvestido) * 100 : 0;

  return (
    <Card className="flex flex-col !bg-surface-card !border-slate-800 shadow-2xl p-6 h-[400px] animate-in fade-in duration-500 relative overflow-hidden group">
      
      {/* Header com Resumo */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
            <TrendingUp size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wider">Evolução Patrimonial</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-slate-500">Rentabilidade Histórica:</span>
              <span className={`text-[10px] font-bold ${growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {growth > 0 ? '+' : ''}{growth.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Controles de Visualização e Legenda */}
        <div className="flex flex-col items-end gap-2">
          {assetClasses.length > 0 && (
            <div className="flex items-center bg-slate-900/80 rounded-lg border border-slate-700/50 p-1 backdrop-blur-md">
              <button
                onClick={() => setViewMode('total')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all duration-300 ${
                  viewMode === 'total' 
                    ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <Activity size={12} /> Total
              </button>
              <button
                onClick={() => setViewMode('classes')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all duration-300 ${
                  viewMode === 'classes' 
                    ? 'bg-purple-500/20 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <Layers size={12} /> Classes
              </button>
            </div>
          )}
          
          <div className="flex gap-3 mt-2">
            {viewMode === 'total' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Total</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Aportes</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">IPCA+6%</span>
                </div>
              </>
            ) : (
              assetClasses.map((cls, idx) => (
                <div key={cls} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shadow-lg" style={{ backgroundColor: getColor(cls, idx), boxShadow: `0 0 10px ${getColor(cls, idx)}80` }} />
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{cls}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            {viewMode === 'total' && (
              <defs>
                <linearGradient id="colorPatrimonio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
            )}

            <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />

            <XAxis
              dataKey="date"
              stroke={palette.axis}
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              dy={10}
              minTickGap={30}
            />

            <YAxis
              stroke={palette.axis}
              fontSize={10}
              fontWeight="bold"
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              cursor={{ stroke: viewMode === 'total' ? '#22d3ee' : '#a855f7', strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                backdropFilter: 'blur(10px)',
                borderColor: palette.tooltipBorder,
                borderRadius: '12px',
                boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(148, 163, 184, 0.2)'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '4px' }}
              labelStyle={{ color: palette.tooltipLabel, marginBottom: '8px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: `1px solid ${palette.tooltipLabelBorder}`, paddingBottom: '4px' }}
              formatter={(value: any, name: any) => {
                if (name === 'Patrimônio') return [formatMoney(value), 'TOTAL'];
                if (name === 'IPCA_6') return [formatMoney(value), 'IPCA + 6% EST.'];
                if (name === 'Investido') return [formatMoney(value), 'APORTADO'];
                return [formatMoney(value), String(name).toUpperCase()];
              }}
            />

            {viewMode === 'total' ? (
              <>
                <Area type="monotone" dataKey="Investido" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" fill="transparent" name="Investido" animationDuration={1000} activeDot={false} />
                <Area type="monotone" dataKey="IPCA_6" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 3" fill="transparent" name="IPCA_6" animationDuration={1200} activeDot={false} />
                 <Area type="monotone" dataKey="Patrimônio" stroke="#22d3ee" strokeWidth={3} fill="url(#colorPatrimonio)" name="Patrimônio" animationDuration={1500} activeDot={{ r: 6, strokeWidth: 0, fill: palette.activeDotFill }} />
              </>
            ) : (
              assetClasses.map((cls, idx) => (
                <Area
                  key={cls}
                  type="monotone"
                  dataKey={cls}
                  stackId="1"
                  stroke={getColor(cls, idx)}
                  strokeWidth={2}
                  fill={getColor(cls, idx)}
                  fillOpacity={0.4}
                  animationDuration={1500}
                  activeDot={{ r: 4, strokeWidth: 0, fill: palette.activeDotFill }}
                />
              ))
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
