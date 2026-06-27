'use client';
import { Wallet, Calendar, TrendingUp, Calculator, PlusCircle, EyeOff, Eye, Layers, Brain, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { MarketTicker } from './MarketTicker';
import { AlertsButton } from './AlertsButton';
import { usePrivacy } from '../context/PrivacyContext';

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

  return (
    <div className="sticky top-0 z-30 bg-[#0b0f19]/95 backdrop-blur-md border-b border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <Wallet className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight mr-2">
            AssetFlow <span className="text-blue-500 text-xs font-normal ml-1">Pro</span>
          </h1>
          <MarketTicker />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/agenda"
              className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-slate-700 group"
            >
              <Calendar size={16} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
              <span className="hidden sm:inline">Proventos</span>
            </Link>

            <button
              type="button"
              onClick={onOpenIfModal}
              className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-emerald-600/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] duration-300"
            >
              <TrendingUp size={16} />
              <span className="hidden sm:inline">Projeção IF</span>
            </button>

            <button
              type="button"
              onClick={onOpenSmartModal}
              className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold border border-purple-500/50 shadow-[0_0_15px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(147,51,234,0.6)] duration-300"
            >
              <Calculator size={16} />
              <span className="hidden sm:inline">Simular Aporte</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddModal}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] duration-300"
            >
              <PlusCircle size={16} /> <span className="hidden sm:inline">Novo Ativo</span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800 mx-1"></div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePrivacy}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              {isHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            <AlertsButton onFixAsset={onFixAsset} />

            <button
              type="button"
              onClick={onSyncReports}
              disabled={syncingReports}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 disabled:opacity-50 group relative transition-all"
              title={syncingReports ? syncStatus.message : "Sincronizar Relatórios CVM"}
            >
              <Layers size={16} className={syncingReports ? 'animate-spin text-purple-400' : 'text-slate-400'} />
              {syncingReports && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onUpdateFundamentals}
              disabled={updatingFundamentals}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 disabled:opacity-50 relative group"
              title={updatingFundamentals ? fundamentalsStatus.message : "Atualizar Indicadores Yahoo"}
            >
              <Brain size={16} className={updatingFundamentals ? 'animate-pulse text-emerald-400' : ''} />
              {updatingFundamentals && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onManualRefresh}
              disabled={loading || isRefetching || showRefreshSuccess}
              className={`p-2 rounded-lg border transition-all duration-300 ${
                showRefreshSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              } disabled:opacity-50`}
              title="Recarregar dados"
            >
              <RefreshCw
                size={16}
                className={`${(loading || isRefetching) ? 'animate-spin' : ''} ${showRefreshSuccess ? 'text-emerald-400' : ''}`}
              />
            </button>
          </div>

          <div className="text-right hidden md:block border-l border-slate-800 pl-4 ml-2 min-w-[140px]">
            <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Patrimônio</p>
            <p className="text-lg font-bold text-white leading-tight mt-0.5">{money(total)}</p>
            {rendaMensal !== undefined && rendaMensal > 0 && (
              <div className="text-[10px] text-emerald-500 font-bold mt-1 flex items-center justify-end gap-1 leading-none">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
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
