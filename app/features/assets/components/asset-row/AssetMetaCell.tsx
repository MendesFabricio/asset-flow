import { memo } from 'react';
import { Asset } from '@/types';
import { AssetRowStats } from './useAssetRowStats';

interface AssetMetaCellProps {
  ativo: Asset;
  stats: AssetRowStats;
}

export const AssetMetaCell = memo(function AssetMetaCell({ ativo, stats }: AssetMetaCellProps) {
  return (
    <td className="px-6 py-5 text-right w-36 hidden md:table-cell">
      <div className="flex justify-between text-2xs mb-2 px-0.5 font-mono leading-none">
        <span className={`font-semibold tabular-nums ${stats.isOverweight ? 'text-status-warning' : 'text-accent'}`}>
          {ativo.pct_na_categoria.toFixed(1)}%
        </span>
        <span className="text-text-muted font-semibold uppercase tracking-tighter">
          meta <span className="tabular-nums text-text-muted">{ativo.meta}%</span>
        </span>
      </div>
      <div className="h-2.5 w-full bg-surface-input border border-border-subtle rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full opacity-90 transition-[width] duration-300 ${
            stats.isOverweight ? 'bg-status-warning' : 'bg-accent'
          }`}
          style={{ width: `${stats.barraWidth}%` }}
        ></div>
      </div>
    </td>
  );
});
