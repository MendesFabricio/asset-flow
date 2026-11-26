'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, ShieldCheck, FileText, Database } from 'lucide-react';
import { CorporateActionGlobalModal } from '@/features/assets/components/CorporateActionGlobalModal';
import { useUnifiedImport } from './import/useUnifiedImport';
import { FileUploadDropzone, BackupRestorePanel } from './import/FileUploadDropzone';
import { BrokeragePreviewTable } from './import/BrokeragePreviewTable';
import { B3ReconciliationPanel } from './import/B3ReconciliationPanel';

interface UnifiedImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UnifiedImportModal({ isOpen, onClose, onSuccess }: UnifiedImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const {
    importMode,
    switchMode,
    isUploading,
    isImporting,
    backupPayload,
    backupMode,
    setBackupMode,
    brokerageTxs,
    setBrokerageTxs,
    dividends,
    b3Transactions,
    setB3Transactions,
    corporateEvents,
    b3ActiveTab,
    setB3ActiveTab,
    showOnlyMissing,
    setShowOnlyMissing,
    mounted,
    userAssets,
    activeCorpEvent,
    isCorpModalOpen,
    setIsCorpModalOpen,
    handleFileChange,
    handleImportBrokerage,
    handleImportDividends,
    handleOpenCorpModal,
    handleImportB3Transactions,
    handleCorpSuccess,
    handleIgnoreCorpEvent,
    handleExportBackup,
    handleBackupFileChange,
    handleRestoreBackup,
  } = useUnifiedImport(onSuccess, onClose);

  if (!isOpen || !mounted) return null;

  const hasLoadedData =
    brokerageTxs.length > 0 ||
    b3Transactions.length > 0 ||
    dividends.length > 0 ||
    corporateEvents.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 dark:bg-black/75 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-w-5xl bg-surface-card/95 backdrop-blur-2xl border border-border-subtle rounded-2xl shadow-2xl shadow-black/60 flex flex-col text-left my-8">
          <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0 bg-surface-card/95 backdrop-blur-xl sticky top-0 z-10 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  importMode === 'brokerage'
                    ? 'bg-blue-500/10 text-blue-400'
                    : importMode === 'b3'
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-accent-soft text-accent'
                }`}
              >
                {importMode === 'brokerage' ? (
                  <FileText size={20} />
                ) : importMode === 'b3' ? (
                  <ShieldCheck size={20} />
                ) : (
                  <Database size={20} />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold font-heading text-text-primary">Importação e Conciliação</h2>
                <div className="flex flex-wrap items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'brokerage'}
                      onChange={() => switchMode('brokerage')}
                      className="text-blue-500 bg-surface-input border-border-subtle"
                    />
                    Nota de Corretagem
                  </label>
                  <label className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'b3'}
                      onChange={() => switchMode('b3')}
                      className="text-purple-500 bg-surface-input border-border-subtle"
                    />
                    Extrato B3
                  </label>
                  <label className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary cursor-pointer">
                    <input
                      type="radio"
                      name="mode"
                      checked={importMode === 'backup'}
                      onChange={() => switchMode('backup')}
                      className="text-accent bg-surface-input border-border-subtle"
                    />
                    Histórico Tratado (Backup)
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasLoadedData && importMode !== 'backup' && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-3 py-1.5 text-xs font-medium text-text-primary bg-surface-elevated hover:bg-surface-input border border-border-subtle rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Upload size={14} /> Outro Arquivo
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <input
            type="file"
            ref={backupInputRef}
            accept=".json,application/json"
            className="hidden"
            onChange={handleBackupFileChange}
            disabled={isImporting}
          />

          <div className="p-5 overflow-y-auto max-h-[65vh]">
            {importMode === 'backup' ? (
              <BackupRestorePanel
                backupMode={backupMode}
                backupPayload={backupPayload}
                isImporting={isImporting}
                onChangeBackupMode={setBackupMode}
                onSelectBackupFile={() => backupInputRef.current?.click()}
                onExportBackup={handleExportBackup}
                onRestoreBackup={handleRestoreBackup}
              />
            ) : !hasLoadedData ? (
              <FileUploadDropzone
                importMode={importMode}
                isUploading={isUploading}
                onSelectFile={() => fileInputRef.current?.click()}
              />
            ) : importMode === 'brokerage' ? (
              <BrokeragePreviewTable
                transactions={brokerageTxs}
                onChangeTransactions={setBrokerageTxs}
                onRemoveTransaction={(idx) =>
                  setBrokerageTxs((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            ) : (
              <B3ReconciliationPanel
                activeTab={b3ActiveTab}
                showOnlyMissing={showOnlyMissing}
                b3Transactions={b3Transactions}
                dividends={dividends}
                corporateEvents={corporateEvents}
                onChangeTab={setB3ActiveTab}
                onToggleOnlyMissing={setShowOnlyMissing}
                onChangeB3Transactions={setB3Transactions}
                onOpenCorpModal={handleOpenCorpModal}
                onIgnoreCorpEvent={handleIgnoreCorpEvent}
              />
            )}
          </div>

          {hasLoadedData && importMode !== 'backup' && (
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-elevated/50 backdrop-blur-md rounded-b-2xl mt-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isImporting}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-lg transition-colors"
              >
                Fechar
              </button>

              {importMode === 'brokerage' && brokerageTxs.length > 0 && (
                <button
                  type="button"
                  onClick={handleImportBrokerage}
                  disabled={isImporting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {isImporting
                    ? 'Importando...'
                    : `Confirmar ${brokerageTxs.filter((t) => !t.error || t.error.includes('DUPLICATE')).length} Operações`}
                </button>
              )}

              {importMode === 'b3' &&
                b3ActiveTab === 'auditoria' &&
                b3Transactions.some((d) => !d.db_matched && d.error !== 'SUCCESS') && (
                  <button
                    type="button"
                    onClick={handleImportB3Transactions}
                    disabled={isImporting}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {isImporting
                      ? 'Importando...'
                      : `Importar ${b3Transactions.filter((t) => !t.db_matched && t.error !== 'SUCCESS').length} Operações Faltantes da B3`}
                  </button>
                )}

              {importMode === 'b3' &&
                b3ActiveTab === 'proventos' &&
                dividends.some((d) => !d.db_matched && d.error !== 'SUCCESS') && (
                  <button
                    type="button"
                    onClick={handleImportDividends}
                    disabled={isImporting}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {isImporting ? 'Salvando...' : 'Importar Proventos Pendentes'}
                  </button>
                )}
            </div>
          )}

          {isCorpModalOpen && (
            <CorporateActionGlobalModal
              isOpen={isCorpModalOpen}
              onClose={() => setIsCorpModalOpen(false)}
              onSuccess={handleCorpSuccess}
              assets={userAssets}
              initialData={activeCorpEvent || undefined}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
