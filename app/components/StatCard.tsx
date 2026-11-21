import React from 'react';
import { LucideIcon, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '../lib/format';
import { usePrivacy } from '../context/PrivacyContext';

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  colorClass: string;
  type?: 'standard' | 'insight';
  subtext?: string;
  badge?: string;
  marquee?: string;
  dailyResult?: number;
}

export const StatCard = React.memo(({
  title,
  value,
  subtext,
  icon: Icon,
  colorClass,
  type = 'standard',
  badge,
  marquee,
  dailyResult
}: StatCardProps) => {
  const { isHidden } = usePrivacy();

  // Lógica de Cores Semânticas
  let semanticColor = "text-accent";
  let semanticBg = "bg-accent/10";
  let semanticBorder = "border-accent/20";

  if (colorClass.includes("status-success") || colorClass.includes("green") || colorClass.includes("emerald")) {
    semanticColor = "text-status-success";
    semanticBg = "bg-status-success/10";
    semanticBorder = "border-status-success/20";
  } else if (colorClass.includes("status-error") || colorClass.includes("red") || colorClass.includes("rose")) {
    semanticColor = "text-status-error";
    semanticBg = "bg-status-error/10";
    semanticBorder = "border-status-error/20";
  } else if (colorClass.includes("status-warning") || colorClass.includes("amber") || colorClass.includes("yellow")) {
    semanticColor = "text-status-warning";
    semanticBg = "bg-status-warning/10";
    semanticBorder = "border-status-warning/20";
  }

  const hasDaily = dailyResult !== undefined;
  const isPositiveDaily = hasDaily && dailyResult >= 0;

  return (
    <div className="relative rounded-xl border border-border-subtle bg-surface-card shadow-sm transition-colors duration-150 hover:border-accent/40 group">
      {/* Content layer */}
      <div className="relative z-10 flex flex-col justify-between h-full p-5">
        {/* Header do Card */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            {/* Label / Microcopy */}
            <p className="text-2xs font-medium uppercase tracking-wider text-text-muted leading-none mb-2">{title}</p>

            {type === 'insight' ? (
              <div className="flex items-center gap-2 mt-0.5">
                {/* Valores de destaque */}
                <h3 className="text-xl font-semibold tracking-tight text-text-primary leading-none tabular-nums">{value}</h3>
                {badge && (
                  <span className={`text-2xs font-medium flex items-center gap-1 uppercase px-2 py-0.5 rounded-md border ${semanticBorder} ${semanticBg} ${semanticColor}`}>
                    <ArrowUpRight size={10} strokeWidth={2.5} className="opacity-70" />
                    <span>{badge.replace(/[🟢🟡🔴🚨✅]/g, '').trim()}</span>
                  </span>
                )}
              </div>
            ) : (
              <h3 className="text-xl font-semibold tracking-tight text-text-primary tabular-nums">
                {value}
              </h3>
            )}
          </div>

          <Icon size={16} strokeWidth={1.5} className={`shrink-0 ${semanticColor}`} />
        </div>

        {/* Footer do Card */}
        <div className="mt-3 pt-2 relative z-10">
        {type === 'insight' ? (
          marquee ? (
            <div className="relative flex items-center w-full cursor-pointer group/tooltip">
              {/* Texto da Esquerda (Subtítulos / Secundário) */}
              <p className="text-xs font-normal text-text-muted transition-colors group-hover/tooltip:text-text-primary">
                Por que aportar?
              </p>
              
              {/* Tooltip Hover */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:flex flex-col gap-1 w-max max-w-[250px] p-2.5 bg-surface-elevated text-text-primary text-2xs rounded-xl shadow-lg border border-border-subtle z-50">
                {marquee.split(' • ').map((item, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-2xs text-text-muted font-normal">Aguardando sinais...</p>
          )
        ) : (
          <div className="flex items-center justify-between w-full">
            {/* Texto da Esquerda (Subtítulos / Secundário) */}
            <p className="text-xs font-normal text-text-muted">
              {subtext}
            </p>

            {/* Resultado Diário (Direita) */}
            {hasDaily && dailyResult !== 0 && (
              <div className={`flex items-center gap-1 text-xs font-medium tabular-nums ${isPositiveDaily ? 'text-status-success' : 'text-status-error'}`}>
                {isPositiveDaily ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isHidden ? 'R$ •••••' : formatMoney(Math.abs(dailyResult))}
                {/* Microcopy */}
                <span className="text-2xs text-text-muted font-normal ml-0.5">Hoje</span>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
});

StatCard.displayName = 'StatCard';
