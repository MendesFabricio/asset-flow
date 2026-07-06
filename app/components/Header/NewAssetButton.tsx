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
      className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg transition-all duration-150 flex items-center gap-1.5 text-xs font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] select-none"
    >
      <Plus size={15} strokeWidth={2.5} />
      <span className="hidden sm:inline">Novo Ativo</span>
    </button>
  );
}
