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
  const hasDivReturn =
    (ativo.dividendos_recebidos ?? 0) > 0 &&
    ativo.total_return_pct !== undefined &&
    ativo.total_return_valor !== undefined;
  const totalReturnPos = (ativo.total_return_valor ?? 0) >= 0;

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
        {hasDivReturn && (
          <span
            title={
              isHidden
                ? 'Retorno Total (Valorização + Dividendos)'
                : `Retorno Total com dividendos: ${totalReturnPos ? '+' : ''}${formatMoney(ativo.total_return_valor ?? 0)}`
            }
          >
            <PrivateValue
              value={`c/ Div.: ${totalReturnPos ? '+' : ''}${(ativo.total_return_pct ?? 0).toFixed(2)}%`}
              className={`text-[10px] tabular-nums ${totalReturnPos ? 'text-emerald-400/90' : 'text-rose-400/90'}`}
            />
          </span>
        )}
      </div>
    </td>
  );
});
