'use client';
import React, { useState, useMemo, MouseEvent } from 'react';
import { Asset } from '@/types';
import { usePrivacy } from '@/context/PrivacyContext';
import { ReportModal } from '@/components/ReportModal';
import { useFloatingTooltip } from '@/hooks/useFloatingTooltip';
import { useAssetRowStats } from './asset-row/useAssetRowStats';
import { AssetInfoCell } from './asset-row/AssetInfoCell';
import { AssetValueCell } from './asset-row/AssetValueCell';
import { AssetPriceCell } from './asset-row/AssetPriceCell';
import { AssetResultCell } from './asset-row/AssetResultCell';
import { AssetMetaCell } from './asset-row/AssetMetaCell';
import { AssetRecommendationCell } from './asset-row/AssetRecommendationCell';
import { AssetIndicatorsCell } from './asset-row/AssetIndicatorsCell';

interface AssetRowProps {
  ativo: Asset;
  tab: string;
  onEdit: (ativo: Asset) => void;
  onViewNews?: (ticker: string) => void;
  onViewDetails: (ativo: Asset) => void;
}

export const AssetRow = React.memo(({ ativo, tab, onEdit, onViewNews, onViewDetails }: AssetRowProps) => {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useFloatingTooltip<'rec' | 'fin'>();
  const stats = useAssetRowStats(ativo);

  const tooltipStyle = useMemo(() => {
    if (!tooltip) return {};

    const width = tooltip.data === 'rec' ? 256 : 180;

    let left = tooltip.rect.right - width;
    if (left < 12) left = 12;
    if (typeof window !== 'undefined' && left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }

    const style: React.CSSProperties = {
      left,
      width: tooltip.data === 'rec' ? '16rem' : 'auto',
    };

    const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - tooltip.rect.bottom : 500;
    if (spaceBelow < 300) {
      style.bottom = (typeof window !== 'undefined' ? window.innerHeight : 900) - tooltip.rect.top + 8;
    } else {
      style.top = tooltip.rect.bottom + 8;
    }

    return style;
  }, [tooltip]);

  const showIndicators = tab === 'Ação' || tab === 'FII';

  return (
    <>
      <tr className="hover:bg-slate-800/50 transition-colors duration-200 border-b border-slate-800/30 last:border-0 group text-xs sm:text-sm">
        <AssetInfoCell
          ativo={ativo}
          stats={stats}
          onEdit={onEdit}
          onViewNews={onViewNews}
          onViewDetails={onViewDetails}
          onOpenReport={() => setIsReportModalOpen(true)}
        />
        <AssetValueCell ativo={ativo} />
        <AssetPriceCell
          stats={stats}
          onShowFin={(e: MouseEvent) => showTooltip(e, 'fin')}
          onHide={() => hideTooltip()}
        />
        <AssetResultCell ativo={ativo} isHidden={isHidden} />
        <AssetMetaCell ativo={ativo} stats={stats} />
        <AssetRecommendationCell
          ativo={ativo}
          stats={stats}
          tooltip={tooltip}
          tooltipStyle={tooltipStyle}
          onShowRec={(e: MouseEvent) => showTooltip(e, 'rec')}
          onHide={() => hideTooltip()}
        />
        {showIndicators && <AssetIndicatorsCell ativo={ativo} tab={tab} />}
      </tr>
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} ativo={ativo} />
    </>
  );
});

AssetRow.displayName = 'AssetRow';
