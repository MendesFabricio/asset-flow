"use client";

import { useEffect, useState } from 'react';
import { portfolioService, MonthlyEvolutionData, SyncStatus } from '@/services/portfolio';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatMoney } from '@/lib/format';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function MonthlyPnLChart() {
  const [data, setData] = useState<MonthlyEvolutionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const fetchChartData = () => {
    setIsLoading(true);
    portfolioService.getMonthlyEvolution()
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchChartData();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (syncStatus?.status === 'processing') {
      interval = setInterval(async () => {
        try {
          const status = await portfolioService.getHistorySyncStatus();
          setSyncStatus(status);
          if (status.status === 'idle' || status.status === 'success') {
            fetchChartData(); // Refresh chart when done
          }
        } catch (e) {
          console.error("Failed to fetch sync status", e);
        }
      }, 2000);
    }
    
    return () => clearInterval(interval);
  }, [syncStatus?.status]);

  const handleRecalculate = async () => {
    try {
      await portfolioService.recalculateHistory();
      setSyncStatus({ status: 'processing', progress: 0, total: 100, message: 'Iniciando...' });
    } catch (e) {
      console.error("Failed to start sync", e);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const variation = payload[0].payload.month_variation;
      const marketValue = payload[0].payload.total_market_value;
      const isProfit = variation >= 0;
      const assetPerformance = payload[0].payload.asset_performance;

      return (
        <div className="bg-white/95 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 p-3 rounded-xl shadow-xl shadow-slate-900/10 dark:shadow-black/40 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2 border-b border-slate-200/50 dark:border-slate-800/80 pb-2">
            <div className={`w-2 h-2 rounded-full shadow-[0_0_6px_rgba(0,0,0,0.5)] ${isProfit ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-rose-500 shadow-rose-500/50'}`}></div>
            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-tight">{label}</p>
          </div>
          
          <div className="flex flex-col gap-1.5 text-xs mb-3">
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Oscilação:</span>
              <span className={`font-bold ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {variation > 0 ? '+' : ''}{formatMoney(variation)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-6">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Patrimônio:</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {formatMoney(marketValue)}
              </span>
            </div>
          </div>
          
          {assetPerformance && (assetPerformance.gainers?.length > 0 || assetPerformance.losers?.length > 0) && (
            <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-slate-200/50 dark:border-slate-800/80">
              {assetPerformance.gainers?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold text-emerald-600/70 dark:text-emerald-500/70 uppercase tracking-widest mb-1 block">Maiores Altas</span>
                  <div className="flex flex-col gap-1">
                    {assetPerformance.gainers.map((g: any) => (
                      <div key={g.ticker} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">{g.ticker}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-1 py-0.5 rounded">+{formatMoney(g.variation)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assetPerformance.losers?.length > 0 && (
                <div>
                  <span className="text-[9px] font-bold text-rose-600/70 dark:text-rose-500/70 uppercase tracking-widest mb-1 block mt-2">Maiores Baixas</span>
                  <div className="flex flex-col gap-1">
                    {assetPerformance.losers.map((l: any) => (
                      <div key={l.ticker} className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">{l.ticker}</span>
                        <span className="text-rose-600 dark:text-rose-400 font-semibold bg-rose-500/10 px-1 py-0.5 rounded">{formatMoney(l.variation)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm relative overflow-hidden">
      
      {/* Sincronização Overlay */}
      {syncStatus?.status === 'processing' && (
        <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
          <h3 className="text-xl font-bold mb-2">Recalculando Histórico</h3>
          <p className="text-slate-300 mb-4">{syncStatus.message}</p>
          
          <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.max(5, (syncStatus.progress / (syncStatus.total || 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Variação Patrimonial Mensal</h3>
          <p className="text-sm text-slate-500">Oscilação (Capital Appreciation) gerada pelas cotações de mercado a cada mês.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border-none text-sm font-medium text-slate-700 dark:text-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
          >
            <option value="all">Todo o Histórico</option>
            {Array.from(new Set(data.map(d => d.period.split('/')[1]))).sort((a, b) => b.localeCompare(a)).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={handleRecalculate}
            disabled={syncStatus?.status === 'processing'}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            title="Viaja no tempo recalculando todos os fechamentos diários e mensais até hoje."
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sincronizar Histórico</span>
          </button>
        </div>
      </div>

      <div className="h-80 w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">Sem dados de lucro/prejuízo no período.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={selectedYear === 'all' ? data : data.filter(d => d.period.endsWith(selectedYear))}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
              <XAxis 
                dataKey="period" 
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis 
                width={80}
                tickFormatter={(value) => `R$ ${value}`}
                tick={{ fill: '#64748b', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="month_variation" radius={[4, 4, 4, 4]}>
                {(selectedYear === 'all' ? data : data.filter(d => d.period.endsWith(selectedYear))).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={(entry.month_variation ?? 0) >= 0 ? '#10B981' : '#EF4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
