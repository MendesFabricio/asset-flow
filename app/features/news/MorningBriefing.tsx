'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Coffee, ChevronDown, ChevronUp, Brain, RefreshCw, AlertCircle, Loader2, Target, BarChart3, Newspaper, ExternalLink } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { Markdown } from '@/components/ui/Markdown';

interface NewsHighlight {
  ticker: string;
  title: string;
  link: string;
  source?: string;
}

interface BriefData {
  status: string;
  selic_rate: string;
  dolar_rate: string;
  rationale: string;
  brief_text: string;
  action: string;
  risk_metrics: Record<string, string | number | undefined>;
  news_highlights?: NewsHighlight[];
}

export function MorningBriefing() {
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCoT, setShowCoT] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBrief = useCallback(async (force = false, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (pollRef.current) clearTimeout(pollRef.current);
    try {
      const endpoint = force ? '/api/ai/morning-brief?force=true' : '/api/ai/morning-brief';
      const result = await apiCall<BriefData>(endpoint, { timeout: 30000, signal });
      setData(result);
      // Se IA ainda processando, sonda novamente em 20s (menos agressivo)
      if (result.status === 'Processando') {
        pollRef.current = setTimeout(() => fetchBrief(false, signal), 20000);
      }
    } catch (e: unknown) {
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('AbortError'))) return;
      console.error(e);
      setError('Falha ao conectar com o serviço de inteligência.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Atraso de 5s para não disparar junto com MarketTicker (3s) e outros componentes do header
    const init = setTimeout(() => fetchBrief(false, controller.signal), 5000);
    return () => {
      clearTimeout(init);
      if (pollRef.current) clearTimeout(pollRef.current);
      controller.abort();
    };
  }, [fetchBrief]);


  if (loading) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 mb-6 animate-pulse">
        <div className="flex justify-between items-center mb-3">
          <div className="h-5 bg-surface-input rounded w-40" />
          <div className="flex gap-2">
            <div className="h-5 bg-surface-input rounded w-16" />
            <div className="h-5 bg-surface-input rounded w-16" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-surface-input rounded w-full" />
          <div className="h-3 bg-surface-input rounded w-11/12" />
          <div className="h-3 bg-surface-input rounded w-9/12" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-surface-card border border-status-error/30 rounded-xl p-4 mb-6 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-status-error">
          <AlertCircle size={16} />
          <span className="text-xs font-medium">{error || 'Briefing temporariamente indisponível.'}</span>
        </div>
        <button
          onClick={() => fetchBrief(false)}
          className="text-text-muted hover:text-text-primary transition-colors p-1 hover:bg-surface-elevated rounded-lg"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm transition-colors hover:border-accent/30 h-[650px] overflow-y-auto">
      <div className="flex flex-col justify-between items-start gap-4 border-b border-border-subtle pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-accent-soft rounded-lg border border-accent/20 text-accent">
            <Coffee size={16} />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-primary">Briefing Matinal de IA</h3>
            <p className="text-2xs text-text-muted">Resumo macroeconômico e riscos ponderados</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {data.selic_rate && (
            <span className="text-2xs font-semibold px-2.5 py-0.5 rounded-md bg-surface-input text-text-muted border border-border-subtle tabular-nums">
              Selic: <span className="font-mono text-accent">{data.selic_rate}</span>
            </span>
          )}
          {data.dolar_rate && (
            <span className="text-2xs font-semibold px-2.5 py-0.5 rounded-md bg-surface-input text-text-muted border border-border-subtle tabular-nums">
              Dólar: <span className="font-mono text-status-success">
                {String(data.dolar_rate).includes('R$') ? data.dolar_rate : `R$ ${Number(data.dolar_rate).toFixed(2)}`}
              </span>
            </span>
          )}
          {data.status === 'Processando' && (
            <span className="flex items-center gap-1 text-2xs font-semibold text-status-warning">
              <Loader2 size={11} className="animate-spin" /> Gerando IA...
            </span>
          )}
          <button
            onClick={() => fetchBrief(true)}
            title="Reanalisar com IA (forçar recálculo)"
            className="text-text-muted hover:text-accent hover:bg-surface-elevated p-1.5 rounded-lg transition-colors flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider border border-border-subtle"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            <span>Reanalisar</span>
          </button>
        </div>
      </div>

      <div className="text-xs text-text-primary leading-relaxed font-normal">
        <Markdown text={data.brief_text} />
      </div>

      {data.action && (
        <div className="mt-3 p-3 rounded-xl bg-status-success/10 border border-status-success/30 text-status-success">
          <div className="flex items-center gap-2 mb-1">
            <Target size={14} />
            <span className="text-2xs font-semibold uppercase tracking-wider text-status-success">Ação Recomendada</span>
          </div>
          <p className="text-xs text-text-primary leading-relaxed">{data.action}</p>
        </div>
      )}

      {data.risk_metrics && Object.keys(data.risk_metrics).length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-surface-input border border-border-subtle">
          <div className="flex items-center gap-2 mb-2.5">
            <BarChart3 size={14} className="text-accent" />
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">Métricas de Risco</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {Object.entries(data.risk_metrics).map(([key, value]) => {
              const labelMap: Record<string, string> = {
                macro_regime: 'Regime Macro',
                fx_bias: 'Viés Cambial',
                posture: 'Postura',
              };
              const rawVal = String(value || '').trim();
              const cleanVal = rawVal.includes('|') ? rawVal.split('|')[0].trim() : rawVal;
              return (
                <div key={key} className="bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-center">
                  <div className="text-2xs text-text-muted uppercase tracking-wider mb-0.5">
                    {labelMap[key] || key}
                  </div>
                  <div className="text-xs font-mono font-semibold text-text-primary tabular-nums">{cleanVal}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {data.news_highlights && data.news_highlights.length > 0 && (
        <div className="mt-3 p-3 rounded-xl bg-surface-input border border-border-subtle">
          <div className="flex items-center gap-2 mb-2">
            <Newspaper size={14} className="text-accent" />
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted">
              Principais Notícias da Carteira
            </span>
          </div>
          <ul className="space-y-2">
            {data.news_highlights.map((item, idx) => (
              <li key={`${item.ticker}-${idx}`} className="flex items-start justify-between gap-2 text-xs">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-primary hover:text-accent transition-colors leading-snug flex-1"
                >
                  <span className="inline-block font-mono text-2xs font-semibold px-1.5 py-0.5 mr-1.5 rounded-md bg-accent-soft text-accent border border-accent/20">
                    {item.ticker}
                  </span>
                  {item.title}
                </a>
                <ExternalLink size={12} className="text-text-muted shrink-0 mt-0.5" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.rationale && (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <button
            onClick={() => setShowCoT(!showCoT)}
            className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-accent hover:text-accent/80 transition-colors"
          >
            <Brain size={12} />
            <span>Ver Raciocínio de Risco (CoT)</span>
            {showCoT ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          
          {showCoT && (
            <div className="mt-2.5 p-3 rounded-xl bg-surface-input border border-border-subtle text-2xs text-text-muted leading-relaxed">
              <Markdown text={data.rationale} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
