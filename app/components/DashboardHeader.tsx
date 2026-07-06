'use client';
import { useState, useRef, useEffect } from 'react';
import { Wallet, Calendar, TrendingUp, Calculator, PlusCircle, EyeOff, Eye, Layers, Brain, RefreshCw, ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { AlertsButton } from './AlertsButton';
import { MarketTicker } from './MarketTicker';
import { TradingHoursWidget } from './TradingHoursWidget';
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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [username, setUsername] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Busca o usuário logado e fecha dropdowns ao clicar fora
  useEffect(() => {
    const savedUsername = localStorage.getItem('assetflow_username');
    if (savedUsername) {
      setUsername(savedUsername);
    }

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('assetflow_username');
    document.cookie = "assetflow_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = '/login';
  };

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
          <div className="hidden lg:flex items-center gap-2">
            <MarketTicker />
            <TradingHoursWidget />
          </div>
        </div>

        {/* CONTROLES DE INTERFACE & AÇÕES UNIFICADAS */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
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
                        <Link
                          href="/agenda"
                          onClick={() => setIsToolsOpen(false)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors flex items-center gap-2.5 text-xs text-slate-200"
                        >
                          <Calendar size={14} className="text-blue-400" />
                          <div>
                            <p className="font-bold">Proventos & Renda Passiva</p>
                            <p className="text-[9px] text-slate-500">Histórico, agenda e yields projetados</p>
                          </div>
                        </Link>

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

          {/* SISTEMA, ALERTAS E PERFIL */}
          <div className="flex items-center gap-2">
            <HealthIndicator />
            <AlertsButton onFixAsset={onFixAsset} />

            {/* Dropdown de Perfil elegante */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700/50 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold text-slate-200"
              >
                <span className="w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-[9px]">
                  {username ? username.substring(0, 2).toUpperCase() : 'US'}
                </span>
                <span className="hidden sm:inline">{username || 'Usuário'}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-2.5 py-1.5 border-b border-slate-800/80 mb-1">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Conta ativa</p>
                    <p className="text-xs text-white font-medium truncate mt-0.5">{username}</p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      togglePrivacy();
                      setIsProfileOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/60 text-slate-300 hover:text-white transition-colors flex items-center gap-2 text-xs"
                  >
                    {isHidden ? <Eye size={13} className="text-slate-400" /> : <EyeOff size={13} className="text-slate-400" />}
                    <span>{isHidden ? "Exibir Valores" : "Ocultar Valores"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-rose-950/30 text-slate-300 hover:text-rose-400 transition-colors flex items-center gap-2 text-xs"
                  >
                    <LogOut size={13} className="text-rose-400/80" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              )}
            </div>
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
