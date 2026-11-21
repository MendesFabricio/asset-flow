'use client';

import React, { useState, useEffect, memo } from 'react';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { Logo } from './Logo';
import { MarketStatus } from './MarketStatus';
import { MarketTicker } from './MarketTicker';
import { PortfolioSummary } from './PortfolioSummary';
import { ToolsMenu } from './ToolsMenu';
import { NewAssetButton } from './NewAssetButton';
import { Notifications } from './Notifications';
import { SystemStatus } from './SystemStatus';
import { UserMenu } from './UserMenu';
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
  onOpenSmartModal: () => void;
  onOpenAddModal: () => void;
  onOpenCorporateAction: () => void;
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
  onOpenSmartModal,
  onOpenAddModal,
  onOpenCorporateAction,
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
    <header className="sticky top-0 z-30 w-full bg-surface/85 backdrop-blur-md border-b border-border-subtle select-none">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex justify-between items-center h-16">
        
        {/* ESQUERDA: LOGO + USER INFO + STATUS */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          <Logo />
          <div className="hidden sm:block h-6 w-px bg-border-subtle" />
          <div className="hidden sm:flex flex-col justify-center leading-none">
            <span className="text-xs font-medium text-text-primary">
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
              onOpenSmartModal={onOpenSmartModal}
              onOpenAddModal={onOpenAddModal}
              onOpenCorporateAction={onOpenCorporateAction}
              syncStatus={syncStatus}
              fundamentalsStatus={fundamentalsStatus}
              loading={loading}
              isRefetching={isRefetching}
              showRefreshSuccess={showRefreshSuccess}
              ativos={ativos}
            />
            <NewAssetButton onClick={onOpenAddModal} />
            <Notifications onFixAsset={onFixAsset} />
            <div className="hidden lg:block">
               <SystemStatus />
            </div>
            <div className="hidden lg:block h-6 w-px bg-border-subtle mx-1" />
            
            <UserMenu />
            
            <div className="hidden lg:block h-6 w-px bg-border-subtle mx-1" />
            <div className="hidden lg:block">
              <PortfolioSummary total={total} ativos={ativos} money={money} loading={loading} />
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
              className="p-2 text-text-muted hover:text-accent focus:outline-none rounded-lg bg-surface-card border border-border-subtle"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border-subtle bg-surface p-4 space-y-4 z-40">
          
          {/* Status do Pregão */}
          <div className="flex justify-between items-center">
            <span className="text-2xs uppercase font-medium text-text-muted">Status Mercado</span>
            <MarketStatus />
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Ferramentas e Configurações */}
          <div className="flex flex-col gap-2">
            <span className="text-2xs uppercase font-medium text-text-muted mb-1">Ações da Carteira</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenAddModal();
                  setMobileMenuOpen(false);
                }}
                className="bg-accent hover:bg-accent/90 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
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
                className="bg-surface-card border border-border-subtle text-text-primary text-xs font-medium py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                Recarregar Cotações
              </button>
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Links adicionais */}
          <div className="flex flex-col gap-2">
            <span className="text-2xs uppercase font-medium text-text-muted mb-1">Análises & Sincronias</span>
            <div className="flex flex-col gap-1">
              <Link
                href="/tax"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-left px-2 py-2 text-xs font-medium rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text-primary"
              >
                Imposto de Renda (DARF)
              </Link>
              <button
                type="button"
                onClick={() => {
                  onOpenSmartModal();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-medium rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text-primary"
              >
                Otimização de Aportes
              </button>
              <button
                type="button"
                onClick={() => {
                  onSyncReports();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-medium rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text-primary"
              >
                Sincronizar CVM (FNET)
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateFundamentals();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-2 py-2 text-xs font-medium rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text-primary"
              >
                Atualizar Yahoo Finance
              </button>
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

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
