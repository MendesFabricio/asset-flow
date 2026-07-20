import { DollarSign } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { TooltipState } from '@/hooks/useFloatingTooltip';
import { FinanceTooltipData } from './types';

export function FinanceTooltip({ rect, data: { valor, isPositive } }: TooltipState<FinanceTooltipData>) {
  return (
    <div
      className="fixed z-[110] animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
      style={{ top: rect.top - 50, left: rect.right - 20 }}
    >
      <div className="relative overflow-hidden bg-slate-900/95 backdrop-blur-xl rounded-lg border border-slate-700/50 shadow-2xl min-w-[140px]">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <div className="pl-3 pr-3 py-2">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <DollarSign size={10} /> Variação Hoje
            </span>
            <span className={`text-sm font-mono font-bold tracking-tight leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? '+' : '-'}{formatMoney(Math.abs(valor))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
