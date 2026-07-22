import { create } from 'zustand';
import { Asset } from '../types';

interface ModalState {
  isAddModalOpen: boolean;
  isSmartModalOpen: boolean;
  isCorporateActionModalOpen: boolean;
  editingAsset: Asset | null;
  selectedDetailsAsset: Asset | null;
  newsTicker: string | null;

  setAddModalOpen: (open: boolean) => void;
  setSmartModalOpen: (open: boolean) => void;
  setCorporateActionModalOpen: (open: boolean) => void;
  setEditingAsset: (asset: Asset | null) => void;
  setSelectedDetailsAsset: (asset: Asset | null) => void;
  setNewsTicker: (ticker: string | null) => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isAddModalOpen: false,
  isSmartModalOpen: false,
  isCorporateActionModalOpen: false,
  editingAsset: null,
  selectedDetailsAsset: null,
  newsTicker: null,

  setAddModalOpen: (open) => set({ isAddModalOpen: open }),
  setSmartModalOpen: (open) => set({ isSmartModalOpen: open }),
  setCorporateActionModalOpen: (open) => set({ isCorporateActionModalOpen: open }),
  setEditingAsset: (asset) => set({ editingAsset: asset }),
  setSelectedDetailsAsset: (asset) => set({ selectedDetailsAsset: asset }),
  setNewsTicker: (ticker) => set({ newsTicker: ticker }),
}));
