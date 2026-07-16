'use client';

import { useState, useEffect, useRef } from 'react';
import { Coffee, ChevronDown, ChevronUp, Brain, RefreshCw, AlertCircle, Loader2, Target, BarChart3 } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { Markdown } from '@/components/ui/Markdown';

interface BriefData {
  status: string;
  selic_rate: string;
  dolar_rate: string;
  rationale: string;
  brief_text: string;
  action: string;
  risk_metrics: Record<string, any>;
}

export function MorningBriefing() {
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCoT, setShowCoT] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBrief = async (force = false) => {
    setLoading(true);
    setError(null);
    if (pollRef.current) clearTimeout(pollRef.current);
    try {
      const endpoint = force ? '/api/ai/morning-brief?force=true' : '/api/ai/morning-brief';
      const result = await apiCall<BriefData>(endpoint, { timeout: 30000 });
      setData(result);
      // Se IA ainda processando, sonda novamente em 20s (menos agressivo)
      if (result.status === 'Processando') {
        pollRef.current = setTimeout(() => fetchBrief(false), 20000);
      }
    } catch (e: any) {
      console.error(e);
      setError('Falha ao conectar com o serviço de inteligência.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Atraso de 5s para não disparar junto com MarketTicker (3s) e outros componentes do header
    const init = setTimeout(() => fetchBrief(), 5000);
    return () => {
      clearTimeout(init);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);


  if (loading) {
    return (
      <div className="bg-slate-900/40 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 mb-6 animate-pulse">
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-slate-800 rounded w-40" />
          <div className="flex gap-2">
            <div className="h-5 bg-slate-800 rounded w-16" />
            <div className="h-5 bg-slate-800 rounded w-16" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-800 rounded w-full" />
          <div className="h-3 bg-slate-800 rounded w-11/12" />
          <div className="h-3 bg-slate-800 rounded w-9/12" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900/40 border border-red-900/30 backdrop-blur-md rounded-2xl p-4 mb-6 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-xs font-medium">{error || 'Briefing temporariamente indisponível.'}</span>
        </div>
        <button
          onClick={() => fetchBrief(false)}
          className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800/50 rounded-lg"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-slate-950 via-slate-900/90 to-slate-950 border border-slate-800/80 backdrop-blur-md rounded-2xl p-5 shadow-2xl transition-all hover:border-blue-500/30 h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
      <div className="flex flex-col justify-between items-start gap-4 border-b border-slate-800/60 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400">
            <Coffee size={16} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-200">Briefing Matinal de IA</h3>
            <p className="text-[10px] text-slate-500">Resumo macroeconômico e riscos ponderados</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.selic_rate && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
              Selic: <span className="font-mono text-blue-400">{data.selic_rate}</span>
            </span>
          )}
          {data.dolar_rate && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
              Dólar: <span className="font-mono text-emerald-400">
                {String(data.dolar_rate).includes('R$') ? data.dolar_rate : `R$ ${Number(data.dolar_rate).toFixed(2)}`}
              </span>
            </span>
          )}
          {data.status === 'Processando' && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
              <Loader2 size={11} className="animate-spin" /> Gerando IA...
            </span>
          )}
          <button
            onClick={() => fetchBrief(true)}
            title="Reanalisar com IA (forçar recálculo)"
            className="text-slate-500 hover:text-indigo-400 hover:bg-slate-800/50 p-1.5 rounded-lg transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider border border-slate-850"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            <span>Reanalisar</span>
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-300 leading-relaxed font-normal">
        <Markdown text={data.brief_text} />
      </div>

      {data.action && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Ação Recomendada</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{data.action}</p>
        </div>
      )}

      {data.risk_metrics && Object.keys(data.risk_metrics).length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-850">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Métricas de Risco</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.risk_metrics).map(([key, value]) => (
              <div key={key} className="text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{key}</div>
                <div className="text-xs font-mono font-semibold text-slate-200">{String(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}


      {data.rationale && (
        <div className="mt-3 border-t border-slate-800/40 pt-3">
          <button
            onClick={() => setShowCoT(!showCoT)}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400/80 hover:text-blue-400 transition-colors"
          >
            <Brain size={12} />
            <span>Ver Raciocínio de Risco (CoT)</span>
            {showCoT ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          
          {showCoT && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-850 text-[11px] text-slate-400 leading-relaxed animate-in fade-in slide-in-from-top-1">
              <Markdown text={data.rationale} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
