"use client";

import { useEffect, useState } from 'react';
import { portfolioService, MonthlyEvolutionData, SyncStatus } from '@/services/portfolio';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { SEMANTIC_CHART_HEX } from '@/lib/colors';
import { RefreshCw, Loader2 } from 'lucide-react';

export default function MonthlyPnLChart() {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const palette = useChartPalette();
  const [data, setData] = useState<MonthlyEvolutionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const fetchChartData = () => {
    setIsLoading(true);
    setErrorMsg(null);
    portfolioService.getMonthlyEvolution()
      .then(setData)
      .catch((e) => {
        console.error(e);
        setErrorMsg('Não foi possível carregar a variação patrimonial mensal.');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchChartData();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (syncStatus?.status === 'processing') {
      interval = setInterval(async () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        try {
          const status = await portfolioService.getHistorySyncStatus();
          setSyncStatus(status);
          if (status.status === 'idle' || status.status === 'success') {
            fetchChartData(); // Refresh chart when done
          }
        } catch (e) {
          console.error("Failed to fetch sync status", e);
          setErrorMsg('Erro ao verificar progresso da sincronização.');
          setSyncStatus(null);
        }
      }, 2000);
    }
    
    return () => clearInterval(interval);
  }, [syncStatus?.status]);

  const handleRecalculate = async () => {
    setErrorMsg(null);
    try {
      await portfolioService.recalculateHistory();
      setSyncStatus({ status: 'processing', progress: 0, total: 100, message: 'Iniciando...' });
    } catch (e) {
      console.error("Failed to start sync", e);
      setErrorMsg('Não foi possível iniciar a sincronização do histórico.');
    }
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { month_variation: number; total_market_value: number; asset_performance?: { gainers?: Array<{ ticker: string; variation: number }>; losers?: Array<{ ticker: string; variation: number }> } } }>; label?: string }) => {
    if (active && payload && payload.length) {
      const variation = payload[0].payload.month_variation;
      const marketValue = payload[0].payload.total_market_value;
      const isProfit = variation >= 0;
      const assetPerformance = payload[0].payload.asset_performance;
      const gainers = assetPerformance?.gainers ?? [];
      const losers = assetPerformance?.losers ?? [];

      return (
        <div className="bg-surface-elevated border border-border-subtle p-3 rounded-xl shadow-md min-w-[200px]">
          <div className="flex items-center gap-2 mb-2 border-b border-border-subtle pb-2">
            <div className={`w-2 h-2 rounded-full ${isProfit ? 'bg-status-success' : 'bg-status-error'}`}></div>
            <p className="font-semibold text-text-primary text-sm tracking-tight">{label}</p>
          </div>
          
          <div className="flex flex-col gap-1.5 text-xs mb-3">
            <div className="flex justify-between items-center gap-4">
              <span className="text-text-muted font-medium">Oscilação:</span>
              <span className={`font-semibold tabular-nums ${isProfit ? 'text-status-success' : 'text-status-error'}`}>
                {isHidden ? 'R$ •••••' : `${variation > 0 ? '+' : ''}${formatMoney(variation)}`}
              </span>
            </div>
            <div className="flex justify-between items-center gap-6">
              <span className="text-text-muted font-medium">Patrimônio:</span>
              <span className="font-semibold text-text-primary tabular-nums">
                {isHidden ? 'R$ •••••' : formatMoney(marketValue)}
              </span>
            </div>
          </div>
          
          {(gainers.length > 0 || losers.length > 0) && (
            <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-border-subtle">
              {gainers.length > 0 && (
                <div>
                  <span className="text-2xs font-semibold text-status-success uppercase tracking-wider mb-1 block">Maiores Altas</span>
                  <div className="flex flex-col gap-1">
                    {gainers.map((g) => (
                      <div key={g.ticker} className="flex justify-between items-center text-2xs">
                        <span className="text-text-primary font-medium">{g.ticker}</span>
                        <span className="text-status-success font-semibold bg-status-success/10 px-1 py-0.5 rounded-md tabular-nums">{isHidden ? 'R$ •••••' : `+${formatMoney(g.variation)}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {losers.length > 0 && (
                <div>
                  <span className="text-2xs font-semibold text-status-error uppercase tracking-wider mb-1 block mt-2">Maiores Baixas</span>
                  <div className="flex flex-col gap-1">
                    {losers.map((l) => (
                      <div key={l.ticker} className="flex justify-between items-center text-2xs">
                        <span className="text-text-primary font-medium">{l.ticker}</span>
                        <span className="text-status-error font-semibold bg-status-error/10 px-1 py-0.5 rounded-md tabular-nums">{isHidden ? 'R$ •••••' : formatMoney(l.variation)}</span>
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
    <div className="bg-surface-card border border-border-subtle rounded-xl p-6 shadow-sm relative overflow-hidden">
      
      {/* Sincronização Overlay */}
      {syncStatus?.status === 'processing' && (
        <div className="absolute inset-0 z-10 bg-surface/85 backdrop-blur-sm flex flex-col items-center justify-center text-text-primary">
          <Loader2 className="w-10 h-10 animate-spin text-accent mb-4" />
          <h3 className="text-xl font-semibold mb-2">Recalculando Histórico</h3>
          <p className="text-text-muted mb-4 tabular-nums">{syncStatus.message}</p>
          
          <div className="w-64 h-2 bg-surface-input rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.max(5, (syncStatus.progress / (syncStatus.total || 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Variação Patrimonial Mensal</h3>
          <p className="text-sm text-text-muted">Oscilação (Capital Appreciation) gerada pelas cotações de mercado a cada mês.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-surface-input border border-border-subtle text-sm font-medium text-text-primary rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-accent/40 cursor-pointer tabular-nums"
          >
            <option value="all">Todo o Histórico</option>
            {Array.from(new Set(data.map(d => d.period.split('/')[1]))).sort((a, b) => b.localeCompare(a)).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={handleRecalculate}
            disabled={syncStatus?.status === 'processing'}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-surface-input hover:bg-surface-elevated border border-border-subtle text-text-primary rounded-lg transition-colors"
            title="Viaja no tempo recalculando todos os fechamentos diários e mensais até hoje."
          >
            <RefreshCw className="w-4 h-4" />
            <span>Sincronizar Histórico</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-2.5 text-sm text-status-error">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={fetchChartData}
            className="text-xs font-semibold underline hover:opacity-80"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="h-80 w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-text-muted">Sem dados de lucro/prejuízo no período.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={selectedYear === 'all' ? data : data.filter(d => d.period.endsWith(selectedYear))}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis 
                dataKey="period" 
                tick={{ fill: palette.axis, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis 
                width={80}
                tickFormatter={(value) => isHidden ? '••••' : `R$ ${value}`}
                tick={{ fill: palette.axis, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar dataKey="month_variation" radius={[4, 4, 4, 4]} animationDuration={280}>
                {(selectedYear === 'all' ? data : data.filter(d => d.period.endsWith(selectedYear))).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={(entry.month_variation ?? 0) >= 0 ? SEMANTIC_CHART_HEX.emerald : SEMANTIC_CHART_HEX.rose} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
