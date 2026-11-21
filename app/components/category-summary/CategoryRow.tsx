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

  let barColor = 'bg-accent';
  if (pctAtual > meta * 1.15) barColor = 'bg-status-warning';
  else if (pctAtual < meta * 0.85) barColor = 'bg-sky-500';

  return (
    <tr className="hover:bg-surface-elevated transition-colors group relative">
      <td className="px-6 py-3 align-middle relative">
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 rounded-r-full"
          style={{ backgroundColor: CATEGORY_COLORS[item.tipo] || CATEGORY_COLORS['Outros'] }}
        />
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary">{item.tipo}</span>

          {isReserva ? (
            <div className="flex items-center gap-0.5 text-2xs font-mono font-semibold px-1.5 py-0.5 rounded-md text-text-muted bg-surface-input border border-border-subtle cursor-default">
              Estável (CDB/Selic)
            </div>
          ) : (
            Math.abs(item.variacaoPct) > 0.001 && (
              <div
                className={`flex items-center gap-0.5 text-2xs font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded-md cursor-pointer transition-colors ${
                  isPositiveVar
                    ? 'text-status-success bg-status-success/10 border border-status-success/20'
                    : 'text-status-error bg-status-error/10 border border-status-error/20'
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

      <td className="px-4 py-3 text-right text-text-muted font-mono tabular-nums align-middle">
        <PrivateValue value={formatMoney(item.investido)} />
      </td>

      <td className="px-4 py-3 text-right text-text-primary font-mono font-semibold tabular-nums align-middle">
        <PrivateValue value={formatMoney(item.atual)} />
      </td>

      <td className="px-4 py-3 align-middle">
        {isReserva ? (
          <div className="flex flex-col py-1">
            <span className="text-text-primary font-semibold font-mono text-2xs tabular-nums leading-none">{pctAtual.toFixed(1)}%</span>
            <span className="text-2xs text-text-muted font-medium leading-none mt-1">Excluído das metas</span>
          </div>
        ) : (
          <div
            className="w-full cursor-pointer py-1"
            onMouseEnter={(e) => onShowMeta(e, { item, meta, pctAtual, diff, visualWidth })}
            onMouseLeave={onHideMeta}
          >
            <div className="flex justify-between text-2xs mb-2 font-mono tabular-nums leading-none">
              <span className="text-text-primary font-semibold">{pctAtual.toFixed(1)}%</span>
              {meta > 0 && (
                <span className={diff > 0 ? 'text-status-warning font-semibold' : 'text-status-success font-semibold'}>
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="h-2.5 w-full bg-surface-input border border-border-subtle rounded-full overflow-hidden relative p-[1px]">
              <div
                className={`h-full rounded-full ${barColor} opacity-90 transition-all duration-300`}
                style={{ width: `${visualWidth}%` }}
              ></div>
            </div>
          </div>
        )}
      </td>

      <td className="px-6 py-3 text-right align-middle">
        <div className="flex items-center justify-end gap-2 h-full">
          {isReserva ? (
            <span className="text-text-muted font-semibold font-mono text-xs block">-</span>
          ) : (
            <>
              <span className="text-text-muted font-semibold font-mono tabular-nums text-xs block">{meta.toFixed(0)}%</span>
              <button
                type="button"
                onClick={() => onEdit(item.tipo, meta)}
                aria-label={`Editar meta de ${item.tipo}`}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-surface-input text-text-muted hover:text-text-primary transition-opacity -mr-2"
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
