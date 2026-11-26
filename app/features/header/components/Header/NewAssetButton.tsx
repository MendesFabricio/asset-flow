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
      className="h-9 bg-blue-600 hover:bg-blue-500 text-white px-3.5 rounded-xl transition-colors duration-150 flex items-center gap-1.5 text-xs font-bold shadow-sm select-none"
    >
      <Plus size={15} strokeWidth={2.5} />
      <span className="hidden sm:inline">Novo Ativo</span>
    </button>
  );
}
