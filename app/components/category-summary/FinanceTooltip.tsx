import { DollarSign } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { TooltipState } from '@/hooks/useFloatingTooltip';
import { FinanceTooltipData } from './types';

export function FinanceTooltip({ rect, data: { valor, isPositive } }: TooltipState<FinanceTooltipData>) {
  const { isHidden } = usePrivacy();
  const displayValue = isHidden ? 'R$ •••••' : formatMoney(Math.abs(valor));
  return (
    <div
      className="fixed z-[110] pointer-events-none"
      style={{ top: rect.top - 50, left: rect.right - 20 }}
    >
      <div className="relative overflow-hidden bg-surface-card rounded-xl border border-border-subtle shadow-lg min-w-[140px]">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPositive ? 'bg-status-success' : 'bg-status-error'}`} />
        <div className="pl-3 pr-3 py-2">
          <div className="flex flex-col">
            <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-0.5 flex items-center gap-1">
              <DollarSign size={10} /> Variação Hoje
            </span>
            <span className={`text-sm font-mono font-semibold tabular-nums tracking-tight leading-none ${isPositive ? 'text-status-success' : 'text-status-error'}`}>
              {isPositive ? '+' : '-'}{displayValue}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
