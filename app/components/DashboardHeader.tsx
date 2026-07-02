'use client';
import { useState, useRef, useEffect } from 'react';
import { Wallet, Calendar, TrendingUp, Calculator, PlusCircle, EyeOff, Eye, Layers, Brain, RefreshCw, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { MarketTicker } from './MarketTicker';
import { TradingHoursWidget } from './TradingHoursWidget';
import { AlertsButton } from './AlertsButton';
import { usePrivacy } from '../context/PrivacyContext';
import { HealthIndicator } from './HealthIndicator';

interface DashboardHeaderProps {
  total: number;
  rendaMensal?: number;
  money: (val: number) => string;
  syncStatus: { status: 'idle' | 'processing' | 'success' | 'error'; message: string };
  fundamentalsStatus: { status: 'idle' | 'processing' | 'success' | 'error'; message: string };
  onSyncReports: () => void;
  onUpdateFundamentals: () => void;
  onManualRefresh: () => void;
  onOpenIfModal: () => void;
  onOpenSmartModal: () => void;
  onOpenAddModal: () => void;
  onFixAsset: (id: number) => void;
  loading: boolean;
  isRefetching: boolean;
  showRefreshSuccess: boolean;
}

export function DashboardHeader({
  total,
  rendaMensal,
  money,
  syncStatus,
  fundamentalsStatus,
  onSyncReports,
  onUpdateFundamentals,
  onManualRefresh,
  onOpenIfModal,
  onOpenSmartModal,
  onOpenAddModal,
  onFixAsset,
  loading,
  isRefetching,
  showRefreshSuccess
}: DashboardHeaderProps) {
  const { isHidden, togglePrivacy } = usePrivacy() as { isHidden: boolean; togglePrivacy: () => void };
  const syncingReports = syncStatus.status === 'processing';
  const updatingFundamentals = fundamentalsStatus.status === 'processing';
  
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha dropdown ao clicar fora do componente
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="sticky top-0 z-30 bg-[#0b0f19]/95 backdrop-blur-md border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        
        {/* LOGO & TICKER */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <Wallet className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight mr-2">
            AssetFlow <span className="text-blue-500 text-xs font-normal ml-1">Pro</span>
          </h1>
          <MarketTicker />
          <TradingHoursWidget />
        </div>

        {/* CONTROLES DE INTERFACE & AÇÕES UNIFICADAS */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* 📅 PROVENTOS */}
            <Link
              href="/agenda"
              className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-slate-700 group shadow-sm"
            >
              <Calendar size={15} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
              <span className="hidden sm:inline">Proventos</span>
            </Link>

            {/* 🛠️ DROPDOWN DE FERRAMENTAS & SINCRONIA */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsToolsOpen(!isToolsOpen)}
                className={`bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-slate-700 shadow-sm ${
                  (syncingReports || updatingFundamentals) ? 'border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.15)]' : ''
                }`}
              >
                <span className="relative flex items-center gap-1.5">
                  Ferramentas
                  {(syncingReports || updatingFundamentals) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  )}
                </span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isToolsOpen ? 'rotate-180' : ''}`} />
              </button>

              {isToolsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-800/80 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.6)] p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="space-y-4">
                    {/* Seção 1: Simulações Avançadas */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Simulações & Análises</span>
                      <div className="mt-2 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            onOpenIfModal();
                            setIsToolsOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                        >
                          <TrendingUp size={14} className="text-emerald-400" />
                          <div>
                            <p className="font-bold">Projeção de IF</p>
                            <p className="text-[9px] text-slate-500">Planeje sua independência financeira</p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onOpenSmartModal();
                            setIsToolsOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                        >
                          <Calculator size={14} className="text-purple-400" />
                          <div>
                            <p className="font-bold">Simular Aporte</p>
                            <p className="text-[9px] text-slate-500">Cálculo de alocação e rebalanceamento</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="h-px bg-slate-800/60" />

                    {/* Seção 2: Pipelines de Dados */}
                    <div>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1">Fontes de Dados</span>
                      <div className="mt-2 space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSyncReports();
                            setIsToolsOpen(false);
                          }}
                          disabled={syncingReports}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                        >
                          <Layers size={14} className={syncingReports ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold flex items-center justify-between">
                              <span>Sincronizar CVM (FNET)</span>
                              {syncingReports && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                            </p>
                            <p className="text-[9px] text-slate-500 truncate">
                              {syncingReports ? syncStatus.message : "Busca PDFs e fatos relevantes na CVM"}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onUpdateFundamentals();
                            setIsToolsOpen(false);
                          }}
                          disabled={updatingFundamentals}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                        >
                          <Brain size={14} className={updatingFundamentals ? 'animate-pulse text-emerald-400' : 'text-emerald-400'} />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold flex items-center justify-between">
                              <span>Indicadores Yahoo</span>
                              {updatingFundamentals && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            </p>
                            <p className="text-[9px] text-slate-500 truncate">
                              {updatingFundamentals ? fundamentalsStatus.message : "Busca múltiplos e proventos no Yahoo"}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onManualRefresh();
                            setIsToolsOpen(false);
                          }}
                          disabled={loading || isRefetching || showRefreshSuccess}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200 disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={`${(loading || isRefetching) ? 'animate-spin text-blue-400' : 'text-blue-400'} ${showRefreshSuccess ? 'text-emerald-400' : ''}`} />
                          <div>
                            <p className="font-bold">Recarregar Preços</p>
                            <p className="text-[9px] text-slate-500">Atualiza cotações do painel</p>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ➕ NOVO ATIVO */}
            <button
              type="button"
              onClick={onOpenAddModal}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] duration-300"
            >
              <PlusCircle size={15} /> 
              <span className="hidden sm:inline">Novo Ativo</span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800 mx-1"></div>

          {/* PRIVACIDADE, ALERTAS E SISTEMA */}
          <div className="flex items-center gap-2">
            <HealthIndicator />
            
            <button
              type="button"
              onClick={togglePrivacy}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors shadow-sm"
              title="Alternar Privacidade"
            >
              {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            <AlertsButton onFixAsset={onFixAsset} />
          </div>

          {/* RESUMO FINANCEIRO (PATRIMÔNIO) */}
          <div className="text-right hidden md:block border-l border-slate-800 pl-4 ml-2 min-w-[140px]">
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Patrimônio</p>
            <p className="text-lg font-bold text-white leading-tight mt-0.5">{money(total)}</p>
            {rendaMensal !== undefined && rendaMensal > 0 && (
              <div className="text-[10px] text-emerald-500 font-bold mt-1 flex items-center justify-end gap-1 leading-none">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                {money(rendaMensal)}
                <span className="text-[8px] opacity-70 ml-0.5 uppercase tracking-tighter">est.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
