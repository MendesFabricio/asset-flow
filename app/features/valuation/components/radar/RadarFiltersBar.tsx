'use client';

import { Filter } from 'lucide-react';

interface RadarFiltersBarProps {
  search: string;
  assetType: string;
  sector: string;
  sectors: string[];
  onlyOutside: boolean;
  onSearchChange: (value: string) => void;
  onAssetTypeChange: (value: string) => void;
  onSectorChange: (value: string) => void;
  onOnlyOutsideChange: (value: boolean) => void;
}

export function RadarFiltersBar({
  search,
  assetType,
  sector,
  sectors,
  onlyOutside,
  onSearchChange,
  onAssetTypeChange,
  onSectorChange,
  onOnlyOutsideChange,
}: RadarFiltersBarProps) {
  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-3.5 flex flex-wrap items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-text-muted font-semibold">
        <Filter size={13} /> Filtros:
      </div>

      <input
        type="text"
        aria-label="Filtrar ticker ou nome no Radar B3"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Filtrar ticker ou nome..."
        className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-44"
      />

      <select
        aria-label="Filtrar por tipo de ativo"
        value={assetType}
        onChange={(e) => onAssetTypeChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary focus:outline-none focus:border-accent"
      >
        <option value="TODOS">Ações + FIIs</option>
        <option value="Ação">Somente Ações</option>
        <option value="FII">Somente FIIs</option>
      </select>

      <select
        aria-label="Filtrar por setor"
        value={sector}
        onChange={(e) => onSectorChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-text-primary focus:outline-none focus:border-accent"
      >
        <option value="TODOS">Todos os Setores</option>
        {sectors.map((sec) => (
          <option key={sec} value={sec}>
            {sec}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 cursor-pointer select-none text-text-primary ml-auto">
        <input
          type="checkbox"
          aria-label="Exibir apenas ativos fora da carteira"
          checked={onlyOutside}
          onChange={(e) => onOnlyOutsideChange(e.target.checked)}
          className="accent-accent"
        />
        <span>Apenas fora da carteira</span>
      </label>
    </div>
  );
}
