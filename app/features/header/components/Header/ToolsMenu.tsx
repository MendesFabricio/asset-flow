'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronDown, Briefcase, FileText, TrendingUp, PieChart, 
  Layers, Brain, RefreshCw, Calendar, Settings, Terminal, ShieldCheck
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { UnifiedImportModal } from '@/features/transactions/components/UnifiedImportModal';

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
}

export function ToolsMenu({
  onSyncReports,
  onUpdateFundamentals,
  onManualRefresh,
  onOpenSmartModal,
  onOpenAddModal,
  onOpenCorporateAction,
  syncStatus,
  fundamentalsStatus,
  loading,
  isRefetching,
  showRefreshSuccess
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
        className={`bg-slate-900/60 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-slate-800 shadow-sm ${
          isSyncActive ? 'border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)] text-white' : ''
        }`}
      >
        <span className="relative flex items-center gap-1.5 select-none">
          Ferramentas
          {isSyncActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-950 border border-slate-800/80 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.75)] p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 ease-out">
          <div className="space-y-4">
            
            {/* SEÇÃO GESTÃO */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <Briefcase size={10} className="text-slate-500" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Gestão de Carteira</span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onManualRefresh();
                    setIsOpen(false);
                  }}
                  disabled={loading || isRefetching || showRefreshSuccess}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={`${(loading || isRefetching) ? 'animate-spin text-blue-400' : 'text-blue-400'} ${showRefreshSuccess ? 'text-emerald-400' : ''}`} />
                  <div>
                    <p className="font-bold">Recarregar Carteira</p>
                    <p className="text-[9px] text-slate-500">Recalcular preços e cotações ativas</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(true);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                >
                  <FileText size={14} className="text-blue-400" />
                  <div>
                    <p className="font-bold flex items-center gap-1.5">
                      <span>Importação de Notas (B3/Corretagem)</span>
                      <span className="px-1 py-0.2 bg-blue-500/10 border border-blue-500/20 text-[8px] text-blue-400 rounded-md font-bold uppercase">Novo</span>
                    </p>
                    <p className="text-[9px] text-slate-500">Leitor OCR SINACOR & Conciliação B3</p>
                  </div>
                </button>

                {onOpenCorporateAction && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenCorporateAction();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                  >
                    <Layers size={14} className="text-purple-400" />
                    <div>
                      <p className="font-bold flex items-center gap-1.5">
                        <span>Eventos Corporativos</span>
                        <span className="px-1 py-0.2 bg-purple-500/10 border border-purple-500/20 text-[8px] text-purple-400 rounded-md font-bold uppercase">Novo</span>
                      </p>
                      <p className="text-[9px] text-slate-500">Splits, Inplits, Bonificações e Incorporações</p>
                    </div>
                  </button>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-900" />

            {/* SEÇÃO INTELIGÊNCIA */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <TrendingUp size={10} className="text-slate-500" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Inteligência Financeira</span>
              </div>
              <div className="space-y-1">
                <Link
                  href="/agenda"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                >
                  <Calendar size={14} className="text-indigo-400" />
                  <div>
                    <p className="font-bold">Proventos & Renda Passiva</p>
                    <p className="text-[9px] text-slate-500">Histórico de dividendos e yield futuro</p>
                  </div>
                </Link>

                <Link
                  href="/tax"
                  onClick={() => setIsOpen(false)}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                >
                  <FileText size={14} className="text-rose-400" />
                  <div>
                    <p className="font-bold">Imposto de Renda (DARF)</p>
                    <p className="text-[9px] text-slate-500">Gestão de DARF e IRPF Anual</p>
                  </div>
                </Link>


                <button
                  type="button"
                  onClick={() => {
                    onOpenSmartModal();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                >
                  <TrendingUp size={14} className="text-amber-400" />
                  <div>
                    <p className="font-bold">Otimização de Aportes</p>
                    <p className="text-[9px] text-slate-500">Alocação inteligente baseada em Markowitz</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-900" />

            {/* SEÇÃO SISTEMA */}
            <div>
              <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
                <Settings size={10} className="text-slate-500" />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Sincronizadores</span>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSyncReports();
                    setIsOpen(false);
                  }}
                  disabled={syncingReports}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <Layers size={14} className={syncingReports ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold flex items-center justify-between">
                      <span>CVM (FNET Sync)</span>
                      {syncingReports && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
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
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <Brain size={14} className={updatingFundamentals ? 'animate-pulse text-rose-400' : 'text-rose-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold flex items-center justify-between">
                      <span>Metadados Yahoo Finance</span>
                      {updatingFundamentals && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
                    </p>
                    <p className="text-[9px] text-slate-500 truncate">
                      {updatingFundamentals ? fundamentalsStatus.message : "Busca de dividendos históricos"}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    notify('O console de logs do desenvolvedor está em desenvolvimento para o painel administrativo Pro.', 'info');
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-900/60 transition-colors flex items-center gap-2.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  <Terminal size={14} className="text-slate-500" />
                  <div>
                    <p className="font-bold">Dev Console Logs</p>
                    <p className="text-[9px] text-slate-500">Restrito a administrador local</p>
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
