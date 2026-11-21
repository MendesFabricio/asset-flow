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
  return { icon: Activity, color: 'text-text-muted', bg: 'bg-surface-input', border: 'border-border-subtle', label: 'Movimentação' };
};

export const RiskRadar = React.memo(({ alertas }: { alertas: (string | Alerta)[] }) => {
  return (
    <div className="flex flex-col h-[525px] overflow-hidden w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex justify-end mb-2">
           <Badge label={`${alertas.length} Insights`} variant="slate" />
        </div>

        {alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3 opacity-50">
            <ShieldCheck size={40} strokeWidth={1.5} />
            <p className="text-2xs font-semibold uppercase tracking-wider text-center">Nenhum sinal relevante</p>
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
              <div key={index} className={`relative p-4 rounded-xl border ${style.bg} ${style.border} transition-colors duration-150 hover:bg-surface-elevated/40`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-surface-card border border-border-subtle shrink-0 ${style.color}`}>
                    <Icon size={16} />
                  </div>

                  <div className="flex-1 space-y-1.5">
                    <div className="space-y-0.5">
                      <span className={`text-2xs font-semibold uppercase tracking-wider ${style.color}`}>
                        {style.label}
                      </span>
                      <p className="text-xs text-text-primary leading-relaxed font-semibold">
                        {titulo.replace(/⚠️|💎|📈|📉|⚖️|🚨|❗|🏆|🛡️|⚡|🔥/g, '').trim()}
                      </p>
                      {significado && (
                        <p className="text-2xs text-text-muted leading-normal font-medium mt-1">
                          {significado}
                        </p>
                      )}
                    </div>

                    {acao && (
                      <div className="p-2.5 bg-surface-card border border-border-subtle rounded-lg flex items-center gap-2 mt-2">
                        <span className="text-2xs font-semibold text-status-success bg-status-success/10 border border-status-success/20 px-2 py-0.5 rounded-md uppercase shrink-0">
                          Ação
                        </span>
                        <p className="text-2xs text-text-primary leading-snug font-medium">
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

      <div className="p-4 bg-surface-elevated border-t border-border-subtle text-center shrink-0">
        <p className="text-2xs text-text-muted font-semibold uppercase tracking-wider">
            Preço • RSI • VaR • Correlação EWMA • Risco
        </p>
      </div>
    </div>
  );
});

RiskRadar.displayName = 'RiskRadar';
