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
    <td className="px-6 py-5 text-center hidden lg:table-cell w-28 align-middle">
      {tab === 'FII' ? (
        <div className="flex flex-col gap-1.5 items-end w-full">
          {(ativo.p_vp || 0) > 0 && (
            <div
              title="P/VP (Preço sobre Valor Patrimonial): Mede o preço do ativo em relação ao seu valor patrimonial. < 1.0 indica desconto."
              className="text-[11px] font-mono flex items-center justify-between w-20 px-2 py-[3px] rounded-md ring-1 ring-inset ring-slate-700/50 bg-slate-800/40 cursor-pointer shadow-sm"
            >
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">P/VP</span>
              <span
                className={`tabular-nums font-bold ${
                  (ativo.p_vp || 0) < 0.95
                    ? 'text-emerald-400'
                    : (ativo.p_vp || 0) > 1.05
                    ? 'text-rose-400'
                    : 'text-slate-300'
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
                  : `Número Mágico: ${ativo.qtd} de ${magicNumber} cotas necessárias para o rendimento pagar uma nova cota.`
              }
              className={`text-[10px] flex items-center gap-1 justify-end w-20 px-1 font-bold cursor-pointer ${
                atingiuMagic ? 'text-cyan-400' : 'text-text-secondary'
              }`}
            >
              <Snowflake size={11} className={atingiuMagic ? 'animate-pulse' : 'opacity-70'} />
              <PrivateValue value={`${ativo.qtd}/${magicNumber}`} className="tabular-nums" />
            </div>
          )}
        </div>
      ) : tab === 'Ação' && ((ativo.vi_graham || 0) > 0 || (ativo.mg_graham || 0) !== 0) ? (
        <div className="flex flex-col items-end gap-1.5 w-full">
          <span
            title="Margem de Graham: Desconto percentual da cotação atual em relação ao Valor Intrínseco de Graham."
            className={`text-[11px] font-mono px-2 py-[3px] rounded-md ring-1 ring-inset cursor-pointer tabular-nums font-bold w-full max-w-[80px] text-center shadow-sm ${
              (ativo.mg_graham || 0) > 20
                ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20'
                : (ativo.mg_graham || 0) > 0
                ? 'text-emerald-500 bg-emerald-500/5 ring-emerald-500/10'
                : 'text-rose-400 bg-rose-500/10 ring-rose-500/20'
            }`}
          >
            {(ativo.mg_graham || 0) > 0 ? '+' : ''}
            {(ativo.mg_graham || 0).toFixed(0)}%
          </span>
          <span
            title="V.I. (Valor Intrínseco): Valor justo teórico calculado pela fórmula clássica de Benjamin Graham."
            className="text-[9px] text-slate-400 font-medium tracking-tighter cursor-pointer bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded flex items-center justify-between w-full max-w-[80px]"
          >
            <span className="text-slate-500 uppercase">V.I</span>
            <PrivateValue value={formatMoney(ativo.vi_graham || 0)} className="tabular-nums" />
          </span>
        </div>
      ) : (
        <span className="text-slate-700">-</span>
      )}
    </td>
  );
});
