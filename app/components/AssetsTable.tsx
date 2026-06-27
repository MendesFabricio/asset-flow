'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Asset } from '../types';
import { AssetRow } from './AssetRow';
import { Search } from 'lucide-react';

interface AssetsTableProps {
  assets: Asset[];
  tab: string;
  onEdit: (asset: Asset) => void;
  onViewNews: (ticker: string) => void;
  onViewDetails: (asset: Asset) => void;
}

export function AssetsTable({ assets, tab, onEdit, onViewNews, onViewDetails }: AssetsTableProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Cancela tab se for resumo ou telas de simulação
  const isExcludedTab = ['Resumo', 'Evolução', 'Correlação', 'Financeiro'].includes(tab);

  // Reseta busca ao trocar de categoria
  useEffect(() => {
    setSearch('');
    setDebouncedSearch('');
  }, [tab]);

  // Efeito de Debounce (300ms) para evitar re-renderizações desnecessárias do DOM
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Filtro performático usando useMemo com suporte a ticker ou tipo do ativo
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    
    // Filtra primeiro pela tab corrente
    const tabAssets = assets.filter((a) => a.tipo === tab);

    const query = debouncedSearch.toLowerCase().trim();
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
  }, [assets, tab, debouncedSearch]);

  if (isExcludedTab) return null;

  return (
    <div className="bg-slate-900/30 backdrop-blur-md rounded-2xl border border-slate-800/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 mt-6">
      
      {/* Barra de Busca Premium Integrada */}
      <div className="p-4 bg-slate-950/20 border-b border-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Ativos em {tab}</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 tabular-nums">
            {filteredAssets.length}
          </span>
        </div>
        <div className="relative w-full sm:w-72 group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder="Pesquisar por ticker ou setor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/10 text-slate-400/70 uppercase text-[10px] font-bold tracking-widest border-b border-slate-800/40">
            <tr>
              <th className="p-4 pl-6">Ativo</th>
              <th className="p-4 text-right">Minha Posição</th>
              <th className="p-4 text-right hidden sm:table-cell">Preço</th>
              <th className="p-4 text-right">Resultados</th>
              <th className="p-4 text-right hidden md:table-cell">Meta</th>
              <th className="p-4 text-right">Aporte</th>
              {(tab === 'Ação' || tab === 'FII') && <th className="p-4 text-center hidden lg:table-cell w-24">Indicadores</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {filteredAssets.length > 0 ? (
              filteredAssets.map((ativo, index) => (
                <AssetRow
                  key={ativo.ticker}
                  ativo={ativo}
                  tab={tab}
                  onEdit={onEdit}
                  onViewNews={onViewNews}
                  onViewDetails={onViewDetails}
                  index={index}
                  total={filteredAssets.length}
                />
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2.5 max-w-xs mx-auto">
                    <div className="p-3 bg-slate-950/50 rounded-full border border-slate-800/60 text-slate-400">
                      <Search size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sem correspondências</p>
                      <p className="text-[11px] text-slate-600 mt-1 leading-normal">Não encontramos nenhum ativo nesta categoria com o termo digitado.</p>
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
}
