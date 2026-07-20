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
        <div className="relative h-9 w-9 shrink-0 rounded-full bg-slate-800 overflow-hidden shadow-sm group-hover:scale-110 transition-transform duration-300">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/icon/${ativo.ticker}`}
              alt={ativo.ticker}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={`h-full w-full flex items-center justify-center text-[9px] font-bold text-white ${getStatusBg(ativo.status)}`}>
              {ativo.ticker.substring(0, 2)}
            </div>
          )}
        </div>
        <div>
          <div className="font-bold text-white text-sm flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewDetails(ativo)}
              className="hover:text-blue-400 hover:underline flex items-center gap-1 transition-all group/name text-left"
            >
              {ativo.ticker}
              <Search size={10} className="text-slate-500 opacity-0 group-hover/name:opacity-100 transition-opacity" />
            </button>

            <div className="flex opacity-0 group-hover:opacity-100 transition-all gap-1 ml-1">
              <button
                type="button"
                onClick={onOpenReport}
                className={`p-1 hover:bg-slate-700 rounded transition-colors ${stats.hasReports ? 'text-blue-400' : 'text-slate-600'}`}
                title="Docs"
                aria-label={`Documentos de ${ativo.ticker}`}
              >
                <Layers size={12} />
              </button>
              <button
                type="button"
                onClick={() => onEdit(ativo)}
                className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400 transition-colors"
                title="Gerenciar Ativo"
                aria-label={`Gerenciar ${ativo.ticker}`}
              >
                <Pencil size={12} />
              </button>
              {onViewNews && (
                <button
                  type="button"
                  onClick={() => onViewNews(ativo.ticker)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                  title="Notícias"
                  aria-label={`Notícias de ${ativo.ticker}`}
                >
                  <FileText size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">
            {ativo.tipo} • <PrivateValue value={`${ativo.qtd} UN`} className="tabular-nums" />
          </div>
        </div>
      </div>
    </td>
  );
}
