'use client';
import { useState, useRef, useMemo } from 'react';
import { Snowflake, TrendingUp, TrendingDown, Pencil, FileText, Info, Layers, Search } from 'lucide-react'; // 👈 Adicionado Search
import { formatMoney, getStatusBg, getStatusColor } from '../utils';
import { Asset } from '../types';
import { usePrivacy } from '../context/PrivacyContext';
import ReportModal from './ReportModal';
import { AssetTooltip } from './AssetTooltip';

interface AssetRowProps {
  ativo: Asset;
  tab: string;
  onEdit: (ativo: Asset) => void;
  onViewNews?: (ticker: string) => void;
  onViewDetails: (ativo: Asset) => void;
  index: number;
  total: number;
}

const PrivateValue = ({ value, isHidden, className = "" }: { value: string | number, isHidden: boolean, className?: string }) => (
  <span className={className}>{isHidden ? (className.includes('pct') ? '•••%' : '••••••') : value}</span>
);

export const AssetRow = ({ ativo, tab, onEdit, onViewNews, onViewDetails, index, total }: AssetRowProps) => {
  const { isHidden } = usePrivacy() as any;
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; position: 'top' | 'bottom'; type: 'rec' | 'fin' } | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [imgError, setImgError] = useState(false);

  // --- MEMOIZATION: Cálculos Pesados ---
  const stats = useMemo(() => {
    const isUSD = (ativo as any).currency === 'USD';
    const variacaoIntraday = (ativo as any).change_percent ?? 0;
    const isPositiveIntraday = variacaoIntraday >= 0;

    const divisor = 1 + (variacaoIntraday / 100);
    const variacaoFinanceira = divisor > 0.0001 ? ativo.total_atual - (ativo.total_atual / divisor) : 0;

    const motivosRaw = ativo.motivo || "";
    const separator = motivosRaw.includes(' • ') ? ' • ' : ' + ';
    const motivosLista = motivosRaw ? motivosRaw.split(separator) : [];

    const percentualDaMeta = ativo.meta > 0 ? (ativo.pct_na_categoria / ativo.meta) * 100 : 0;

    return {
      isUSD,
      variacaoIntraday,
      isPositiveIntraday,
      variacaoFinanceira,
      motivosLista,
      percentualDaMeta,
      barraWidth: Math.min(percentualDaMeta, 100),
      isOverweight: ativo.pct_na_categoria > ativo.meta,
      displayPrice: isUSD ? `$ ${ativo.preco_atual.toFixed(2)}` : formatMoney(ativo.preco_atual),
      displayPM: isUSD ? `$ ${ativo.pm.toFixed(2)}` : formatMoney(ativo.pm),
      hasReports: !!ativo.last_report_url || (typeof ativo.last_report_type === 'string' && ativo.last_report_type.length > 5) || !!(ativo as any).fundamentalist_data
    };
  }, [ativo]);

  const showIndicators = tab === 'Ação' || tab === 'FII';
  const lucroPositivo = ativo.lucro_valor >= 0;
  const atingiuMagic = (ativo.magic_number || 0) > 0 && ativo.qtd >= (ativo.magic_number || 0);

  const handleMouseEnter = (e: React.MouseEvent, type: 'rec' | 'fin') => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const position = spaceBelow < 300 ? 'top' : 'bottom';
    setTooltip({ x: rect.right, y: position === 'top' ? rect.top : rect.bottom, position, type });
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => { setTooltip(null); }, 100);
  };

  return (
    <>
      <tr className="hover:bg-slate-800/40 transition-colors border-b border-slate-800/50 last:border-0 group text-xs sm:text-sm">

        {/* COLUNA 1: IDENTIFICAÇÃO (Agora clicável) */}
        <td className="p-4 pl-6">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 rounded-full bg-slate-800 overflow-hidden shadow-sm group-hover:scale-110 transition-transform duration-300">
              {!imgError ? (
                <img src={`https://raw.githubusercontent.com/thefintz/icones-b3/main/icones/${ativo.ticker}.png`} alt={ativo.ticker} className="h-full w-full object-cover" onError={() => setImgError(true)} />
              ) : (
                <div className={`h-full w-full flex items-center justify-center text-[9px] font-bold text-white ${getStatusBg(ativo.status)}`}>
                  {ativo.ticker.substring(0, 2)}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">

                {/* 👇 BOTÃO CLICÁVEL PARA ABRIR DETALHES 👇 */}
                <button
                  onClick={() => onViewDetails(ativo)}
                  className="hover:text-blue-400 hover:underline flex items-center gap-1 transition-all group/name text-left"
                >
                  {ativo.ticker}
                  <Search size={10} className="text-slate-500 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                </button>

                <div className="flex opacity-0 group-hover:opacity-100 transition-all gap-1 ml-1">
                  <button onClick={() => setIsReportModalOpen(true)} className={`p-1 hover:bg-slate-700 rounded transition-colors ${stats.hasReports ? 'text-blue-400' : 'text-slate-600'}`} title="Docs">
                    <Layers size={12} />
                  </button>
                  <button onClick={() => onEdit(ativo)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400 transition-colors" title="Editar">
                    <Pencil size={12} />
                  </button>
                  {onViewNews && (
                    <button onClick={() => onViewNews(ativo.ticker)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-emerald-400 transition-colors" title="Notícias">
                      <FileText size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-500 uppercase font-medium tracking-wide">
                {ativo.tipo} • <PrivateValue value={`${ativo.qtd} UN`} isHidden={isHidden} />
              </div>
            </div>
          </div>
        </td>

        {/* COLUNA 2: VALOR TOTAL */}
        <td className="p-4 text-right">
          <div className="flex flex-col items-end">
            <PrivateValue value={formatMoney(ativo.total_atual)} isHidden={isHidden} className="text-slate-200 font-bold" />
            <PrivateValue value={`Investido: ${formatMoney(ativo.total_investido)}`} isHidden={isHidden} className="text-[10px] text-slate-500" />
          </div>
        </td>

        {/* COLUNA 3: PREÇO + VARIAÇÃO */}
        <td className="p-4 text-right hidden sm:table-cell">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 justify-end">
              {!isNaN(Number(stats.variacaoIntraday)) && Number(stats.variacaoIntraday) !== 0 && (
                <div
                  className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded cursor-help transition-all hover:scale-105 ${stats.isPositiveIntraday ? 'text-emerald-400 bg-emerald-400/20' : 'text-rose-400 bg-rose-400/20'
                    }`}
                  onMouseEnter={(e) => handleMouseEnter(e, 'fin')}
                  onMouseLeave={handleMouseLeave}
                >
                  {stats.isPositiveIntraday ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
                  <span>{stats.isPositiveIntraday ? '+' : ''}{Number(stats.variacaoIntraday).toFixed(2)}%</span>
                </div>
              )}
              <PrivateValue value={stats.displayPrice} isHidden={isHidden} className="text-slate-300 font-mono text-sm" />
            </div>
            <PrivateValue value={`PM: ${stats.displayPM}`} isHidden={isHidden} className="text-[10px] text-slate-600" />
          </div>
        </td>

        {/* COLUNA 4: RESULTADO GERAL */}
        <td className="p-4 text-right">
          <div className="flex flex-col items-end">
            <PrivateValue value={(lucroPositivo ? '+' : '') + formatMoney(ativo.lucro_valor)} isHidden={isHidden} className={`font-bold font-mono ${lucroPositivo ? 'text-emerald-400' : 'text-rose-400'}`} />
            <div className={`text-[10px] flex items-center gap-1 ${lucroPositivo ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
              <PrivateValue value={`${lucroPositivo ? '+' : ''}${ativo.lucro_pct.toFixed(2)}%`} isHidden={isHidden} className="pct" />
              {!isHidden && (lucroPositivo ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
            </div>
          </div>
        </td>

        {/* COLUNA 5: META (BARRA) */}
        <td className="p-4 text-right w-36 hidden md:table-cell">
          <div className="flex justify-between text-[10px] mb-1.5 px-0.5">
            <span className={`font-bold ${stats.isOverweight ? 'text-yellow-400' : 'text-blue-300'}`}>
              {ativo.pct_na_categoria.toFixed(1)}%
            </span>
            <span className="text-slate-600">meta {ativo.meta}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden ring-1 ring-slate-800">
            <div className={`h-full transition-all duration-1000 ease-out ${stats.isOverweight ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${stats.barraWidth}%` }}></div>
          </div>
        </td>

        {/* COLUNA 6: APORTE + RECOMENDAÇÃO */}
        <td className="p-4 text-right">
          <div className="flex flex-col items-end gap-1.5">
            {ativo.falta_comprar > 1 ? (
              <PrivateValue value={`+${formatMoney(ativo.falta_comprar)}`} isHidden={isHidden} className="text-blue-300 font-bold bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 text-xs whitespace-nowrap shadow-sm shadow-blue-900/20" />
            ) : <span className="text-slate-700 text-[10px] font-medium">-</span>}

            <div
              className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold cursor-help transition-all hover:brightness-110 ${getStatusColor(ativo.status)}`}
              onMouseEnter={(e) => handleMouseEnter(e, 'rec')}
              onMouseLeave={handleMouseLeave}
            >
              {ativo.recomendacao}
              <Info size={10} className="opacity-60 hover:opacity-100 transition-opacity" />
            </div>

            {tooltip && (
              <AssetTooltip
                type={tooltip.type}
                data={{
                  ticker: ativo.ticker,
                  score: ativo.score || 0,
                  motivos: stats.motivosLista,
                  rsi: ativo.rsi || 50,
                  variacaoFinanceira: stats.variacaoFinanceira,
                  variacaoPct: stats.variacaoIntraday,
                  isUSD: stats.isUSD
                }}
                style={{
                  left: tooltip.x - 256,
                  top: tooltip.position === 'bottom' ? tooltip.y + 8 : 'auto',
                  bottom: tooltip.position === 'top' ? (window.innerHeight - tooltip.y) + 8 : 'auto',
                  width: tooltip.type === 'rec' ? '16rem' : 'auto'
                }}
              />
            )}
          </div>
        </td>

        {/* COLUNA 7: INDICADORES EXTRAS */}
        {showIndicators && (
          <td className="p-4 text-center hidden lg:table-cell w-28 align-middle">
            {tab === 'FII' ? (
              <div className="flex flex-col gap-1 items-end w-full">
                {(ativo.p_vp || 0) > 0 && (
                  <div className="text-xs font-mono flex items-center gap-1.5 bg-slate-800/30 px-2 py-0.5 rounded border border-slate-800">
                    <span className="text-[9px] text-slate-500 uppercase">P/VP</span>
                    <span className={(ativo.p_vp || 0) < 0.95 ? 'text-emerald-400 font-bold' : (ativo.p_vp || 0) > 1.05 ? 'text-rose-400' : 'text-slate-300'}>{(ativo.p_vp || 0).toFixed(2)}</span>
                  </div>
                )}
                {atingiuMagic && (
                  <div className="text-[10px] flex items-center gap-1 justify-end w-full px-1 text-cyan-400 font-bold">
                    <Snowflake size={10} className="animate-pulse" />
                    <PrivateValue value={`${ativo.qtd}/${ativo.magic_number}`} isHidden={isHidden} />
                  </div>
                )}
              </div>
            ) : tab === 'Ação' && ((ativo.vi_graham || 0) > 0 || (ativo.mg_graham || 0) !== 0) ? (
              <div className="flex flex-col items-center gap-1">
                <span className={`text-[10px] font-mono px-2 py-1 rounded border ${(ativo.mg_graham || 0) > 20 ? 'text-emerald-400 bg-emerald-400/5 border-emerald-400/20' : (ativo.mg_graham || 0) > 0 ? 'text-emerald-600 bg-emerald-400/5 border-emerald-600/10' : 'text-rose-400 bg-rose-400/5 border-rose-400/20'}`}>
                  {(ativo.mg_graham || 0) > 0 ? '+' : ''}{(ativo.mg_graham || 0).toFixed(0)}%
                </span>
                <span className="text-[9px] text-slate-600 font-medium uppercase tracking-tighter">V.I: <PrivateValue value={formatMoney(ativo.vi_graham || 0)} isHidden={isHidden} /></span>
              </div>
            ) : <span className="text-slate-800">-</span>}
          </td>
        )}
      </tr>

      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} ativo={ativo} />
    </>
  );
};
