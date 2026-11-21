'use client';
import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { Asset } from '../types';
import { AssetRow } from '../features/assets/components/AssetRow';
import { PORTFOLIO_ASSET_TABS } from '../features/dashboard/hooks/useDashboardState';
import { Search } from 'lucide-react';

interface AssetsTableProps {
  assets: Asset[];
  tab: string;
  onEdit: (asset: Asset) => void;
  onViewNews: (ticker: string) => void;
  onViewDetails: (asset: Asset) => void;
}

export const AssetsTable = React.memo(({ assets, tab, onEdit, onViewNews, onViewDetails }: AssetsTableProps) => {
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  // Apenas exibe a tabela nas abas de classes de ativos
  const isExcludedTab = !(PORTFOLIO_ASSET_TABS as readonly string[]).includes(tab);

  // Reseta busca ao trocar de categoria
  useEffect(() => {
    setSearch('');
    setSearchQuery('');
  }, [tab]);

  // Função para digitação prioritária e filtragem em background
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    startTransition(() => {
      setSearchQuery(val);
    });
  };

  // Filtro performático usando useMemo com suporte a ticker ou tipo do ativo
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    // Filtra primeiro pela tab corrente
    const tabAssets = assets.filter((a) => a.tipo === tab);

    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return tabAssets.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return tabAssets
      .filter(
        (a) =>
          a.ticker.toLowerCase().includes(query) ||
          (a.tipo && a.tipo.toLowerCase().includes(query))
      )
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [assets, tab, searchQuery]);

  if (isExcludedTab) return null;

  return (
    <div className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden shadow-sm mt-6">

      {/* Barra de Busca Integrada */}
      <div className="p-4 bg-surface-elevated border-b border-border-subtle flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Meus Ativos</span>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/20 tabular-nums">
            {filteredAssets.length}
          </span>
        </div>
        <div className="relative w-full sm:w-72 group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="Pesquisar por ticker ou categoria..."
            value={search}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-10 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
          {isPending && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs font-semibold text-accent uppercase tracking-wider animate-pulse pointer-events-none">
              Filtrando...
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-elevated text-text-muted uppercase text-2xs font-semibold tracking-wider border-b border-border-subtle sticky top-0 z-10">
            <tr>
              <th className="px-6 py-5">Ativo</th>
              <th className="px-6 py-5 text-right">Minha Posição</th>
              <th className="px-6 py-5 text-right hidden sm:table-cell">Preço</th>
              <th className="px-6 py-5 text-right">Resultados</th>
              <th className="px-6 py-5 text-right hidden md:table-cell">Meta</th>
              <th className="px-6 py-5 text-right">Aporte</th>
              {(tab === 'Ação' || tab === 'FII') && <th className="px-6 py-5 text-center hidden lg:table-cell w-24">Indicadores</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((ativo) => (
                <AssetRow
                  key={ativo.ticker}
                  ativo={ativo}
                  tab={tab}
                  onEdit={onEdit}
                  onViewNews={onViewNews}
                  onViewDetails={onViewDetails}
                />
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center text-text-muted gap-2.5 max-w-xs mx-auto">
                    <div className="p-3 bg-surface-elevated rounded-lg border border-border-subtle text-text-muted">
                      <Search size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text-primary uppercase tracking-wider">Sem correspondências</p>
                      <p className="text-2xs text-text-muted mt-1 leading-normal">Não encontramos nenhum ativo nesta categoria com o termo digitado.</p>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

AssetsTable.displayName = 'AssetsTable';
