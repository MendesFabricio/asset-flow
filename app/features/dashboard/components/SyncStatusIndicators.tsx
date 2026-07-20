'use client';

import { memo } from 'react';
import { RefreshCw, Brain } from 'lucide-react';

interface StatusShape {
  status: 'idle' | 'processing' | 'success' | 'error';
  message: string;
}

interface SyncStatusIndicatorsProps {
  syncStatus: StatusShape;
  fundamentalsStatus: StatusShape;
}

/**
 * Indicadores flutuantes (canto inferior esquerdo) para processos assíncronos
 * de sincronização CVM e atualização de múltiplos (Yahoo).
 */
export const SyncStatusIndicators = memo(function SyncStatusIndicators({
  syncStatus,
  fundamentalsStatus,
}: SyncStatusIndicatorsProps) {
  const syncProcessing = syncStatus.status === 'processing';
  const fundProcessing = fundamentalsStatus.status === 'processing';

  return (
    <>
      {syncProcessing && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-card border border-accent/30 shadow-md transition-all duration-300 animate-in slide-in-from-left-10 fade-in">
          <RefreshCw size={18} className="text-accent animate-spin" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
              Inteligência Operando
            </span>
            <span className="text-xs font-semibold text-slate-200 tabular-nums">
              {syncStatus.message || 'Processando lote de dados...'}
            </span>
          </div>
        </div>
      )}

      {fundProcessing && (
        <div
          className={`fixed ${syncProcessing ? 'bottom-24' : 'bottom-5'} left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-card border border-status-success/30 shadow-md transition-all duration-300 animate-in slide-in-from-left-10 fade-in`}
        >
          <Brain size={18} className="text-status-success animate-pulse" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-status-success">
              Valuation &amp; Múltiplos
            </span>
            <span className="text-xs font-semibold text-slate-200">
              {fundamentalsStatus.message || 'Conectando ao Yahoo Finance...'}
            </span>
          </div>
        </div>
      )}
    </>
  );
});
