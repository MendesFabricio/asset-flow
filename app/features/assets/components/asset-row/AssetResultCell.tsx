import { memo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';

interface AssetResultCellProps {
  ativo: Asset;
  isHidden: boolean;
}

export const AssetResultCell = memo(function AssetResultCell({ ativo, isHidden }: AssetResultCellProps) {
  const lucroPositivo = ativo.lucro_valor >= 0;

  return (
    <td className="px-6 py-5 text-right">
      <div className="flex flex-col items-end">
        <PrivateValue
          value={(lucroPositivo ? '+' : '') + formatMoney(ativo.lucro_valor)}
          className={`font-bold font-mono tabular-nums ${lucroPositivo ? 'text-emerald-400' : 'text-rose-400'}`}
        />
        <div className={`text-[10px] flex items-center gap-1 ${lucroPositivo ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
          <PrivateValue
            value={`${lucroPositivo ? '+' : ''}${ativo.lucro_pct.toFixed(2)}%`}
            className="pct tabular-nums"
          />
          {!isHidden && (lucroPositivo ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
        </div>
      </div>
    </td>
  );
});
