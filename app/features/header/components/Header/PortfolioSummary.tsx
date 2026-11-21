'use client';

import { usePrivacy } from '@/context/PrivacyContext';
import { Asset } from '@/types';

interface PortfolioSummaryProps {
  total: number;
  ativos: Asset[];
  money: (val: number) => string;
}

export function PortfolioSummary({ total, ativos, money }: PortfolioSummaryProps) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };

  const hasAssets = ativos && ativos.length > 0;
  
  // Calcula delta diário médio ponderado da carteira
  const totalCurrent = ativos?.reduce((acc, a) => acc + (a.total_atual || 0), 0) || 0;
  const dailyChangePct = totalCurrent > 0
    ? ativos.reduce((acc, a) => acc + ((a.change_percent || 0) * ((a.total_atual || 0) / totalCurrent)), 0)
    : 0;

  const isPositive = dailyChangePct >= 0;

  return (
    <div className="hidden md:flex items-center border-l border-border-subtle pl-4 ml-2 select-none">
      <div className="text-right min-w-[140px]">
        <p className="text-2xs text-text-muted uppercase font-semibold tracking-wider leading-none">Patrimônio Líquido</p>
        
        {total === 0 ? (
          <p className="text-xs text-text-muted font-medium leading-tight mt-1.5">Sem ativos cadastrados</p>
        ) : (
          <>
            <p className="text-base font-semibold text-text-primary leading-tight mt-1 font-mono tabular-nums">
              {isHidden ? '••••••' : money(total)}
            </p>
            
            {hasAssets && !isHidden && (
              <div className={`text-2xs font-semibold mt-1 flex items-center justify-end gap-1 leading-none font-mono tabular-nums ${
                isPositive ? 'text-status-success' : 'text-status-error'
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
