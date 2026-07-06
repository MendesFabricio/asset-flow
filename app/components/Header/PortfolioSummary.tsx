'use client';

import { usePrivacy } from '../../context/PrivacyContext';
import { Asset } from '../../types';

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
    <div className="text-right hidden md:block border-l border-slate-900 pl-4 ml-2 min-w-[140px] select-none">
      <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Patrimônio Líquido</p>
      
      {total === 0 ? (
        <p className="text-xs text-slate-400 font-medium leading-tight mt-1.5">Sem ativos cadastrados</p>
      ) : (
        <>
          <p className="text-base font-bold text-white leading-tight mt-1 font-mono tabular-nums">
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
  );
}
