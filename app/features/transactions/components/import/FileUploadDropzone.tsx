'use client';

import { Upload, Database, Download, Check } from 'lucide-react';
import { ImportMode } from './types';

interface PdfDropzoneProps {
  importMode: Exclude<ImportMode, 'backup'>;
  isUploading: boolean;
  onSelectFile: () => void;
}

export function FileUploadDropzone({ importMode, isUploading, onSelectFile }: PdfDropzoneProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-border-subtle rounded-xl bg-surface-elevated/40 backdrop-blur-sm">
      <div className="p-4 bg-surface-card rounded-full text-text-muted mb-4 border border-border-subtle">
        <Upload size={32} />
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-2">
        {importMode === 'brokerage' ? 'Selecione suas Notas de Corretagem' : 'Selecione o Extrato da B3'}
      </h3>
      <p className="text-sm text-text-secondary text-center max-w-md mb-6">
        {importMode === 'brokerage'
          ? 'Envie as notas de corretagem (padrão SINACOR) em PDF. As operações serão extraídas automaticamente.'
          : 'Faça o download dos seus extratos de movimentação na Área logada da B3 e envie aqui para conciliação.'}
      </p>
      <button
        type="button"
        onClick={onSelectFile}
        disabled={isUploading}
        className={`px-6 py-3 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-white shadow-md ${
          importMode === 'brokerage' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'
        }`}
      >
        {isUploading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Processando...
          </>
        ) : (
          'Escolher Arquivos PDF'
        )}
      </button>
    </div>
  );
}

interface BackupRestorePanelProps {
  backupMode: 'replace' | 'merge';
  backupPayload: Record<string, unknown> | null;
  isImporting: boolean;
  onChangeBackupMode: (mode: 'replace' | 'merge') => void;
  onSelectBackupFile: () => void;
  onExportBackup: () => void;
  onRestoreBackup: () => void;
}

export function BackupRestorePanel({
  backupMode,
  backupPayload,
  isImporting,
  onChangeBackupMode,
  onSelectBackupFile,
  onExportBackup,
  onRestoreBackup,
}: BackupRestorePanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-5 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex p-2.5 rounded-lg bg-accent-soft text-accent">
            <Download size={20} />
          </div>
          <h3 className="text-base font-semibold text-text-primary">Baixar Histórico Tratado (.JSON)</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Exporta todas as transações conciliadas, eventos corporativos (desdobramentos, bonificações, cisões, trocas de ticker), proventos e posições atuais para migração sem retrabalho.
          </p>
        </div>
        <button
          type="button"
          onClick={onExportBackup}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent hover:opacity-90 text-white transition-opacity flex items-center justify-center gap-2"
        >
          <Download size={16} /> Baixar Histórico Tratado
        </button>
      </div>

      <div className="p-5 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex p-2.5 rounded-lg bg-emerald-500/10 text-status-success">
            <Database size={20} />
          </div>
          <h3 className="text-base font-semibold text-text-primary">Restaurar / Importar Histórico (.JSON)</h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Suba um arquivo JSON previamente exportado pelo AssetFlow para restaurar ou mesclar todo o seu histórico tratado.
          </p>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-1.5 text-xs text-text-primary cursor-pointer">
              <input
                type="radio"
                name="backupMode"
                checked={backupMode === 'replace'}
                onChange={() => onChangeBackupMode('replace')}
              />
              Substituir carteira atual
            </label>
            <label className="flex items-center gap-1.5 text-xs text-text-primary cursor-pointer">
              <input
                type="radio"
                name="backupMode"
                checked={backupMode === 'merge'}
                onChange={() => onChangeBackupMode('merge')}
              />
              Mesclar sem duplicar
            </label>
          </div>

          {backupPayload && (
            <div className="p-3 rounded-lg bg-surface-card border border-border-subtle text-xs space-y-1">
              <div className="font-semibold text-status-success flex items-center gap-1.5">
                <Check size={14} /> Arquivo pronto para restauração
              </div>
              <div className="grid grid-cols-2 gap-1 text-text-muted pt-1">
                <span>Posições: <strong className="text-text-primary">{Array.isArray(backupPayload.positions) ? backupPayload.positions.length : 0}</strong></span>
                <span>Transações: <strong className="text-text-primary">{Array.isArray(backupPayload.transactions) ? backupPayload.transactions.length : 0}</strong></span>
                <span>Eventos Corp.: <strong className="text-text-primary">{Array.isArray(backupPayload.corporate_events) ? backupPayload.corporate_events.length : 0}</strong></span>
                <span>Proventos: <strong className="text-text-primary">{Array.isArray(backupPayload.dividends) ? backupPayload.dividends.length : 0}</strong></span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectBackupFile}
            disabled={isImporting}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-elevated hover:bg-surface-input border border-border-subtle text-text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Upload size={16} /> {backupPayload ? 'Trocar JSON' : 'Selecionar JSON'}
          </button>
          {backupPayload && (
            <button
              type="button"
              onClick={onRestoreBackup}
              disabled={isImporting}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-status-success hover:opacity-90 text-white transition-opacity disabled:opacity-50"
            >
              {isImporting ? 'Restaurando...' : 'Confirmar Restauração'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
