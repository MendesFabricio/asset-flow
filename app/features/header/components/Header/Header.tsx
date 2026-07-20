'use client';

import React, { useState, useEffect, memo } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from './Logo';
import { MarketStatus } from './MarketStatus';
import { MarketTicker } from './MarketTicker';
import { PortfolioSummary } from './PortfolioSummary';
import { ToolsMenu } from './ToolsMenu';
import { NewAssetButton } from './NewAssetButton';
import { Notifications } from './Notifications';
import { SystemStatus } from './SystemStatus';
import { UserMenu } from './UserMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Asset } from '@/types';

interface HeaderProps {
  total: number;
  ativos: Asset[];
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

export const Header = memo(({
  total,
  ativos,
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
}: HeaderProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('assetflow_username');
    if (saved) {
      setUsername(saved);
    }
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-900 select-none">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex justify-between items-center h-16">
        
        {/* ESQUERDA: LOGO + THEME TOGGLE + USER INFO + STATUS */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <Logo />
          <ThemeToggle />
          <div className="hidden sm:block h-6 w-px bg-slate-800" />
          <div className="hidden sm:flex flex-col justify-center leading-none">
            <span className="text-[10px] font-bold text-slate-300 tracking-wide uppercase">
              {username || 'Investidor'}
            </span>
            <div className="mt-1">
              <MarketStatus minimal={true} />
            </div>
          </div>
        </div>

        {/* CENTRO: Market Ticker (md+) */}
        <div className="hidden md:flex items-center justify-center flex-1 max-w-xs lg:max-w-md px-4">
          <MarketTicker />
        </div>

        {/* DIREITA: Desktop Controls & Mobile Burger */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Controles Desktop/Tablet (md+) */}
          <div className="hidden md:flex items-center gap-2">
            <ToolsMenu
              onSyncReports={onSyncReports}
              onUpdateFundamentals={onUpdateFundamentals}
              onManualRefresh={onManualRefresh}
              onOpenIfModal={onOpenIfModal}
              onOpenSmartModal={onOpenSmartModal}
              onOpenAddModal={onOpenAddModal}
              syncStatus={syncStatus}
              fundamentalsStatus={fundamentalsStatus}
              loading={loading}
              isRefetching={isRefetching}
              showRefreshSuccess={showRefreshSuccess}
            />
            <NewAssetButton onClick={onOpenAddModal} />
            <Notifications onFixAsset={onFixAsset} />
            <div className="hidden lg:block">
               <SystemStatus />
            </div>
            <div className="hidden lg:block h-6 w-px bg-slate-800 mx-1" />
            
            <UserMenu />
            
            <div className="hidden lg:block h-6 w-px bg-slate-800 mx-1" />
            <div className="hidden lg:block">
              <PortfolioSummary total={total} ativos={ativos} money={money} />
            </div>
          </div>

          {/* BURGER MENU MOBILE (sm and below) */}
          <div className="md:hidden flex items-center gap-2">
            <Notifications onFixAsset={onFixAsset} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2 text-slate-400 hover:text-accent focus:outline-none rounded-lg bg-slate-900/60 border border-slate-800"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-900 bg-slate-950 p-4 space-y-4 animate-in slide-in-from-top-3 duration-250 z-40">
          
          {/* Status do Pregão */}
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-slate-500">Status Mercado</span>
            <MarketStatus />
          </div>

          <div className="h-px bg-slate-900" />

          {/* Ferramentas e Configurações */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Ações da Carteira</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenAddModal();
                  setMobileMenuOpen(false);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm"
              >
                Novo Ativo
              </button>
              <button
                type="button"
                onClick={() => {
                  onManualRefresh();
                  setMobileMenuOpen(false);
                }}
                disabled={loading || isRefetching || showRefreshSuccess}
                className="bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                Recarregar Cotações
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-900" />

          {/* Links adicionais */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Análises & Sincronias</span>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  onOpenSmartModal();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-bold rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white"
              >
                Otimização de Aportes
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenIfModal();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-bold rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white"
              >
                Projeção de Independência
              </button>
              <button
                type="button"
                onClick={() => {
                  onSyncReports();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-bold rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white"
              >
                Sincronizar CVM (FNET)
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateFundamentals();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-bold rounded-lg hover:bg-slate-900 text-slate-300 hover:text-white"
              >
                Atualizar Yahoo Finance
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-900" />

          {/* Sistema & Perfil */}
          <div className="flex justify-between items-center">
            <SystemStatus />
            <UserMenu />
          </div>
        </div>
      )}
    </header>
  );
});

Header.displayName = 'Header';
