'use client';

import dynamic from 'next/dynamic';
import { ModalSkeleton, NewsPanelSkeleton } from '@/components/ui/Skeletons';
import { Asset } from '@/types';

const EditModal = dynamic(
  () => import('@/features/assets/components/EditModal').then((mod) => mod.EditModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
const AddAssetModal = dynamic(
  () => import('@/features/assets/components/AddAssetModal').then((mod) => mod.AddAssetModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
const CorporateActionGlobalModal = dynamic(
  () => import('@/features/assets/components/CorporateActionGlobalModal').then((mod) => mod.CorporateActionGlobalModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
const AssetNewsPanel = dynamic(
  () => import('@/features/news/AssetNewsPanel').then((mod) => mod.AssetNewsPanel),
  { ssr: false, loading: () => <NewsPanelSkeleton /> }
);
const SmartAllocationModal = dynamic(
  () => import('@/components/SmartAllocationModal').then((mod) => mod.SmartAllocationModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);
const AssetDetailsModal = dynamic(
  () => import('@/features/assets/components/AssetDetailsModal').then((mod) => mod.AssetDetailsModal),
  { ssr: false, loading: () => <ModalSkeleton /> }
);

interface PortfolioModalsProps {
  ativos: Asset[];
  editingAsset: Asset | null;
  selectedDetailsAsset: Asset | null;
  newsTicker: string | null;
  isAddModalOpen: boolean;
  isSmartModalOpen: boolean;
  isCorporateActionModalOpen: boolean;
  onCloseEditing: () => void;
  onCloseDetails: () => void;
  onCloseNews: () => void;
  onCloseAdd: () => void;
  onCloseSmart: () => void;
  onCloseCorporateAction: () => void;
  onRefetch: () => void;
}

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export function PortfolioModals({
  ativos,
  editingAsset,
  selectedDetailsAsset,
  newsTicker,
  isAddModalOpen,
  isSmartModalOpen,
  isCorporateActionModalOpen,
  onCloseEditing,
  onCloseDetails,
  onCloseNews,
  onCloseAdd,
  onCloseSmart,
  onCloseCorporateAction,
  onRefetch,
}: PortfolioModalsProps) {
  return (
    <>
      {!!editingAsset && (
        <ErrorBoundary>
          <EditModal
            isOpen={true}
            onClose={onCloseEditing}
            onSave={onRefetch}
            ativo={editingAsset}
            allAssets={ativos}
          />
        </ErrorBoundary>
      )}
      {isAddModalOpen && (
        <ErrorBoundary>
          <AddAssetModal isOpen={true} onClose={onCloseAdd} onSuccess={onRefetch} />
        </ErrorBoundary>
      )}
      {isCorporateActionModalOpen && (
        <ErrorBoundary>
          <CorporateActionGlobalModal isOpen={true} onClose={onCloseCorporateAction} onSuccess={onRefetch} assets={ativos} />
        </ErrorBoundary>
      )}
      {!!newsTicker && (
        <ErrorBoundary>
          <AssetNewsPanel ticker={newsTicker} onClose={onCloseNews} />
        </ErrorBoundary>
      )}
      {isSmartModalOpen && (
        <ErrorBoundary>
          <SmartAllocationModal isOpen={true} onClose={onCloseSmart} />
        </ErrorBoundary>
      )}
      {!!selectedDetailsAsset && (
        <ErrorBoundary>
          <AssetDetailsModal
            isOpen={true}
            onClose={onCloseDetails}
            asset={selectedDetailsAsset}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
