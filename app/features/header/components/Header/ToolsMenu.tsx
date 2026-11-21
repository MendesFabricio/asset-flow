'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronDown, Briefcase, FileText, TrendingUp, 
  Layers, Brain, RefreshCw, Calendar, Settings,
  Download, Database
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { apiCall } from '@/lib/api';
import { UnifiedImportModal } from '@/features/transactions/components/UnifiedImportModal';
import { Asset } from '@/types';

interface ToolsMenuProps {
  onSyncReports: () => void;
  onUpdateFundamentals: () => void;
  onManualRefresh: () => void;
  onOpenSmartModal: () => void;
  onOpenAddModal: () => void;
  onOpenCorporateAction?: () => void;
  syncStatus: { status: 'idle' | 'processing' | 'success' | 'error'; message: string };
  fundamentalsStatus: { status: 'idle' | 'processing' | 'success' | 'error'; message: string };
  loading: boolean;
  isRefetching: boolean;
  showRefreshSuccess: boolean;
  ativos?: Asset[];
}

function exportPortfolioCSV(ativos: Asset[]) {
  const totalGeral = ativos.reduce((acc, a) => acc + (a.total_atual || 0), 0);

  const header = ['Ticker', 'Tipo', 'Quantidade', 'Preço Médio (R$)', 'Valor Investido (R$)', 'Preço Atual (R$)', 'Valor Atual (R$)', 'Lucro/Prejuízo (R$)', 'Lucro/Prejuízo (%)', '% na Carteira'];
  const rows = ativos.map((a) => {
    const pctCarteira = totalGeral > 0 ? ((a.total_atual || 0) / totalGeral) * 100 : 0;
    return [
      a.ticker,
      a.tipo,
      a.qtd.toString().replace('.', ','),
      (a.pm || 0).toFixed(2).replace('.', ','),
      (a.total_investido || 0).toFixed(2).replace('.', ','),
      (a.preco_atual || 0).toFixed(2).replace('.', ','),
      (a.total_atual || 0).toFixed(2).replace('.', ','),
      (a.lucro_valor || 0).toFixed(2).replace('.', ','),
      (a.lucro_pct || 0).toFixed(2).replace('.', ','),
      pctCarteira.toFixed(2).replace('.', ','),
    ];
  });

  const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(';')).join('\n');
  const bom = '\uFEFF'; // UTF-8 BOM para Excel
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `carteira_${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportTreatedHistoryJSON(
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void
) {
  try {
    const payload = await apiCall<Record<string, unknown>>('/api/portfolio/export-history');
    const jsonText = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `historico_tratado_${date}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('Histórico tratado exportado com sucesso!', 'success');
  } catch {
    notify('Erro ao exportar histórico tratado.', 'error');
  }
}

