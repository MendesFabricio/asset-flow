import { memo } from 'react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';

export const AssetValueCell = memo(function AssetValueCell({ ativo }: { ativo: Asset }) {
  return (
    <td className="px-6 py-5 text-right">
      <div className="flex flex-col items-end">
        <PrivateValue value={formatMoney(ativo.total_atual)} className="text-slate-200 font-bold tabular-nums" />
        <PrivateValue
          value={`Investido: ${formatMoney(ativo.total_investido)}`}
          className="text-[10px] text-slate-500 tabular-nums"
        />
      </div>
    </td>
  );
});
