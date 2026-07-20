import { MouseEvent } from 'react';
import { Pencil, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { CATEGORY_COLORS } from '@/lib/colors';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { GroupedAsset, MetaTooltipData, FinanceTooltipData } from './types';

interface CategoryRowProps {
  item: GroupedAsset;
  meta: number;
  pctAtual: number;
  diff: number;
  visualWidth: number;
  onEdit: (catName: string, meta: number) => void;
  onShowFinance: (e: MouseEvent, data: FinanceTooltipData) => void;
  onHideFinance: () => void;
  onShowMeta: (e: MouseEvent, data: MetaTooltipData) => void;
  onHideMeta: () => void;
}

export function CategoryRow({
  item,
  meta,
  pctAtual,
  diff,
  visualWidth,
  onEdit,
  onShowFinance,
  onHideFinance,
  onShowMeta,
  onHideMeta,
}: CategoryRowProps) {
  const isPositiveVar = item.variacaoPct >= 0;
  const isReserva = item.tipo === 'Reserva';

  let barColor = 'bg-blue-600';
  if (pctAtual > meta * 1.15) barColor = 'bg-amber-500';
  else if (pctAtual < meta * 0.85) barColor = 'bg-sky-500';

  return (
    <tr className="hover:bg-slate-800/40 transition-colors group relative">
      <td className="px-6 py-3 align-middle relative">
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 rounded-r-full shadow-[2px_0_8px_rgba(0,0,0,0.5)]"
          style={{ backgroundColor: CATEGORY_COLORS[item.tipo] || CATEGORY_COLORS['Outros'] }}
        />
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300">{item.tipo}</span>

          {isReserva ? (
            <div className="flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-slate-400 bg-slate-800/85 border border-slate-750/70 cursor-default">
              Estável (CDB/Selic)
            </div>
          ) : (
            Math.abs(item.variacaoPct) > 0.001 && (
              <div
                className={`flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded cursor-pointer transition-all hover:scale-105 ${
                  isPositiveVar
                    ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'
                    : 'text-rose-400 bg-rose-400/10 border border-rose-400/20'
                }`}
                onMouseEnter={(e) => onShowFinance(e, { valor: item.variacaoValor, isPositive: isPositiveVar })}
                onMouseLeave={onHideFinance}
              >
                {isPositiveVar ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isPositiveVar ? '+' : ''}
                {item.variacaoPct.toFixed(2)}%
              </div>
            )
          )}
        </div>
      </td>

      <td className="px-4 py-3 text-right text-slate-500 font-mono align-middle">
        <PrivateValue value={formatMoney(item.investido)} />
      </td>

      <td className="px-4 py-3 text-right text-white font-mono font-bold align-middle">
        <PrivateValue value={formatMoney(item.atual)} />
      </td>

      <td className="px-4 py-3 align-middle">
        {isReserva ? (
          <div className="flex flex-col py-1">
            <span className="text-slate-200 font-bold font-mono text-[10px] leading-none">{pctAtual.toFixed(1)}%</span>
            <span className="text-[9px] text-slate-500 font-bold leading-none mt-1">Excluído das metas</span>
          </div>
        ) : (
          <div
            className="w-full cursor-pointer py-1"
            onMouseEnter={(e) => onShowMeta(e, { item, meta, pctAtual, diff, visualWidth })}
            onMouseLeave={onHideMeta}
          >
            <div className="flex justify-between text-[10px] mb-2 font-mono leading-none">
              <span className="text-slate-200 font-bold">{pctAtual.toFixed(1)}%</span>
              {meta > 0 && (
                <span className={diff > 0 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="h-2.5 w-full bg-slate-900/80 border border-slate-800/60 shadow-inner rounded-full overflow-hidden relative p-[1px]">
              <div
                className={`h-full rounded-full ${barColor} opacity-90 transition-all duration-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]`}
                style={{ width: `${visualWidth}%` }}
              ></div>
            </div>
          </div>
        )}
      </td>

      <td className="px-6 py-3 text-right align-middle">
        <div className="flex items-center justify-end gap-2 h-full">
          {isReserva ? (
            <span className="text-slate-500 font-bold font-mono text-xs block">-</span>
          ) : (
            <>
              <span className="text-slate-400 font-bold font-mono text-xs block">{meta.toFixed(0)}%</span>
              <button
                type="button"
                onClick={() => onEdit(item.tipo, meta)}
                aria-label={`Editar meta de ${item.tipo}`}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-slate-800 text-slate-600 hover:text-white transition-all -mr-2"
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
