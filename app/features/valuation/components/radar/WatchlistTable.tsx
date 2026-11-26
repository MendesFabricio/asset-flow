'use client';

import React from 'react';
import { Star, Trash2 } from 'lucide-react';
import { WatchlistEntry } from '@/types';

interface WatchlistTableProps {
  watchlist: WatchlistEntry[];
  money: (val: number) => string;
  onSelectAsset: (ticker: string, assetType?: string) => void;
  onRemove: (ticker: string, e?: React.MouseEvent) => void;
}

export function WatchlistTable({ watchlist, money, onSelectAsset, onRemove }: WatchlistTableProps) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
      {watchlist.length === 0 ? (
        <div className="p-10 text-center space-y-2 text-text-muted text-sm">
          <Star size={28} className="mx-auto text-status-warning opacity-70" />
          <p className="font-semibold text-text-primary">Sua Watchlist está vazia</p>
          <p className="text-xs">
            Clique na estrela de qualquer ativo no Radar B3 ou consulte um ticker acima para monitorar oportunidades.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider border-b border-border-subtle">
              <tr>
                <th scope="col" className="px-4 py-3">Ativo</th>
                <th scope="col" className="px-4 py-3 text-right">Cotação</th>
                <th scope="col" className="px-4 py-3 text-right">DY Desejado</th>
                <th scope="col" className="px-4 py-3 text-right">Preço Teto Alvo</th>
                <th scope="col" className="px-4 py-3 text-right">Margem</th>
                <th scope="col" className="px-4 py-3 text-right">Qualidade</th>
                <th scope="col" className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {watchlist.map((w) => {
                const m = w.market || {};
                const discount = w.discount_pct;
                return (
                  <tr
                    key={w.id}
                    onClick={() => onSelectAsset(w.ticker, m.asset_type)}
                    className="hover:bg-surface-elevated cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-bold text-text-primary">{w.ticker}</div>
                      <div className="text-[10px] text-text-muted">{m.name || m.sector || 'B3'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-text-primary">
                      {m.price ? money(m.price) : 'N/D'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-text-muted">
                      {w.desired_bazin_dy.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      {w.effective_target_price ? money(w.effective_target_price) : 'N/D'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {discount !== null && discount !== undefined ? (
                        <span className={discount >= 0 ? 'text-status-success' : 'text-status-error'}>
                          {discount > 0 ? '+' : ''}
                          {discount.toFixed(1)}%
                        </span>
                      ) : (
                        'N/D'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-text-primary">
                      {m.quality_score ?? 0}/100
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => onRemove(w.ticker, e)}
                        title="Remover da Watchlist"
                        className="p-1.5 rounded-lg text-text-muted hover:text-status-error hover:bg-status-error/10 transition-colors"
                      >
                        <Trash2 size={14} />
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
