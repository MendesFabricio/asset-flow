import { memo } from 'react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';

export const AssetValueCell = memo(function AssetValueCell({ ativo }: { ativo: Asset }) {
  return (
    <td className="px-6 py-5 text-right">
      <div className="flex flex-col items-end">
        <PrivateValue value={formatMoney(ativo.total_atual)} className="text-text-primary font-semibold tabular-nums" />
        <PrivateValue
          value={`Investido: ${formatMoney(ativo.total_investido)}`}
          className="text-2xs text-text-muted tabular-nums"
        />
      </div>
    </td>
  );
});
