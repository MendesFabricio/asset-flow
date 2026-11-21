import { memo } from 'react';
import { Snowflake } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';

interface AssetIndicatorsCellProps {
  ativo: Asset;
  tab: string;
}

export const AssetIndicatorsCell = memo(function AssetIndicatorsCell({ ativo, tab }: AssetIndicatorsCellProps) {
  const magicNumber = ativo.magic_number || 0;
  const atingiuMagic = magicNumber > 0 && ativo.qtd >= magicNumber;

  return (
    <td className="px-6 py-5 text-center hidden lg:table-cell w-32 align-middle">
      {tab === 'FII' ? (
        <div className="flex flex-col gap-1.5 items-end w-full">
          {(ativo.p_vp || 0) > 0 && (
            <div
              title="P/VP (Preço sobre Valor Patrimonial): Mede o preço do ativo em relação ao seu valor patrimonial. < 1.0 indica desconto."
              className="text-2xs font-mono flex items-center justify-between gap-2 w-24 px-2 py-0.5 rounded-md border border-border-subtle bg-surface-elevated cursor-pointer"
            >
              <span className="text-2xs text-text-muted uppercase font-semibold tracking-tight">P/VP</span>
              <span
                className={`tabular-nums font-semibold ${
                  (ativo.p_vp || 0) < 0.95
                    ? 'text-status-success'
                    : (ativo.p_vp || 0) > 1.05
                    ? 'text-status-error'
                    : 'text-text-primary'
                }`}
              >
                {(ativo.p_vp || 0).toFixed(2)}
              </span>
            </div>
          )}
          {magicNumber > 0 && (
            <div
              title={
                atingiuMagic
                  ? 'Número Mágico atingido! O rendimento mensal já paga uma nova cota do fundo.'
                  : `Número Mágico (renda mensal): ${ativo.qtd} de ${magicNumber} cotas necessárias para o rendimento mensal pagar uma nova cota.`
              }
              className={`text-2xs flex items-center gap-1 justify-end w-24 px-1 font-semibold cursor-pointer ${
                atingiuMagic ? 'text-cyan-400' : 'text-text-muted'
              }`}
            >
              <Snowflake size={11} className={atingiuMagic ? 'opacity-100' : 'opacity-70'} />
              <PrivateValue value={`${ativo.qtd}/${magicNumber}`} className="tabular-nums" />
            </div>
          )}
          {(ativo.bazin_price || 0) > 0 && (
            <span
              title={`Preço Teto Bazin (8% a.a.): ${formatMoney(ativo.bazin_price || 0)}`}
              className={`text-2xs font-mono px-2 py-0.5 rounded-md border min-w-[96px] flex items-center justify-between gap-1.5 whitespace-nowrap ${
                (ativo.mg_bazin || 0) >= 0
                  ? 'text-status-success border-status-success/30 bg-status-success/10'
                  : 'text-text-muted border-border-subtle bg-surface-card'
              }`}
            >
              <span className="text-2xs font-semibold opacity-75">TETO</span>
              <PrivateValue value={formatMoney(ativo.bazin_price || 0)} className="tabular-nums" />
            </span>
          )}
        </div>
      ) : tab === 'Ação' && ((ativo.vi_graham || 0) > 0 || (ativo.mg_graham || 0) !== 0 || (ativo.bazin_price || 0) > 0) ? (
        <div className="flex flex-col items-end gap-1.5 w-full">
          {(ativo.vi_graham || 0) > 0 && (
            <span
              title="Margem de Graham: Desconto percentual da cotação atual em relação ao Valor Intrínseco de Graham."
              className={`text-2xs font-mono px-2 py-0.5 rounded-md border cursor-pointer tabular-nums font-semibold w-24 text-center ${
                (ativo.mg_graham || 0) > 20
                  ? 'text-status-success bg-status-success/10 border-status-success/30'
                  : (ativo.mg_graham || 0) > 0
                  ? 'text-status-success bg-status-success/5 border-status-success/20'
                  : 'text-status-error bg-status-error/10 border-status-error/30'
              }`}
            >
              {(ativo.mg_graham || 0) > 0 ? '+' : ''}
              {(ativo.mg_graham || 0).toFixed(0)}%
            </span>
          )}
          {(ativo.vi_graham || 0) > 0 && (
            <span
              title="V.I. (Valor Intrínseco): Valor justo teórico calculado pela fórmula clássica de Benjamin Graham."
              className="text-2xs text-text-muted font-medium tracking-tighter cursor-pointer bg-surface-elevated border border-border-subtle px-2 py-0.5 rounded-md flex items-center justify-between gap-1.5 whitespace-nowrap min-w-[96px]"
            >
              <span className="text-text-muted uppercase">V.I</span>
              <PrivateValue value={formatMoney(ativo.vi_graham || 0)} className="tabular-nums" />
            </span>
          )}
          {(ativo.bazin_price || 0) > 0 && (
            <span
              title={`Preço Teto Bazin (6% a.a.): ${formatMoney(ativo.bazin_price || 0)}`}
              className={`text-2xs font-mono px-2 py-0.5 rounded-md border flex items-center justify-between gap-1.5 whitespace-nowrap min-w-[96px] ${
                (ativo.mg_bazin || 0) >= 0
                  ? 'text-status-success border-status-success/30 bg-status-success/10'
                  : 'text-text-muted border-border-subtle bg-surface-card'
              }`}
            >
              <span className="text-2xs font-semibold opacity-75">TETO</span>
              <PrivateValue value={formatMoney(ativo.bazin_price || 0)} className="tabular-nums" />
            </span>
          )}
        </div>
      ) : (
        <span className="text-text-muted">-</span>
      )}
    </td>
  );
});
