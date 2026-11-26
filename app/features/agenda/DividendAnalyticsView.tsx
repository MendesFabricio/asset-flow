'use client';

import { Award } from 'lucide-react';
import { AnalyticsItem } from './types';

export function DividendAnalyticsView({ analytics }: { analytics: AnalyticsItem[] }) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 backdrop-blur-md overflow-hidden">
      <div className="flex items-center gap-2 mb-6">
        <Award className="text-indigo-400" size={16} />
        <h2 className="text-base font-bold text-text-primary">Análise de Rendimento &amp; Consistência</h2>
      </div>

      <div className="overflow-x-auto w-full border border-border-subtle rounded-xl">
        <table className="w-full text-xs text-left border-collapse bg-surface">
          <thead className="bg-surface-elevated text-text-muted font-bold border-b border-border-subtle">
            <tr>
              <th className="p-3">Ativo</th>
              <th className="p-3 text-right">DY Forward Est.</th>
              <th className="p-3 text-right">Payout Histórico</th>
              <th className="p-3 text-right">Regularidade (Trimestres)</th>
              <th className="p-3 text-right">Score de Consistência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle text-text-secondary">
            {analytics.map((row) => (
              <tr key={row.ticker} className="hover:bg-surface-elevated/60">
                <td className="p-3 font-bold text-text-primary">{row.ticker}</td>
                <td className="p-3 text-right text-status-success font-mono font-bold">{row.dy_forward.toFixed(2)}%</td>
                <td className="p-3 text-right font-mono">
                  {row.payout_historico !== null ? `${row.payout_historico.toFixed(1)}%` : '--'}
                </td>
                <td className="p-3 text-right text-text-muted font-mono">{row.num_quarters}T</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        row.regularidade_score >= 80
                          ? 'bg-emerald-500/10 text-status-success'
                          : row.regularidade_score >= 40
                            ? 'bg-amber-500/10 text-status-warning'
                            : 'bg-red-500/10 text-status-error'
                      }`}
                    >
                      {row.regularidade_score} / 100
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
