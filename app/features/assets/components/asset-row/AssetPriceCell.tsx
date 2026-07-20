import { MouseEvent } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { AssetRowStats } from './useAssetRowStats';

interface AssetPriceCellProps {
  stats: AssetRowStats;
  onShowFin: (e: MouseEvent) => void;
  onHide: () => void;
}

export function AssetPriceCell({ stats, onShowFin, onHide }: AssetPriceCellProps) {
  const varValue = Number(stats.variacaoIntraday) || 0;
  const isZero = varValue === 0;
  const showVar = !isNaN(varValue);

  return (
    <td className="px-6 py-5 text-right hidden sm:table-cell">
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-2 justify-end">
          {showVar && (
            <div
              className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all hover:scale-105 tabular-nums ${
                isZero ? 'text-slate-400 bg-slate-800/60' : stats.isPositiveIntraday ? 'text-emerald-400 bg-emerald-400/20' : 'text-rose-400 bg-rose-400/20'
              }`}
              onMouseEnter={onShowFin}
              onMouseLeave={onHide}
            >
              {isZero ? (
                <Minus size={12} strokeWidth={3} />
              ) : stats.isPositiveIntraday ? (
                <TrendingUp size={12} strokeWidth={3} />
              ) : (
                <TrendingDown size={12} strokeWidth={3} />
              )}
              <span className="tabular-nums">
                {!isZero && stats.isPositiveIntraday ? '+' : ''}
                {varValue.toFixed(2)}%
              </span>
            </div>
          )}
          <PrivateValue value={stats.displayPrice} className="text-slate-300 font-mono text-sm tabular-nums" />
        </div>
        <PrivateValue value={`PM: ${stats.displayPM}`} className="text-[10px] text-slate-600 tabular-nums" />
      </div>
    </td>
  );
}
