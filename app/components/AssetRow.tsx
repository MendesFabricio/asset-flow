'use client';
import React, { useState, useRef, useMemo } from 'react';
import { Snowflake, TrendingUp, TrendingDown, Pencil, FileText, Info, Layers, Search } from 'lucide-react';
import { formatMoney, getStatusBg } from '../utils';
import { Asset } from '../types';
import { usePrivacy } from '../context/PrivacyContext';
import ReportModal from './ReportModal';
import { AssetTooltip } from './AssetTooltip';
import Image from 'next/image';

interface AssetRowProps {
  ativo: Asset;
  tab: string;
  onEdit: (ativo: Asset) => void;
  onViewNews?: (ticker: string) => void;
  onViewDetails: (ativo: Asset) => void;
}

type ExtendedAsset = Asset & {
  currency?: string;
  change_percent?: number;
  fundamentalist_data?: unknown;
  last_report_url?: string;
  last_report_type?: string;
};

import { PrivateValue } from './ui/PrivateValue';

export const AssetRow = React.memo(({ ativo, tab, onEdit, onViewNews, onViewDetails }: AssetRowProps) => {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; position: 'top' | 'bottom'; type: 'rec' | 'fin' } | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [imgError, setImgError] = useState(false);

  const stats = useMemo(() => {
    const extAsset = ativo as ExtendedAsset;
    const isUSD = extAsset.currency === 'USD';
    const variacaoIntraday = extAsset.change_percent ?? 0;
    const isPositiveIntraday = variacaoIntraday >= 0;

    const divisor = 1 + (variacaoIntraday / 100);
    const variacaoFinanceira = divisor > 0.0001 ? extAsset.total_atual - (extAsset.total_atual / divisor) : 0;

    const motivosRaw = extAsset.motivo || "";
    const separator = motivosRaw.includes(' • ') ? ' • ' : ' + ';
    const motivosLista = motivosRaw ? motivosRaw.split(separator) : [];

    const percentualDaMeta = extAsset.meta > 0 ? (extAsset.pct_na_categoria / extAsset.meta) * 100 : 0;

    return {
      isUSD,
      variacaoIntraday,
      isPositiveIntraday,
      variacaoFinanceira,
      motivosLista,
      percentualDaMeta,
      barraWidth: Math.min(percentualDaMeta, 100),
      isOverweight: extAsset.pct_na_categoria > extAsset.meta,
      displayPrice: isUSD ? `$ ${extAsset.preco_atual.toFixed(2)}` : formatMoney(extAsset.preco_atual),
      displayPM: isUSD ? `$ ${extAsset.pm.toFixed(2)}` : formatMoney(extAsset.pm),
      hasReports: !!extAsset.last_report_url || (typeof extAsset.last_report_type === 'string' && extAsset.last_report_type.length > 5) || !!extAsset.fundamentalist_data
    };
  }, [ativo]);

  const tooltipStyle = useMemo(() => {
    if (!tooltip) return {};

    // Calcula largura estimada do tooltip
    const width = tooltip.type === 'rec' ? 256 : 180;

    // Evita transbordamento na esquerda
    let left = tooltip.x - width;
    if (left < 12) {
      left = 12;
    }

    // Evita transbordamento na direita
    if (typeof window !== 'undefined' && left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }

    const style: React.CSSProperties = {
      left,
      width: tooltip.type === 'rec' ? '16rem' : 'auto'
    };

    if (tooltip.position === 'bottom') {
      style.top = tooltip.y + 8;
    } else {
      style.bottom = (typeof window !== 'undefined' ? window.innerHeight : 900) - tooltip.y + 8;
    }

    return style;
  }, [tooltip]);

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
      <tr className="hover:bg-slate-800/50 transition-colors duration-200 border-b border-slate-800/30 last:border-0 group text-xs sm:text-sm">

        {/* COLUNA 1: IDENTIFICAÇÃO */}
        <td className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 rounded-full bg-slate-800 overflow-hidden shadow-sm group-hover:scale-110 transition-transform duration-300">
              {!imgError ? (
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
                  <button type="button" onClick={() => setIsReportModalOpen(true)} className={`p-1 hover:bg-slate-700 rounded transition-colors ${stats.hasReports ? 'text-blue-400' : 'text-slate-600'}`} title="Docs">
                    <Layers size={12} />
                  </button>
                  <button type="button" onClick={() => onEdit(ativo)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400 transition-colors" title="Editar">
                    <Pencil size={12} />
                  </button>
                  {onViewNews && (
                    <button type="button" onClick={() => onViewNews(ativo.ticker)} className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-emerald-400 transition-colors" title="Notícias">
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

        {/* COLUNA 2: VALOR TOTAL */}
        <td className="px-6 py-5 text-right">
          <div className="flex flex-col items-end">
            <PrivateValue value={formatMoney(ativo.total_atual)} className="text-slate-200 font-bold tabular-nums" />
            <PrivateValue value={`Investido: ${formatMoney(ativo.total_investido)}`} className="text-[10px] text-slate-500 tabular-nums" />
          </div>
        </td>

        {/* COLUNA 3: PREÇO + VARIAÇÃO */}
        <td className="px-6 py-5 text-right hidden sm:table-cell">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 justify-end">
              {!isNaN(Number(stats.variacaoIntraday)) && Number(stats.variacaoIntraday) !== 0 && (
                <div
                  className={`text-[10px] font-bold flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all hover:scale-105 tabular-nums ${stats.isPositiveIntraday ? 'text-emerald-400 bg-emerald-400/20' : 'text-rose-400 bg-rose-400/20'}`}
                  onMouseEnter={(e) => handleMouseEnter(e, 'fin')}
                  onMouseLeave={handleMouseLeave}
                >
                  {stats.isPositiveIntraday ? <TrendingUp size={12} strokeWidth={3} /> : <TrendingDown size={12} strokeWidth={3} />}
                  <span className="tabular-nums">{stats.isPositiveIntraday ? '+' : ''}{Number(stats.variacaoIntraday).toFixed(2)}%</span>
                </div>
              )}
              <PrivateValue value={stats.displayPrice} className="text-slate-300 font-mono text-sm tabular-nums" />
            </div>
            <PrivateValue value={`PM: ${stats.displayPM}`} className="text-[10px] text-slate-600 tabular-nums" />
          </div>
        </td>

        {/* COLUNA 4: RESULTADO GERAL */}
        <td className="px-6 py-5 text-right">
          <div className="flex flex-col items-end">
            <PrivateValue value={(lucroPositivo ? '+' : '') + formatMoney(ativo.lucro_valor)} className={`font-bold font-mono tabular-nums ${lucroPositivo ? 'text-emerald-400' : 'text-rose-400'}`} />
            <div className={`text-[10px] flex items-center gap-1 ${lucroPositivo ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
              <PrivateValue value={`${lucroPositivo ? '+' : ''}${ativo.lucro_pct.toFixed(2)}%`} className="pct tabular-nums" />
              {!isHidden && (lucroPositivo ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
            </div>
          </div>
        </td>

        {/* COLUNA 5: META */}
        <td className="px-6 py-5 text-right w-36 hidden md:table-cell">
          <div className="flex justify-between text-[10px] mb-2 px-0.5 font-mono leading-none">
            <span className={`font-bold tabular-nums ${stats.isOverweight ? 'text-yellow-400' : 'text-blue-300'}`}>
              {ativo.pct_na_categoria.toFixed(1)}%
            </span>
            <span className="text-slate-600 font-bold uppercase tracking-tighter">meta <span className="tabular-nums text-slate-500">{ativo.meta}%</span></span>
          </div>
          <div className="h-2.5 w-full bg-slate-900/80 border border-slate-800/60 shadow-inner rounded-full overflow-hidden relative p-[1px]">
            <div 
              className={`h-full rounded-full opacity-90 transition-all duration-1000 ease-out shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] ${stats.isOverweight ? 'bg-yellow-500' : 'bg-blue-600'}`} 
              style={{ width: `${stats.barraWidth}%` }}
            ></div>
          </div>
        </td>

        {/* COLUNA 6: APORTE + RECOMENDAÇÃO */}
        <td className="px-6 py-5 text-right">
          <div className="flex flex-col items-end gap-1.5 w-[110px] ml-auto">
            {ativo.falta_comprar > 1 ? (
              <PrivateValue 
                value={`+${formatMoney(ativo.falta_comprar)}`} 
                className="w-full max-w-[110px] text-center text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded ring-1 ring-inset ring-blue-500/20 text-[11px] whitespace-nowrap shadow-sm tabular-nums inline-block" 
              />
            ) : <span className="w-full max-w-[110px] text-center text-slate-700 text-[10px] font-medium inline-block">-</span>}

            {(() => {
              const recLower = (ativo.recomendacao || '').toLowerCase();
              const isComprar = recLower.includes('aportar') || recLower.includes('comprar');
              const isManter = recLower.includes('manter');
              const isEvitar = recLower.includes('evitar');
              
              const colors = isComprar ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' 
                           : isManter ? 'text-amber-400 bg-amber-500/10 ring-amber-500/20'
                           : isEvitar ? 'text-rose-400 bg-rose-500/10 ring-rose-500/20'
                           : 'text-slate-400 bg-slate-500/10 ring-slate-500/20';

              const cleanRec = (ativo.recomendacao || '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}]/gu, '').trim();

              return (
                <div
                  className={`inline-flex items-center justify-center gap-1 text-[9px] w-full max-w-[110px] px-1 py-[3px] rounded-md ring-1 ring-inset uppercase font-bold cursor-pointer transition-all whitespace-nowrap hover:brightness-125 ${colors}`}
                  onMouseEnter={(e) => handleMouseEnter(e, 'rec')}
                  onMouseLeave={handleMouseLeave}
                >
                  {isComprar && <TrendingUp size={10} strokeWidth={2.5} className="shrink-0" />}
                  {isManter && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-0.5 shrink-0" />}
                  {isEvitar && <TrendingDown size={10} strokeWidth={2.5} className="shrink-0" />}
                  
                  <span className="truncate">{cleanRec}</span>
                  <Info size={10} className="opacity-50 hover:opacity-100 transition-opacity ml-0.5 shrink-0" />
                </div>
              );
            })()}

            {tooltip && (
              <AssetTooltip
                type={tooltip.type}
                data={{
                  ticker: ativo.ticker,
                  score: ativo.score || 0,
                  motivos: stats.motivosLista,
                  rsi: (ativo as Asset & { rsi?: number }).rsi || 50,
                  variacaoFinanceira: stats.variacaoFinanceira,
                  variacaoPct: stats.variacaoIntraday,
                  isUSD: stats.isUSD
                }}
                style={tooltipStyle}
              />
            )}
          </div>
        </td>

        {/* COLUNA 7: INDICADORES EXTRAS */}
        {showIndicators && (
          <td className="px-6 py-5 text-center hidden lg:table-cell w-28 align-middle">
            {tab === 'FII' ? (
              <div className="flex flex-col gap-1.5 items-end w-full">
                {(ativo.p_vp || 0) > 0 && (
                  <div
                    title="P/VP (Preço sobre Valor Patrimonial): Mede o preço do ativo em relação ao seu valor patrimonial. < 1.0 indica desconto."
                    className="text-[11px] font-mono flex items-center justify-between w-20 px-2 py-[3px] rounded-md ring-1 ring-inset ring-slate-700/50 bg-slate-800/40 cursor-pointer shadow-sm"
                  >
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tight">P/VP</span>
                    <span className={`tabular-nums font-bold ${(ativo.p_vp || 0) < 0.95 ? 'text-emerald-400' : (ativo.p_vp || 0) > 1.05 ? 'text-rose-400' : 'text-slate-300'}`}>{(ativo.p_vp || 0).toFixed(2)}</span>
                  </div>
                )}
                {atingiuMagic && (
                  <div
                    title="Número Mágico: Quantidade de cotas necessárias para que o rendimento pague uma nova cota do fundo."
                    className="text-[10px] flex items-center gap-1 justify-end w-20 px-1 text-cyan-400 font-bold cursor-pointer"
                  >
                    <Snowflake size={11} className="animate-pulse" />
                    <PrivateValue value={`${ativo.qtd}/${ativo.magic_number}`} className="tabular-nums" />
                  </div>
                )}
              </div>
            ) : tab === 'Ação' && ((ativo.vi_graham || 0) > 0 || (ativo.mg_graham || 0) !== 0) ? (
              <div className="flex flex-col items-end gap-1.5 w-full">
                <span
                  title="Margem de Graham: Desconto percentual da cotação atual em relação ao Valor Intrínseco de Graham."
                  className={`text-[11px] font-mono px-2 py-[3px] rounded-md ring-1 ring-inset cursor-pointer tabular-nums font-bold w-full max-w-[80px] text-center shadow-sm ${(ativo.mg_graham || 0) > 20 ? 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' : (ativo.mg_graham || 0) > 0 ? 'text-emerald-500 bg-emerald-500/5 ring-emerald-500/10' : 'text-rose-400 bg-rose-500/10 ring-rose-500/20'}`}
                >
                  {(ativo.mg_graham || 0) > 0 ? '+' : ''}{(ativo.mg_graham || 0).toFixed(0)}%
                </span>
                <span
                  title="V.I. (Valor Intrínseco): Valor justo teórico calculado pela fórmula clássica de Benjamin Graham."
                  className="text-[9px] text-slate-400 font-medium tracking-tighter cursor-pointer bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded flex items-center justify-between w-full max-w-[80px]"
                >
                  <span className="text-slate-500 uppercase">V.I</span>
                  <PrivateValue value={formatMoney(ativo.vi_graham || 0)} className="tabular-nums" />
                </span>
              </div>
            ) : <span className="text-slate-700">-</span>}
          </td>
        )}
      </tr>
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} ativo={ativo} />
    </>
  );
});

AssetRow.displayName = 'AssetRow';