export function ToolsMenu({
  onSyncReports,
  onUpdateFundamentals,
  onManualRefresh,
  onOpenSmartModal,
  onOpenCorporateAction,
  syncStatus,
  fundamentalsStatus,
  loading,
  isRefetching,
  showRefreshSuccess,
  ativos = [],
}: ToolsMenuProps) {
  const { notify } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const syncingReports = syncStatus.status === 'processing';
  const updatingFundamentals = fundamentalsStatus.status === 'processing';
  const isSyncActive = syncingReports || updatingFundamentals;

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Menu de ferramentas"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`bg-surface-card hover:bg-surface-elevated text-text-primary px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-semibold border border-border-subtle ${
          isSyncActive ? 'border-accent/50' : ''
        }`}
      >
        <span className="relative flex items-center gap-1.5 select-none">
          Ferramentas
          {isSyncActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-[calc(100vh-5rem)] overflow-y-auto bg-surface-card border border-border-subtle rounded-xl shadow-lg p-4 z-50">
          <div className="space-y-4">
            
            {/* SEÇÃO GESTÃO */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <Briefcase size={10} className="text-text-muted" />
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Gestão de Carteira</span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onManualRefresh();
                    setIsOpen(false);
                  }}
                  disabled={loading || isRefetching || showRefreshSuccess}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary disabled:opacity-50"
                >
                  <RefreshCw size={14} className={`${(loading || isRefetching) ? 'animate-spin text-accent' : 'text-accent'} ${showRefreshSuccess ? 'text-status-success' : ''}`} />
                  <div>
                    <p className="font-semibold">Recarregar Carteira</p>
                    <p className="text-2xs text-text-muted">Recalcular preços e cotações ativas</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(true);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <FileText size={14} className="text-accent" />
                  <div>
                    <p className="font-semibold flex items-center gap-1.5">
                      <span className="whitespace-nowrap">Importação de Notas (B3)</span>
                      <span className="px-1.5 py-0.5 bg-accent/15 border border-accent/30 text-2xs text-accent rounded-md font-semibold uppercase shrink-0">Novo</span>
                    </p>
                    <p className="text-2xs text-text-muted">Leitor OCR SINACOR & Conciliação B3</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (ativos.length === 0) {
                      notify('Nenhuma posição encontrada para exportar.', 'info');
                    } else {
                      exportPortfolioCSV(ativos);
                      notify(`Carteira exportada com ${ativos.length} posições.`, 'success');
                    }
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <Download size={14} className="text-status-success" />
                  <div>
                    <p className="font-semibold">Exportar Posições (CSV)</p>
                    <p className="text-2xs text-text-muted">Valor investido, atual, qtd e % da carteira</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsOpen(false);
                    await exportTreatedHistoryJSON(notify);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <Database size={14} className="text-accent" />
                  <div>
                    <p className="font-semibold">Exportar Histórico Tratado (JSON)</p>
                    <p className="text-2xs text-text-muted">Transações, eventos corporativos e proventos</p>
                  </div>
                </button>

                {onOpenCorporateAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenCorporateAction();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                  >
                    <Layers size={14} className="text-purple-400" />
                    <div>
                      <p className="font-semibold flex items-center gap-1.5">
                        <span>Eventos Corporativos</span>
                        <span className="px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/20 text-2xs text-purple-400 rounded-md font-semibold uppercase">Novo</span>
                      </p>
                      <p className="text-2xs text-text-muted">Splits, Inplits, Bonificações e Incorporações</p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-border-subtle" />

            {/* SEÇÃO INTELIGÊNCIA */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <TrendingUp size={10} className="text-text-muted" />
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Inteligência Financeira</span>
              </div>
              <div className="space-y-1">
                <Link
                  href="/agenda"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <Calendar size={14} className="text-indigo-400" />
                  <div>
                    <p className="font-semibold">Proventos & Renda Passiva</p>
                    <p className="text-2xs text-text-muted">Histórico de dividendos e yield futuro</p>
                  </div>
                </Link>

                <Link
                  href="/tax"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <FileText size={14} className="text-status-error" />
                  <div>
                    <p className="font-semibold">Imposto de Renda (DARF)</p>
                    <p className="text-2xs text-text-muted">Gestão de DARF e IRPF Anual</p>
                  </div>
                </Link>


                <button
                  type="button"
                  onClick={() => {
                    onOpenSmartModal();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary"
                >
                  <TrendingUp size={14} className="text-status-warning" />
                  <div>
                    <p className="font-semibold">Otimização de Aportes</p>
                    <p className="text-2xs text-text-muted">Alocação inteligente baseada em Markowitz</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="h-px bg-border-subtle" />

            {/* SEÇÃO SISTEMA */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <Settings size={10} className="text-text-muted" />
                <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Sincronizadores</span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSyncReports();
                    setIsOpen(false);
                  }}
                  disabled={syncingReports}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary disabled:opacity-50"
                >
                  <Layers size={14} className={syncingReports ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold flex items-center justify-between">
                      <span>CVM (FNET Sync)</span>
                      {syncingReports && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                    </p>
                    <p className="text-2xs text-text-muted truncate">
                      {syncingReports ? syncStatus.message : "Fatos relevantes e PDFs de Fundos"}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onUpdateFundamentals();
                    setIsOpen(false);
                  }}
                  disabled={updatingFundamentals}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-elevated transition-colors flex items-center gap-2.5 text-xs text-text-primary disabled:opacity-50"
                >
                  <Brain size={14} className={updatingFundamentals ? 'animate-pulse text-status-error' : 'text-status-error'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold flex items-center justify-between">
                      <span>Metadados Yahoo Finance</span>
                      {updatingFundamentals && <span className="w-1.5 h-1.5 rounded-full bg-status-error animate-pulse" />}
                    </p>
                    <p className="text-2xs text-text-muted truncate">
                      {updatingFundamentals ? fundamentalsStatus.message : "Busca de dividendos históricos"}
                    </p>
                  </div>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <UnifiedImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onSuccess={() => {
          setIsImportModalOpen(false);
          onManualRefresh();
        }}
      />
    </div>
  );
}
