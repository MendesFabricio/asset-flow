import { PieChart, AlertTriangle, TrendingUp, Ban, CheckCircle2 } from 'lucide-react';
import { TooltipState } from '@/hooks/useFloatingTooltip';
import { MetaTooltipData } from './types';

export function MetaAnalysisTooltip({ rect, data }: TooltipState<MetaTooltipData>) {
  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ top: rect.top - 10, left: rect.right + 10 }}
    >
      <div className="bg-surface-card border border-border-subtle shadow-lg rounded-xl p-4 w-64">
        <div className="flex justify-between items-start mb-3">
          <h4 className="text-sm font-semibold text-text-primary uppercase tracking-tight flex items-center gap-2">
            <PieChart size={14} className="text-accent" />
            Análise de {data.item.tipo}
          </h4>
          <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-md uppercase border ${data.meta === 0 ? 'bg-surface-input border-border-subtle text-text-muted' : data.diff > 2 ? 'bg-status-warning/10 border-status-warning/30 text-status-warning' : data.diff < -2 ? 'bg-status-success/10 border-status-success/30 text-status-success' : 'bg-accent-soft border-accent/30 text-accent'}`}>
            {data.meta === 0 ? 'Sem Meta' : data.diff > 2 ? 'Excesso' : data.diff < -2 ? 'Aporte' : 'Neutro'}
          </span>
        </div>

        <div className="space-y-2">
          {data.meta === 0 ? (
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5"><AlertTriangle size={14} className="text-text-muted" /></div>
              <div><p className="text-xs font-semibold text-text-primary">Meta não definida</p></div>
            </div>
          ) : (
            <>
              {data.diff > 2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><Ban size={14} className="text-status-warning" /></div>
                  <div>
                    <p className="text-xs font-semibold text-status-warning tabular-nums">Acima da Meta (+{data.diff.toFixed(1)}%)</p>
                    <p className="text-2xs text-text-muted leading-tight mt-0.5">Evite novos aportes ou considere rebalancear.</p>
                  </div>
                </div>
              )}
              {data.diff < -2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><TrendingUp size={14} className="text-status-success" /></div>
                  <div>
                    <p className="text-xs font-semibold text-status-success tabular-nums">Abaixo da Meta ({data.diff.toFixed(1)}%)</p>
                    <p className="text-2xs text-text-muted leading-tight mt-0.5">Oportunidade para novos aportes.</p>
                  </div>
                </div>
              )}
              {Math.abs(data.diff) <= 2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><CheckCircle2 size={14} className="text-accent" /></div>
                  <div>
                    <p className="text-xs font-semibold text-accent">Dentro da Meta</p>
                    <p className="text-2xs text-text-muted leading-tight mt-0.5">Alocação equilibrada.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {data.meta > 0 && (
          <div className="mt-3 pt-3 border-t border-border-subtle">
            <div className="flex justify-between text-2xs text-text-muted font-semibold uppercase mb-1 tabular-nums">
              <span>Conclusão da Meta</span>
              <span>{data.visualWidth.toFixed(0)}%</span>
            </div>
            <div className="h-1 bg-surface-input rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${data.diff > 2 ? 'bg-status-warning' : 'bg-accent'}`} style={{ width: `${Math.min(data.visualWidth, 100)}%` }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
