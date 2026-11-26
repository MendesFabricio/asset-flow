'use client';

import React, { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Compass,
  HelpCircle,
  Info,
  TrendingUp,
} from 'lucide-react';
import { CorrelationSkeleton, MetricsGridSkeleton } from '@/components/ui/Skeletons';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatMoney } from '@/lib/format';
import { MomentumRankingItem, SectorExposureData } from '../../hooks/useQuantData';

const RiskMetricsPanel = dynamic(() => import('../RiskMetricsPanel').then((mod) => mod.RiskMetricsPanel), {
  ssr: false,
  loading: () => <MetricsGridSkeleton />,
});
const CorrelationHeatmap = dynamic(() => import('../CorrelationHeatmap').then((mod) => mod.CorrelationHeatmap), {
  ssr: false,
  loading: () => <CorrelationSkeleton />,
});

interface QuantPerformanceTabProps {
  loading: boolean;
  momentumData: MomentumRankingItem[];
  exposureData: SectorExposureData | null;
}

export function QuantPerformanceTab({
  loading,
  momentumData,
  exposureData,
}: QuantPerformanceTabProps) {
  const { isHidden } = usePrivacy();
  const [showCorrelation, setShowCorrelation] = useState(false);

  const sectorExposureRows = useMemo(() => {
    if (!exposureData) return { rows: [], total: 0, maxPct: 0 };
    const raw = Object.entries(exposureData)
      .map(([sector, tickers]) => {
        const entries = Object.entries(tickers || {}).sort((a, b) => b[1] - a[1]);
        const sectorTotal = entries.reduce((acc, [, v]) => acc + (Number(v) || 0), 0);
        return { sector, sectorTotal, tickers: entries };
      })
      .filter((r) => r.sectorTotal > 0);
    const grandTotal = raw.reduce((acc, r) => acc + r.sectorTotal, 0);
    const rows = raw
      .sort((a, b) => b.sectorTotal - a.sectorTotal)
      .map((r) => ({ ...r, pct: grandTotal > 0 ? (r.sectorTotal / grandTotal) * 100 : 0 }));
    return { rows, total: grandTotal, maxPct: rows[0]?.pct ?? 0 };
  }, [exposureData]);

  return (
    <div className="animate-in fade-in w-full flex flex-col gap-6">
      <RiskMetricsPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-status-success">
                <TrendingUp size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  Top Momentum Ranking
                  <span className="relative group/tt inline-flex items-center cursor-help">
                    <Info size={13} className="text-text-muted hover:text-emerald-400 transition-colors" />
                    <span className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2.5 bg-surface-elevated text-text-primary text-[11px] font-normal rounded-lg shadow-xl border border-border-subtle z-50 leading-relaxed">
                      Mede a força de tendência dos últimos 12 meses (excluindo o último mês). Use para confirmar ativos em tendência saudável e evitar concentrar novos aportes no que já esticou além da meta.
                    </span>
                  </span>
                </h3>
                <p className="text-[11px] text-text-secondary">Ativos com mais força nos últimos 12M</p>
              </div>
            </div>
            {momentumData.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary">
                Top {Math.min(8, momentumData.length)} / {momentumData.length}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-text-secondary">Calculando ranking de momentum...</div>
          ) : momentumData.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-secondary">Dados insuficientes de cotações em renda variável.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-text-secondary text-[11px]">
                    <th className="text-left py-1.5 font-medium w-10">#</th>
                    <th className="text-left py-1.5 font-medium">Ativo</th>
                    <th className="text-right py-1.5 font-medium">Força 12M</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50">
                  {momentumData.slice(0, 8).map((item) => {
                    const pos = item.momentum_score_pct >= 0;
                    return (
                      <tr key={item.ticker} className="hover:bg-surface/60 transition-colors">
                        <td className="py-2 font-mono text-text-secondary">#{item.rank}</td>
                        <td className="py-2 font-bold text-text-primary">{item.ticker}</td>
                        <td className="py-2 text-right font-mono font-semibold">
                          <span className={`inline-block px-2 py-0.5 rounded ${pos ? 'bg-emerald-500/10 text-status-success' : 'bg-rose-500/10 text-status-error'}`}>
                            {pos ? '+' : ''}{item.momentum_score_pct.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
                <Compass size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  Exposição Setorial &amp; Concentração
                  <span className="relative group/tt inline-flex items-center cursor-help">
                    <Info size={13} className="text-text-muted hover:text-indigo-400 transition-colors" />
                    <span className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2.5 bg-surface-elevated text-text-primary text-[11px] font-normal rounded-lg shadow-xl border border-border-subtle z-50 leading-relaxed">
                      Mostra o peso real de cada setor econômico na carteira. Se algum setor passar de 30%, direcione seus próximos aportes para setores com menor participação.
                    </span>
                  </span>
                </h3>
                <p className="text-[11px] text-text-secondary">Distribuição patrimonial por setor econômico</p>
              </div>
            </div>
            {sectorExposureRows.rows.length > 0 && (
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  sectorExposureRows.maxPct > 30
                    ? 'bg-amber-500/10 border-amber-500/30 text-status-warning'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-status-success'
                }`}
              >
                {sectorExposureRows.maxPct > 30 ? 'Concentração (>30%)' : 'Diversificada'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-text-secondary">Analisando exposição setorial...</div>
          ) : sectorExposureRows.rows.length === 0 ? (
            <div className="py-10 text-center text-xs text-text-secondary">Sem posições ativas para calcular exposição setorial.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {sectorExposureRows.rows.map((sec) => {
                const over = sec.pct > 30;
                const topTickers = sec.tickers.slice(0, 4).map(([t]) => t).join(', ');
                const moreCount = sec.tickers.length > 4 ? ` +${sec.tickers.length - 4}` : '';
                return (
                  <div key={sec.sector} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-semibold text-text-primary truncate">{sec.sector}</span>
                      <div className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="text-text-secondary">{isHidden ? 'R$ •••••' : formatMoney(sec.sectorTotal)}</span>
                        <span className={`font-bold ${over ? 'text-status-warning' : 'text-sky-400'}`}>{sec.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface overflow-hidden">
                      <div className={`h-full rounded-full ${over ? 'bg-amber-400' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, Math.max(2, sec.pct))}%` }} />
                    </div>
                    <p className="text-[10px] text-text-secondary truncate">{topTickers}{moreCount}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowCorrelation(!showCorrelation)}
          className="flex items-center justify-between p-4 bg-surface-card hover:bg-surface-elevated rounded-xl border border-border-subtle transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20 text-purple-400 group-hover:scale-110 transition-transform">
              <Activity size={18} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-text-primary text-sm tracking-wider flex items-center gap-2">
                Diversificação de Risco (Correlação)
                <HelpCircle size={14} className="text-text-muted" />
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Descubra se seus ativos tendem a cair todos juntos em uma crise.</p>
            </div>
          </div>
          {showCorrelation ? <ChevronUp size={20} className="text-text-muted" /> : <ChevronDown size={20} className="text-text-muted" />}
        </button>
        {showCorrelation && (
          <div className="animate-in slide-in-from-top-2 fade-in duration-200">
            <CorrelationHeatmap />
          </div>
        )}
      </div>
    </div>
  );
}
