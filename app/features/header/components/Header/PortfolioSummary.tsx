'use client';

import { usePrivacy } from '@/context/PrivacyContext';
import { Asset } from '@/types';

interface PortfolioSummaryProps {
  total: number;
  ativos: Asset[];
  money: (val: number) => string;
  loading?: boolean;
}

export function PortfolioSummary({ total, ativos, money, loading = false }: PortfolioSummaryProps) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };

  const hasAssets = ativos && ativos.length > 0;
  
  // Calcula delta diário médio ponderado da carteira
  const totalCurrent = ativos?.reduce((acc, a) => acc + (a.total_atual || 0), 0) || 0;
  const dailyChangePct = totalCurrent > 0
    ? ativos.reduce((acc, a) => acc + ((a.change_percent || 0) * ((a.total_atual || 0) / totalCurrent)), 0)
    : 0;

  const isPositive = dailyChangePct >= 0;

  return (
    <div className="hidden md:flex items-center border-l border-border-subtle pl-4 ml-1 select-none">
      <div className="text-right min-w-[140px]">
        <p className="text-[10px] text-text-muted uppercase font-semibold tracking-wider leading-none">Patrimônio Líquido</p>
        
        {loading ? (
          <div className="mt-1.5 space-y-1 animate-pulse">
            <div className="h-4 w-28 bg-surface-input rounded ml-auto" />
            <div className="h-2.5 w-20 bg-surface-input rounded ml-auto" />
          </div>
        ) : total === 0 && !hasAssets ? (
          <p className="text-xs text-text-muted font-medium leading-tight mt-1.5">Sem ativos cadastrados</p>
        ) : (
          <>
            <p className="text-lg font-bold text-text-primary leading-tight mt-0.5 font-mono tabular-nums">
              {isHidden ? '••••••' : money(total)}
            </p>
            
            {hasAssets && !isHidden && (
              <div className={`text-[10px] font-bold mt-1 flex items-center justify-end gap-1 leading-none font-mono tabular-nums ${
                isPositive ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                <span>{isPositive ? '▲' : '▼'}</span>
                <span>{isPositive ? '+' : ''}{dailyChangePct.toFixed(2)}% hoje</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
