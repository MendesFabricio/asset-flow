'use client';

import { Activity, Info, ShieldAlert, Zap } from 'lucide-react';
import { RiskMetrics } from './types';

interface RiskExposureAndCreditTabsProps {
  activeSubTab: 'exposure' | 'credit';
  data: RiskMetrics;
  money: (val: number) => string;
}

export function RiskExposureAndCreditTabs({ activeSubTab, data, money }: RiskExposureAndCreditTabsProps) {
  if (activeSubTab === 'exposure') {
    return (
      <div className="pt-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.usd_exposure_pct !== undefined && (
            <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border-subtle flex flex-col gap-2 h-full">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
                  <Zap size={12} className="text-status-warning" />
                  Hedge Ratio Cambial
                  <span className="relative group/tt inline-flex items-center cursor-help normal-case">
                    <Info size={12} className="text-text-muted hover:text-status-warning transition-colors" />
                    <span className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-60 p-2 bg-surface-card text-text-primary text-[10px] font-normal rounded-lg shadow-xl border border-border-subtle z-50 leading-relaxed">
                      Percentual da carteira protegido em dólar/moeda forte. Manter entre 15% e 30% ajuda a proteger o patrimônio em quedas locais.
                    </span>
                  </span>
                </h4>
                <span className="text-[10px] font-black font-mono text-status-warning bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {data.usd_exposure_pct}% USD
                </span>
              </div>
              {data.usd_assets && data.usd_assets.length > 0 && (
                <div className="space-y-1 mt-1">
                  {data.usd_assets.map((a, i) => (
                    <div key={i} className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-text-primary">{a.ticker}</span>
                      <span className="text-text-muted">{money(a.value)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-text-muted mt-auto leading-relaxed border-t border-border-subtle pt-2">
                {data.usd_hedge_suggestion}
              </p>
            </div>
          )}

        {data.upside_capture_pct !== undefined && (
          <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border-subtle h-full flex flex-col">
            <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Activity size={12} className="text-status-success" />
              Capture Ratio vs IBOV
              <span className="relative group/tt inline-flex items-center cursor-help normal-case">
                <Info size={12} className="text-text-muted hover:text-status-success transition-colors" />
                <span className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-60 p-2 bg-surface-card text-text-primary text-[10px] font-normal rounded-lg shadow-xl border border-border-subtle z-50 leading-relaxed">
                  Mede quanto sua carteira acompanha o IBOV na alta (Upside) vs. na queda (Downside). Cenário saudável: Upside maior que Downside.
                </span>
              </span>
            </h4>
            <div className="grid grid-cols-2 gap-3 text-center flex-1">
              <div className="bg-surface-card p-3 rounded-lg border border-border-subtle h-full">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wide">Upside Capture</span>
                <div className="text-xl font-bold font-mono text-status-success mt-1">{data.upside_capture_pct}%</div>
                <p className="text-[8px] text-text-muted mt-1 leading-normal">Fração capturada em meses de alta do IBOV</p>
              </div>
              <div className="bg-surface-card p-3 rounded-lg border border-border-subtle">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wide">Downside Capture</span>
                <div className="text-xl font-bold font-mono text-status-error mt-1">{data.downside_capture_pct}%</div>
                <p className="text-[8px] text-text-muted mt-1 leading-normal">Fração capturada em meses de queda do IBOV</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return data.fii_credit_map && data.fii_credit_map.length > 0 ? (
    <div className="bg-surface-elevated/40 p-4 rounded-xl border border-border-subtle h-full mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-indigo-400" />
          Mapa de Risco de Crédito &amp; Saúde (FIIs &amp; Renda Fixa)
          <span className="relative group/tt inline-flex items-center cursor-help normal-case">
            <Info size={12} className="text-text-muted hover:text-indigo-400 transition-colors" />
            <span className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-card text-text-primary text-[10px] font-normal rounded-lg shadow-xl border border-border-subtle z-50 leading-relaxed">
              Monitora P/VP, alavancagem, caixa, prazo e indexadores. Use para evitar FIIs muito alavancados ou com pouco caixa e priorizar os negociados com desconto.
            </span>
          </span>
        </h4>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-[10px] text-text-secondary uppercase tracking-wider font-semibold text-left border-collapse">
          <thead>
            <tr className="border-b border-border-subtle pb-1 text-text-muted">
              <th className="py-1.5">Ativo</th>
              <th className="py-1.5 text-right">P/VP</th>
              <th className="py-1.5 text-right">Alavancagem</th>
              <th className="py-1.5 text-right">Caixa (% PL)</th>
              <th className="py-1.5 text-right">Prazo</th>
              <th className="py-1.5 text-right">Indexadores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.fii_credit_map.map((f, i) => (
              <tr key={i} className="hover:bg-surface-elevated/60">
                <td className="py-2 text-text-primary font-mono font-bold">
                  <span>{f.ticker}</span>
                  {f.category && (
                    <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded bg-surface-card border border-border-subtle text-text-muted">
                      {f.category}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-mono text-text-primary">{f.p_vp || '—'}</td>
                <td className="py-2 text-right font-mono text-status-warning">{f.alavancagem || '—'}</td>
                <td className="py-2 text-right font-mono text-status-success">{f.caixa_pct || '—'}</td>
                <td className="py-2 text-right font-mono text-indigo-400">
                  {f.duration !== null && f.duration !== undefined && f.duration > 0 ? `${f.duration}a` : 'N/D'}
                </td>
                <td className="py-2 text-right font-mono text-[9px] text-text-muted">
                  {Object.keys(f.indexers).length > 0
                    ? Object.entries(f.indexers)
                        .map(([k, v]) => `${k}:${v}%`)
                        .join(' | ')
                    : 'N/D'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center py-10 text-text-muted bg-surface-elevated/20 rounded-xl border border-dashed border-border-subtle mt-2">
      <ShieldAlert size={32} className="mb-3 opacity-40" />
      <p className="text-sm font-semibold text-text-secondary">Sem FIIs ou Renda Fixa</p>
      <p className="text-xs text-text-muted mt-1 text-center max-w-sm">
        Esta aba monitora o risco de crédito e prazo de vencimento de suas posições em Renda Fixa e FIIs de Papel.
      </p>
    </div>
  );
}
