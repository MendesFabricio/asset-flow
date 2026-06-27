'use client';
import { Asset } from '../types';
import { AssetRow } from './AssetRow';

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
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl animate-in slide-in-from-bottom-4 mt-6">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
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
          <tbody className="divide-y divide-slate-800/50">
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
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  Nenhum ativo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
