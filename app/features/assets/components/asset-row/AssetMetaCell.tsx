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
      <div className="flex justify-between text-[10px] mb-2 px-0.5 font-mono leading-none">
        <span className={`font-bold tabular-nums ${stats.isOverweight ? 'text-yellow-400' : 'text-blue-300'}`}>
          {ativo.pct_na_categoria.toFixed(1)}%
        </span>
        <span className="text-slate-600 font-bold uppercase tracking-tighter">
          meta <span className="tabular-nums text-slate-500">{ativo.meta}%</span>
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-900/80 border border-slate-800/60 shadow-inner rounded-full overflow-hidden relative p-[1px]">
        <div
          className={`h-full rounded-full opacity-90 transition-all duration-1000 ease-out shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] ${
            stats.isOverweight ? 'bg-yellow-500' : 'bg-blue-600'
          }`}
          style={{ width: `${stats.barraWidth}%` }}
        ></div>
      </div>
    </td>
  );
});
