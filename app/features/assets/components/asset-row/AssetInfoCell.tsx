import { useState } from 'react';
import { Pencil, FileText, Layers, Search } from 'lucide-react';
import { getStatusBg } from '@/lib/format';
import { Asset } from '@/types';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { AssetRowStats } from './useAssetRowStats';

interface AssetInfoCellProps {
  ativo: Asset;
  stats: AssetRowStats;
  onEdit: (ativo: Asset) => void;
  onViewNews?: (ticker: string) => void;
  onViewDetails: (ativo: Asset) => void;
  onOpenReport: () => void;
}

export function AssetInfoCell({
  ativo,
  stats,
  onEdit,
  onViewNews,
  onViewDetails,
  onOpenReport,
}: AssetInfoCellProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <td className="px-6 py-5">
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 shrink-0 rounded-full bg-surface-input border border-border-subtle overflow-hidden">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/icon/${encodeURIComponent(ativo.ticker)}?v=2`}
              alt={ativo.ticker}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`h-full w-full flex items-center justify-center text-2xs font-semibold text-white ${getStatusBg(ativo.status)}`}>
              {ativo.ticker.substring(0, 2)}
            </div>
          )}
        </div>
        <div>
          <div className="font-semibold text-text-primary text-sm flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewDetails(ativo)}
              className="hover:text-accent hover:underline flex items-center gap-1 transition-colors group/name text-left"
            >
              {ativo.ticker}
              <Search size={10} className="text-text-muted opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>

            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 ml-1">
              <button
                type="button"
                onClick={onOpenReport}
                className={`p-1 hover:bg-surface-input rounded-lg transition-colors ${stats.hasReports ? 'text-accent' : 'text-text-muted'}`}
                title="Docs"
                aria-label={`Documentos de ${ativo.ticker}`}
              >
                <Layers size={12} />
              </button>
              <button
                type="button"
                onClick={() => onEdit(ativo)}
                className="p-1 hover:bg-surface-input rounded-lg text-text-muted hover:text-accent transition-colors"
                title="Gerenciar Ativo"
                aria-label={`Gerenciar ${ativo.ticker}`}
              >
                <Pencil size={12} />
              </button>
              {onViewNews && (
                <button
                  type="button"
                  onClick={() => onViewNews(ativo.ticker)}
                  className="p-1 hover:bg-surface-input rounded-lg text-text-muted hover:text-status-success transition-colors"
                  title="Notícias"
                  aria-label={`Notícias de ${ativo.ticker}`}
                >
                  <FileText size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="text-2xs text-text-muted uppercase font-medium tracking-wide">
            {ativo.tipo === 'Reserva' ? (
              'RESERVA · CAIXINHA'
            ) : (
              <>
                {ativo.tipo} · <PrivateValue value={`${ativo.qtd} UN`} className="tabular-nums" />
              </>
            )}
          </div>
        </div>
      </div>
    </td>
  );
}
