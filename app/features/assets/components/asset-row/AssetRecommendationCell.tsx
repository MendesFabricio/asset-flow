import { CSSProperties, MouseEvent } from 'react';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { AssetTooltip } from '@/components/AssetTooltip';
import { AssetRowStats } from './useAssetRowStats';

const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}]/gu;

interface AssetRecommendationCellProps {
  ativo: Asset;
  stats: AssetRowStats;
  tooltip: { data: 'rec' | 'fin' } | null;
  tooltipStyle: CSSProperties;
  onShowRec: (e: MouseEvent) => void;
  onHide: () => void;
}

export function AssetRecommendationCell({
  ativo,
  stats,
  tooltip,
  tooltipStyle,
  onShowRec,
  onHide,
}: AssetRecommendationCellProps) {
  const recLower = (ativo.recomendacao || '').toLowerCase();
  const isComprar = recLower.includes('aportar') || recLower.includes('comprar');
  const isManter = recLower.includes('manter');
  const isEvitar = recLower.includes('evitar');

  const colors = isComprar
    ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20'
    : isManter
    ? 'text-amber-400 bg-amber-500/10 ring-amber-500/20'
    : isEvitar
    ? 'text-rose-400 bg-rose-500/10 ring-rose-500/20'
    : 'text-slate-400 bg-slate-500/10 ring-slate-500/20';

  const cleanRec = (ativo.recomendacao || '').replace(EMOJI_REGEX, '').trim();

  return (
    <td className="px-6 py-5 text-right">
      <div className="flex flex-col items-end gap-1.5 w-[110px] ml-auto">
        {ativo.falta_comprar > 1 ? (
          <PrivateValue
            value={`+${formatMoney(ativo.falta_comprar)}`}
            className="w-full max-w-[110px] text-center text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded ring-1 ring-inset ring-blue-500/20 text-[11px] whitespace-nowrap shadow-sm tabular-nums inline-block"
          />
        ) : (
          <span className="w-full max-w-[110px] text-center text-slate-700 text-[10px] font-medium inline-block">-</span>
        )}

        <div
          className={`inline-flex items-center justify-center gap-1 text-[9px] w-full max-w-[110px] px-1 py-[3px] rounded-md ring-1 ring-inset uppercase font-bold cursor-pointer transition-all whitespace-nowrap hover:brightness-125 ${colors}`}
          onMouseEnter={onShowRec}
          onMouseLeave={onHide}
        >
          {isComprar && <TrendingUp size={10} strokeWidth={2.5} className="shrink-0" />}
          {isManter && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5 shrink-0" />}
          {isEvitar && <TrendingDown size={10} strokeWidth={2.5} className="shrink-0" />}
          <span className="truncate">{cleanRec}</span>
          <Info size={10} className="opacity-50 hover:opacity-100 transition-opacity ml-0.5 shrink-0" />
        </div>

        {tooltip && (
          <AssetTooltip
            type={tooltip.data}
            data={{
              ticker: ativo.ticker,
              score: ativo.score || 0,
              motivos: stats.motivosLista,
              rsi: ativo.rsi || 50,
              variacaoFinanceira: stats.variacaoFinanceira,
              variacaoPct: stats.variacaoIntraday,
              isUSD: stats.isUSD,
            }}
            style={tooltipStyle}
          />
        )}
      </div>
    </td>
  );
}
