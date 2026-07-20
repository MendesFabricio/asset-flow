import React from 'react';
import { LucideIcon, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '../lib/format';

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

  // Lógica de Cores Semânticas
  let semanticColor = "text-accent";
  let semanticBg = "bg-accent/10";
  let semanticBorder = "border-accent/20";
  let semanticShadow = "shadow-accent/10";
  let semanticGradient = "from-accent/20 to-transparent"; // Degradê mais forte

  if (colorClass.includes("purple") || colorClass.includes("indigo")) {
    semanticColor = "text-indigo-400";
    semanticBg = "bg-indigo-500/10";
    semanticBorder = "border-indigo-500/20";
    semanticShadow = "shadow-indigo-900/10";
    semanticGradient = "from-indigo-500/20 to-transparent";
  } else if (colorClass.includes("green") || colorClass.includes("emerald")) {
    semanticColor = "text-status-success";
    semanticBg = "bg-status-success/10";
    semanticBorder = "border-status-success/20";
    semanticShadow = "shadow-status-success/10";
    semanticGradient = "from-status-success/20 to-transparent";
  } else if (colorClass.includes("red") || colorClass.includes("rose")) {
    semanticColor = "text-status-error";
    semanticBg = "bg-status-error/10";
    semanticBorder = "border-status-error/20";
    semanticShadow = "shadow-status-error/10";
    semanticGradient = "from-status-error/20 to-transparent";
  } else if (colorClass.includes("amber") || colorClass.includes("yellow")) {
    semanticColor = "text-status-warning";
    semanticBg = "bg-status-warning/10";
    semanticBorder = "border-status-warning/20";
    semanticShadow = "shadow-status-warning/10";
    semanticGradient = "from-status-warning/20 to-transparent";
  }

  const hasDaily = dailyResult !== undefined;
  const isPositiveDaily = hasDaily && dailyResult >= 0;

  return (
    <div className={`relative rounded-xl border border-slate-800/60 shadow-sm transition-all duration-300 ease-in-out hover:scale-[1.02] hover:-translate-y-1 hover:shadow-md hover:border-slate-700/80 group min-h-[125px]`}>
      
      {/* Background layer (with overflow-hidden for the glow) */}
      <div className={`absolute inset-0 overflow-hidden rounded-xl pointer-events-none bg-surface-card bg-gradient-to-br ${semanticGradient}`}>
        {/* Glow de fundo */}
        <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${semanticBg} blur-3xl opacity-30 group-hover:opacity-50 transition-opacity duration-500`}></div>
      </div>

      {/* Content layer */}
      <div className="relative z-10 flex flex-col justify-between h-full p-5">
        {/* Header do Card */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            {/* Label / Microcopy */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-2">{title}</p>

            {type === 'insight' ? (
              <div className="flex items-center gap-2 mt-0.5">
                {/* Valores de destaque */}
                <h3 className="text-lg font-bold tracking-tight text-slate-100 leading-none">{value}</h3>
                {badge && (
                  <span className={`text-[10px] font-bold flex items-center gap-1.5 uppercase px-2 py-0.5 rounded-full border ${semanticBorder} ${semanticBg} ${semanticColor} shadow-sm backdrop-blur-sm`}>
                    <ArrowUpRight size={10} strokeWidth={2.5} className="opacity-70" />
                    <span className="flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${semanticColor.replace('text-', 'bg-')} opacity-50`}></span>
                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${semanticColor.replace('text-', 'bg-')}`}></span>
                      </span>
                      {badge.replace(/[🟢🟡🔴🚨✅]/g, '').trim()}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <h3 className="text-lg font-bold tracking-tight text-slate-100">
                {value}
              </h3>
            )}
          </div>

          <div className={`p-2 rounded-lg border bg-surface ${semanticBorder} ${semanticColor} transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:rotate-6`}>
            <Icon size={18} strokeWidth={1.5} />
          </div>
        </div>

        {/* Footer do Card */}
        <div className={`mt-4 pt-3 relative z-10`}>
        {type === 'insight' ? (
          marquee ? (
            <div className="relative flex items-center w-full cursor-pointer group/tooltip">
              {/* Texto da Esquerda (Subtítulos / Secundário) */}
              <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 opacity-90 transition-colors group-hover/tooltip:text-slate-300">
                <span className={`w-1.5 h-1.5 rounded-full ${semanticBg} border ${semanticBorder}`}></span>
                Por que aportar?
              </p>
              
              {/* Tooltip Hover */}
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:flex flex-col gap-1 w-max max-w-[250px] p-2 bg-slate-900/95 backdrop-blur-sm text-slate-300 text-[10px] sm:text-[11px] rounded shadow-2xl border border-slate-700/50 z-50">
                {marquee.split(' • ').map((item, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-bold uppercase">Aguardando sinais...</p>
          )
        ) : (
          <div className="flex items-center justify-between w-full">
            {/* Texto da Esquerda (Subtítulos / Secundário) */}
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 opacity-90">
              <span className={`w-1.5 h-1.5 rounded-full ${semanticBg} border ${semanticBorder}`}></span>
              {subtext}
            </p>

            {/* Resultado Diário (Direita) */}
            {hasDaily && dailyResult !== 0 && (
              <div className={`flex items-center gap-1 text-xs font-bold animate-in slide-in-from-right-2 ${isPositiveDaily ? 'text-status-success' : 'text-status-error'}`}>
                {isPositiveDaily ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {formatMoney(Math.abs(dailyResult))}
                {/* Microcopy */}
                <span className="text-[10px] text-slate-500 font-normal ml-0.5">Hoje</span>
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
