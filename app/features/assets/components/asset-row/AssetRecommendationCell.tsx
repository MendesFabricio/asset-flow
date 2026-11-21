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
  const isComprar = recLower.includes('aportar') || recLower.includes('comprar') || recLower.includes('oportunidade');
  const isManter = recLower.includes('manter');
  const isReduzir = recLower.includes('reduzir');
  const isEvitar = recLower.includes('evitar');

  const colors = isComprar
    ? 'text-status-success bg-status-success/10 border-status-success/20'
    : isManter
    ? 'text-status-warning bg-status-warning/10 border-status-warning/20'
    : isReduzir
    ? 'text-status-warning bg-orange-500/10 border-orange-500/20'
    : isEvitar
    ? 'text-status-error bg-status-error/10 border-status-error/20'
    : 'text-text-muted bg-surface-input border-border-subtle';

  const cleanRec = (ativo.recomendacao || '').replace(EMOJI_REGEX, '').trim();

  return (
    <td className="px-6 py-5 text-right">
      <div className="flex flex-col items-end gap-1.5 w-[132px] ml-auto">
        {ativo.falta_comprar > 1 ? (
          <PrivateValue
            value={`+${formatMoney(ativo.falta_comprar)}`}
            className="w-full max-w-[132px] text-center text-accent font-semibold bg-accent-soft px-2 py-0.5 rounded-md border border-accent/20 text-2xs whitespace-nowrap tabular-nums inline-block"
          />
        ) : (
          <span className="w-full max-w-[132px] text-center text-text-muted text-2xs font-medium inline-block">-</span>
        )}

        <div
          className={`inline-flex items-center justify-center gap-1 text-2xs w-full max-w-[132px] px-1.5 py-0.5 rounded-md border uppercase font-semibold cursor-pointer transition-colors whitespace-nowrap hover:brightness-110 ${colors}`}
          onMouseEnter={onShowRec}
          onMouseLeave={onHide}
        >
          {isComprar && <TrendingUp size={10} strokeWidth={2.5} className="shrink-0" />}
          {isManter && <div className="w-1.5 h-1.5 rounded-full bg-status-warning mr-0.5 shrink-0" />}
          {(isEvitar || isReduzir) && <TrendingDown size={10} strokeWidth={2.5} className="shrink-0" />}
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
              criteriosNaoAvaliados: ativo.criterios_nao_avaliados || [],
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
