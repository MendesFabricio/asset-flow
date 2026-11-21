'use client';

import { Plus } from 'lucide-react';

interface NewAssetButtonProps {
  onClick: () => void;
}

export function NewAssetButton({ onClick }: NewAssetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-accent hover:bg-accent/90 text-white px-3.5 py-2 rounded-lg transition-colors duration-150 flex items-center gap-1.5 text-xs font-semibold select-none"
    >
      <Plus size={15} strokeWidth={2.5} />
      <span className="hidden sm:inline">Novo Ativo</span>
    </button>
  );
}
