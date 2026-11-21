import { PieChart, AlertTriangle, TrendingUp, Ban, CheckCircle2 } from 'lucide-react';
import { TooltipState } from '@/hooks/useFloatingTooltip';
import { MetaTooltipData } from './types';

export function MetaAnalysisTooltip({ rect, data }: TooltipState<MetaTooltipData>) {
  return (
    <div
      className="fixed z-[100] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
      style={{ top: rect.top - 10, left: rect.right + 10 }}
    >
      <div className="bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl rounded-xl p-4 w-64 ring-1 ring-black/50">
        <div className="flex justify-between items-start mb-3">
          <h4 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2">
            <PieChart size={14} className="text-blue-400" />
            Análise de {data.item.tipo}
          </h4>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${data.meta === 0 ? 'bg-slate-800 border-slate-600 text-slate-400' : data.diff > 2 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : data.diff < -2 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
            {data.meta === 0 ? 'Sem Meta' : data.diff > 2 ? 'Excesso' : data.diff < -2 ? 'Aporte' : 'Neutro'}
          </span>
        </div>

        <div className="space-y-2">
          {data.meta === 0 ? (
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5"><AlertTriangle size={14} className="text-slate-500" /></div>
              <div><p className="text-xs font-bold text-slate-300">Meta não definida</p></div>
            </div>
          ) : (
            <>
              {data.diff > 2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><Ban size={14} className="text-amber-500" /></div>
                  <div>
                    <p className="text-xs font-bold text-amber-400">Acima da Meta (+{data.diff.toFixed(1)}%)</p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Evite novos aportes ou considere rebalancear.</p>
                  </div>
                </div>
              )}
              {data.diff < -2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><TrendingUp size={14} className="text-emerald-500" /></div>
                  <div>
                    <p className="text-xs font-bold text-emerald-400">Abaixo da Meta ({data.diff.toFixed(1)}%)</p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Oportunidade para novos aportes.</p>
                  </div>
                </div>
              )}
              {Math.abs(data.diff) <= 2 && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5"><CheckCircle2 size={14} className="text-blue-500" /></div>
                  <div>
                    <p className="text-xs font-bold text-blue-400">Dentro da Meta</p>
                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Alocação equilibrada.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {data.meta > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="flex justify-between text-[9px] text-slate-500 font-bold uppercase mb-1">
              <span>Conclusão da Meta</span>
              <span>{data.visualWidth.toFixed(0)}%</span>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${data.diff > 2 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(data.visualWidth, 100)}%` }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
