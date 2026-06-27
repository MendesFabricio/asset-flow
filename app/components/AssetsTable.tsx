'use client';
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
  if (['Resumo', 'Evolução', 'Correlação', 'Financeiro'].includes(tab)) return null;

  return (
    <div className="bg-slate-900/30 backdrop-blur-md rounded-2xl border border-slate-800/40 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 mt-6">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/20 text-slate-400/70 uppercase text-[10px] font-bold tracking-widest border-b border-slate-800/40">
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
            {assets.length > 0 ? (
              assets.map((ativo, index) => (
                <AssetRow
                  key={ativo.ticker}
                  ativo={ativo}
                  tab={tab}
                  onEdit={onEdit}
                  onViewNews={onViewNews}
                  onViewDetails={onViewDetails}
                  index={index}
                  total={assets.length}
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
                      <p className="text-[11px] text-slate-600 mt-1 leading-normal">Não encontramos nenhum ativo nesta categoria com o nome pesquisado.</p>
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
