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
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';

export const RiskRadar = React.memo(({ alertas }: { alertas: string[] }) => {
  
  const analyzeAlert = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('oportunidade') || t.includes('graham') || t.includes('desconto')) {
      return { icon: Sparkles, color: 'text-emerald-400', bg: 'bg-emerald-500/5', border: 'border-emerald-500/20', label: 'Oportunidade' };
    }
    if (t.includes('rebalancear') || t.includes('meta')) {
      return { icon: Scale, color: 'text-amber-400', bg: 'bg-amber-500/5', border: 'border-amber-500/20', label: 'Ajuste' };
    }
    if (t.includes('esticado') || t.includes('rsi alto') || t.includes('alerta')) {
      return { icon: Siren, color: 'text-rose-400', bg: 'bg-rose-500/5', border: 'border-rose-500/20', label: 'Risco Elevado' };
    }
    if (t.includes('mínima') || t.includes('fundo')) {
      return { icon: Anchor, color: 'text-cyan-400', bg: 'bg-cyan-500/5', border: 'border-cyan-500/20', label: 'Suporte' };
    }
    return { icon: Activity, color: 'text-slate-400', bg: 'bg-slate-500/5', border: 'border-slate-500/20', label: 'Movimentação' };
  };

  return (
    /* h-full preenche os 525px do container pai; flex-col organiza header, lista e footer */
    <Card className="flex flex-col h-[525px] overflow-hidden !bg-[#0f172a] !border-slate-800 shadow-2xl p-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Cabeçalho Fixo - shrink-0 garante que a altura não varie */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
             <ShieldCheck size={16} className="text-purple-400" />
          </div>
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest leading-none">Radar de Mercado</h3>
        </div>
        <Badge label={`${alertas.length} Insights`} variant="slate" />
      </div>
      
      {/* Área de Scroll - flex-1 ocupa o espaço central; scrollbar-thin remove o branco */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {alertas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3 opacity-40">
            <ShieldCheck size={40} strokeWidth={1.5} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-center">Nenhum sinal relevante</p>
          </div>
        ) : (
          alertas.map((alerta, index) => {
            const style = analyzeAlert(alerta);
            const Icon = style.icon;
            return (
              <div key={index} className={`relative p-3 rounded-xl border ${style.bg} ${style.border} group transition-all duration-300 hover:bg-slate-800/20`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-slate-950 border border-slate-800 shrink-0 ${style.color}`}>
                    <Icon size={16} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`text-[8px] font-bold uppercase tracking-widest ${style.color}`}>
                      {style.label}
                    </span>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-bold">
                      {alerta.replace(/⚠️|💎|📈|📉|⚖️/g, '').trim()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Fixo - Simétrico ao CategorySummary */}
      <div className="p-5 bg-slate-900 border-t border-slate-800 text-center shrink-0">
        <p className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em]">
            Análise baseada em Preço e RSI
        </p>
      </div>
    </Card>
  );
});

RiskRadar.displayName = 'RiskRadar';
