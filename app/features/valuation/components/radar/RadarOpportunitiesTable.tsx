'use client';

import React from 'react';
import { Building2, Loader2, RefreshCw, Sparkles, Star, TrendingUp } from 'lucide-react';
import { ValuationAssetData } from '@/types';

interface RadarOpportunitiesTableProps {
  loading: boolean;
  totalCached: number;
  items: ValuationAssetData[];
  watchlistTickers: Set<string>;
  money: (val: number) => string;
  onRefresh: () => void;
  onSelectAsset: (ticker: string, assetType?: string) => void;
  onToggleWatchlist: (ticker: string, e?: React.MouseEvent) => void;
}

export function RadarOpportunitiesTable({
  loading,
  totalCached,
  items,
  watchlistTickers,
  money,
  onRefresh,
  onSelectAsset,
  onToggleWatchlist,
}: RadarOpportunitiesTableProps) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
      {loading ? (
        <div className="p-10 text-center text-xs text-text-muted flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin text-accent" />
          Carregando Radar B3...
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center space-y-3">
          <Sparkles size={28} className="mx-auto text-accent opacity-80" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-text-primary">
              {totalCached === 0 ? 'Cache do Radar B3 ainda vazio' : 'Nenhum ativo encontrado com esses filtros'}
            </p>
            <p className="text-xs text-text-muted">
              {totalCached === 0
                ? 'Clique em "Atualizar Radar B3" para buscar preços-teto, múltiplos e checklist dos ~107 papéis líquidos da Bolsa.'
                : 'Limpe os filtros ou digite qualquer ticker B3 no campo "Consultar" acima.'}
            </p>
          </div>
          {totalCached === 0 && (
            <button
              type="button"
              onClick={onRefresh}
              className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <RefreshCw size={13} /> Popular Radar Agora
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider border-b border-border-subtle sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3">Ativo</th>
                <th scope="col" className="px-4 py-3 text-right">Preço</th>
                <th scope="col" className="px-4 py-3 text-right">DY 12m</th>
                <th scope="col" className="px-4 py-3 text-right">Teto Bazin</th>
                <th scope="col" className="px-4 py-3 text-right">V.I. Graham / P/VP</th>
                <th scope="col" className="px-4 py-3 text-right">ROE / Magic</th>
                <th scope="col" className="px-4 py-3 text-right">Qualidade</th>
                <th scope="col" className="px-4 py-3 text-center w-12">Obs.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {items.map((item) => {
                const isFav = watchlistTickers.has(item.ticker);
                const mgBazin = item.margin_bazin_pct;
                const q = item.quality_score || 0;
                const qBarCls = q >= 75 ? 'bg-status-success' : q >= 50 ? 'bg-status-warning' : 'bg-status-error';

                return (
                  <tr
                    key={item.ticker}
                    onClick={() => onSelectAsset(item.ticker, item.asset_type)}
                    className="hover:bg-surface-elevated cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-text-primary">{item.ticker}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-input text-text-muted border border-border-subtle font-semibold">
                          {item.asset_type === 'FII' ? <Building2 size={10} className="inline mr-0.5" /> : <TrendingUp size={10} className="inline mr-0.5" />}
                          {item.asset_type}
                        </span>
                        {item.in_portfolio && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent-soft text-accent font-bold">
                            Em carteira
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted truncate max-w-[200px]">
                        {item.name} • {item.sector}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary whitespace-nowrap">
                      <div>{money(item.price)}</div>
                      {item.change_percent !== null && (
                        <div className={`text-[10px] ${item.change_percent >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                          {item.change_percent > 0 ? '+' : ''}
                          {item.change_percent.toFixed(2)}%
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-status-success whitespace-nowrap">
                      {item.dy_12m !== null ? `${item.dy_12m.toFixed(2)}%` : 'N/D'}
                    </td>

                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      <div className="font-semibold text-text-primary">{item.bazin_price ? money(item.bazin_price) : 'N/D'}</div>
                      {mgBazin !== null && mgBazin !== undefined && (
                        <div className={`text-[10px] font-bold ${mgBazin >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                          {mgBazin > 0 ? '+' : ''}
                          {mgBazin.toFixed(1)}%
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      {item.asset_type === 'FII' ? (
                        <span className={`font-bold ${(item.pvp || 9) <= 1.0 ? 'text-status-success' : 'text-text-primary'}`}>
                          {item.pvp ? `${item.pvp.toFixed(2)}x` : 'N/D'}
                        </span>
                      ) : (
                        <>
                          <div className="font-semibold text-text-primary">
                            {item.graham_price ? money(item.graham_price) : 'N/D'}
                          </div>
                          {item.margin_graham_pct !== null && item.margin_graham_pct !== undefined && (
                            <div className={`text-[10px] font-bold ${item.margin_graham_pct >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                              {item.margin_graham_pct > 0 ? '+' : ''}
                              {item.margin_graham_pct.toFixed(0)}%
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                      <div className="text-text-primary font-semibold">
                        {item.roe !== null ? `ROE ${item.roe.toFixed(1)}%` : item.pl !== null ? `P/L ${item.pl.toFixed(1)}x` : 'N/D'}
                      </div>
                      {item.magic_score !== null && (
                        <div className="text-[10px] text-accent font-bold">Magic: {item.magic_score.toFixed(0)} pts</div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono font-bold text-text-primary">{q}/100</span>
                        <div className="w-16 h-1.5 rounded-full bg-surface-input overflow-hidden">
                          <div className={`h-full ${qBarCls}`} style={{ width: `${Math.max(4, q)}%` }} />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => onToggleWatchlist(item.ticker, e)}
                        title={isFav ? 'Remover da Watchlist' : 'Adicionar à Watchlist'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isFav ? 'text-status-warning bg-status-warning/10' : 'text-text-muted hover:text-status-warning'
                        }`}
                      >
                        <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
