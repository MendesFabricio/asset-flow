'use client';
import React from 'react';
import { 
  Siren, 
  Sparkles, 
  Scale, 
  Anchor, 
  ShieldCheck, 
  Activity 
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Alerta } from '@/types';

const analyzeAlert = (text: string) => {
  const t = text.toLowerCase();
  if (t.includes('oportunidade') || t.includes('graham') || t.includes('desconto') || t.includes('desempenho')) {
    return { icon: Sparkles, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', label: 'Desempenho / Op.' };
  }
  if (t.includes('rebalancear') || t.includes('meta')) {
    return { icon: Scale, color: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', label: 'Ajuste' };
  }
  if (t.includes('correlação') || t.includes('correlacao')) {
    return { icon: Activity, color: 'text-purple-400', bg: 'bg-purple-500/5', border: 'border-purple-500/20', label: 'Correlação EWMA' };
  }
  if (t.includes('var') || t.includes('risco de cauda') || t.includes('queda') || t.includes('recuo')) {
    return { icon: Siren, color: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20', label: 'Risco / VaR' };
  }
  if (t.includes('sistemático') || t.includes('sistematico') || t.includes('beta')) {
    return { icon: ShieldCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/5', border: 'border-indigo-500/20', label: 'Métrica Quant' };
  }
  if (t.includes('esticado') || t.includes('rsi alto') || t.includes('alerta')) {
    return { icon: Siren, color: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20', label: 'Risco Elevado' };
  }
  if (t.includes('mínima') || t.includes('fundo') || t.includes('suporte')) {
    return { icon: Anchor, color: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20', label: 'Suporte' };
  }
  return { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/5', border: 'border-slate-500/20', label: 'Movimentação' };
};

export const RiskRadar = React.memo(({ alertas }: { alertas: (string | Alerta)[] }) => {
  return (
    <div className="flex flex-col h-[525px] overflow-hidden w-full">
      {/* Área de Scroll com otimização (sem backdrop-blur por item) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <div className="flex justify-end mb-2">
           <Badge label={`${alertas.length} Insights`} variant="slate" />
        </div>

        {alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3 opacity-40">
            <ShieldCheck size={40} strokeWidth={1.5} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-center">Nenhum sinal relevante</p>
          </div>
        ) : (
          alertas.map((alerta, index) => {
            const isObj = typeof alerta === 'object' && alerta !== null;
            const titulo = isObj ? (alerta as Alerta).titulo : (alerta as string);
            const significado = isObj ? (alerta as Alerta).significado : '';
            const acao = isObj ? (alerta as Alerta).acao : '';
            
            const style = analyzeAlert(titulo);
            const Icon = style.icon;
            return (
              <div key={index} className={`relative p-4 rounded-xl border ${style.bg} ${style.border} transition-colors duration-300 hover:bg-slate-800/10`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl bg-surface-card border border-slate-700/30 shrink-0 ${style.color}`}>
                    <Icon size={16} />
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <div className="space-y-0.5">
                      <span className={`text-[9px] font-extrabold uppercase tracking-widest ${style.color}`}>
                        {style.label}
                      </span>
                      <p className="text-[12px] text-slate-200 leading-relaxed font-bold">
                        {titulo.replace(/⚠️|💎|📈|📉|⚖️|🚨|❗|🏆|🛡️|⚡|🔥/g, '').trim()}
                      </p>
                      {significado && (
                        <p className="text-[11px] text-slate-400 leading-normal font-medium mt-1">
                          {significado}
                        </p>
                      )}
                    </div>

                    {acao && (
                      <div className="p-2.5 bg-surface-card/60 border border-slate-700/20 rounded-lg flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase shrink-0">
                          Ação
                        </span>
                        <p className="text-[10px] text-slate-300 leading-snug font-semibold">
                          {acao}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-surface-card/30 border-t border-slate-800/50 text-center shrink-0">
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">
            Preço • RSI • VaR • Correlação EWMA • Risco
        </p>
      </div>
    </div>
  );
});

RiskRadar.displayName = 'RiskRadar';
