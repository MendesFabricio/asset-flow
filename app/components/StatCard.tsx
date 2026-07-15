import React from 'react';
import { LucideIcon, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';
import { formatMoney } from '../utils'; // Importar formatMoney

interface StatCardProps {
  title: string;
  value: string; // Ticker ou Valor Principal
  icon: LucideIcon;
  colorClass: string;

  // Props opcionais para o modo Insight
  type?: 'standard' | 'insight';
  subtext?: string;
  badge?: string;
  marquee?: string;

  // 🆕 NOVA PROP: Resultado financeiro do dia
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
  dailyResult // 👈 Recebendo o valor
}: StatCardProps) => {

  // Lógica de Temas (Mantida igual)
  let theme = {
    gradient: "from-slate-800/50 to-slate-900",
    iconBg: "bg-slate-800 border-slate-700 text-slate-400",
    glow: "bg-slate-500",
    shadow: "shadow-slate-900/20"
  };

  if (colorClass.includes("purple")) {
    theme = { gradient: "from-purple-500/10 to-slate-900/80", iconBg: "bg-purple-500/10 border-purple-500/20 text-purple-400", glow: "bg-purple-500", shadow: "shadow-purple-900/20" };
  } else if (colorClass.includes("blue") || colorClass.includes("cyan")) {
    theme = { gradient: "from-blue-600/10 to-slate-900/80", iconBg: "bg-blue-500/10 border-blue-500/20 text-blue-400", glow: "bg-blue-500", shadow: "shadow-blue-900/20" };
  } else if (colorClass.includes("green") || colorClass.includes("emerald")) {
    theme = { gradient: "from-emerald-500/10 to-slate-900/80", iconBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", glow: "bg-emerald-500", shadow: "shadow-emerald-900/20" };
  } else if (colorClass.includes("red") || colorClass.includes("rose")) {
    theme = { gradient: "from-rose-500/10 to-slate-900/80", iconBg: "bg-rose-500/10 border-rose-500/20 text-rose-400", glow: "bg-rose-500", shadow: "shadow-rose-900/20" };
  } else if (colorClass.includes("indigo")) {
    theme = { gradient: "from-indigo-500/10 to-slate-900/80", iconBg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400", glow: "bg-indigo-500", shadow: "shadow-indigo-900/20" };
  }

  // Lógica de Cores Estáticas para Tailwind v4 JIT Compiler
  const colorMap: Record<string, { badgeBg: string, badgeText: string, marqueeText: string }> = {
    purple: { badgeBg: "bg-purple-500/20", badgeText: "text-purple-200", marqueeText: "text-purple-200" },
    blue: { badgeBg: "bg-blue-500/20", badgeText: "text-blue-200", marqueeText: "text-blue-200" },
    cyan: { badgeBg: "bg-cyan-500/20", badgeText: "text-cyan-200", marqueeText: "text-cyan-200" },
    green: { badgeBg: "bg-emerald-500/20", badgeText: "text-emerald-200", marqueeText: "text-emerald-200" },
    emerald: { badgeBg: "bg-emerald-500/20", badgeText: "text-emerald-200", marqueeText: "text-emerald-200" },
    red: { badgeBg: "bg-rose-500/20", badgeText: "text-rose-200", marqueeText: "text-rose-200" },
    rose: { badgeBg: "bg-rose-500/20", badgeText: "text-rose-200", marqueeText: "text-rose-200" },
    indigo: { badgeBg: "bg-indigo-500/20", badgeText: "text-indigo-200", marqueeText: "text-indigo-200" }
  };

  const colorKey = Object.keys(colorMap).find(k => colorClass.includes(k)) || "blue";
  const colors = colorMap[colorKey];

  // Lógica Visual do Daily Result
  const hasDaily = dailyResult !== undefined;
  const isPositiveDaily = hasDaily && dailyResult >= 0;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800/80 bg-gradient-to-br ${theme.gradient} p-6 shadow-md ${theme.shadow} transition-all duration-300 ease-in-out hover:scale-[1.02] hover:-translate-y-1 hover:shadow-xl hover:border-slate-700/80 group flex flex-col justify-between min-h-[125px]`}>

      {/* Glow de fundo */}
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full ${theme.glow} blur-3xl opacity-5 group-hover:opacity-20 transition-opacity duration-500`}></div>

      {/* Header do Card */}
      <div className="flex justify-between items-start relative z-10">
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-1.5">{title}</p>

          {type === 'insight' ? (
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-2xl font-bold font-mono tracking-tight text-white leading-none">{value}</h3>
              {badge && (
                <span className={`text-[9px] font-bold flex items-center gap-1 uppercase px-2 py-0.5 rounded-md ${colors.badgeBg} ${colors.badgeText}`}>
                  <ArrowUpRight size={10} /> {badge}
                </span>
              )}
            </div>
          ) : (
            <h3 className="text-2xl font-mono font-bold tracking-tight text-white drop-shadow-sm">
              {value}
            </h3>
          )}
        </div>

        <div className={`p-2.5 rounded-lg border ${theme.iconBg} transition-transform duration-300 group-hover:rotate-6`}>
          <Icon size={20} strokeWidth={1.5} />
        </div>
      </div>

      {/* Footer do Card (Inteligente) */}
      <div className={`mt-4 pt-3 ${type === 'insight' ? 'border-t border-slate-700/40 overflow-hidden relative' : ''} relative z-10`}>
        {type === 'insight' ? (
          marquee ? (
            <div className="relative flex items-center w-full group/marquee cursor-default">
              <p 
                className={`text-[10px] font-bold uppercase tracking-tight italic truncate w-full pr-2 opacity-80 ${colors.marqueeText}`}
                title={marquee}
              >
                {marquee}
              </p>
            </div>
          ) : (
            <p className="text-slate-500 text-[9px] font-bold uppercase italic">Aguardando sinais...</p>
          )
        ) : (
          // === FOOTER PADRÃO COM SUPORTE A DAILY RESULT ===
          <div className="flex items-center justify-between w-full">
            {/* Texto da Esquerda (Original) */}
            <p className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5 opacity-90">
              <span className={`w-1.5 h-1.5 rounded-full ${theme.glow}`}></span>
              {subtext}
            </p>

            {/* Resultado Diário (Direita) */}
            {hasDaily && dailyResult !== 0 && (
              <div className={`flex items-center gap-1 text-[10px] font-bold animate-in slide-in-from-right-2 ${isPositiveDaily ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPositiveDaily ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {formatMoney(Math.abs(dailyResult))}
                <span className="text-[8px] text-slate-600 font-normal uppercase ml-0.5 tracking-tighter">Hoje</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

StatCard.displayName = 'StatCard';
