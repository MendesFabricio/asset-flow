'use client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from '../utils';
import { Card } from './ui/Card';
import { LineChart as LineChartIcon, TrendingUp } from 'lucide-react';

interface HistoryChartItem {
  date: string;
  Patrimônio: number;
  Investido: number;
}

export const HistoryChart = ({ data }: { data: HistoryChartItem[] }) => { // 🌟 Substituído 'any[]' por tipo seguro
  if (!data || data.length === 0) {
    return (
      <div className="bg-[#0f172a] p-8 rounded-xl border border-slate-800 text-center text-slate-500 h-[400px] flex flex-col items-center justify-center gap-4 animate-pulse">
        <div className="p-4 bg-slate-800/50 rounded-full">
          <LineChartIcon size={32} className="text-slate-600" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest">Aguardando dados históricos...</p>
        <span className="text-[10px] text-slate-600 uppercase max-w-[200px]">O gráfico será desenhado automaticamente após o primeiro fechamento diário.</span>
      </div>
    );
  }

  // Pega o último valor para exibir no header
  const lastItem = data[data.length - 1];
  const lastPatrimonio = lastItem?.Patrimônio || 0;
  const lastInvestido = lastItem?.Investido || 0;
  const growth = lastInvestido > 0 ? ((lastPatrimonio - lastInvestido) / lastInvestido) * 100 : 0;

  return (
    <Card className="flex flex-col !bg-[#0f172a] !border-slate-800 shadow-2xl p-6 h-[400px] animate-in fade-in duration-500 relative overflow-hidden group">

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

        {/* Legenda Customizada */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Total</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-800">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Aportes</span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full relative z-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPatrimonio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="date"
              stroke="#475569"
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              dy={10}
              minTickGap={30}
            />

            <YAxis
              stroke="#475569"
              fontSize={10}
              fontWeight="bold"
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tickLine={false}
              axisLine={false}
            />

            <Tooltip
              cursor={{ stroke: '#22d3ee', strokeWidth: 1, strokeDasharray: '4 4' }}
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(8px)',
                borderColor: '#334155',
                borderRadius: '12px',
                boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.7)',
                border: '1px solid rgba(148, 163, 184, 0.1)'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold', paddingTop: '2px' }}
              formatter={(value: any, name: any) => [
                formatMoney(value),
                name === 'Patrimônio' ? 'TOTAL' : 'APORTADO'
              ]}
              labelStyle={{ color: '#94a3b8', marginBottom: '8px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
            />

            {/* Linha de Investido (Fundo) */}
            <Area
              type="monotone"
              dataKey="Investido"
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="transparent"
              name="Investido"
              animationDuration={1000}
              activeDot={false}
            />

            {/* Linha de Patrimônio (Frente) */}
            <Area
              type="monotone"
              dataKey="Patrimônio"
              stroke="#22d3ee"
              strokeWidth={3}
              fill="url(#colorPatrimonio)"
              name="Patrimônio"
              animationDuration={1500}
              activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
