'use client';
import { useState, useEffect } from 'react';
import { X, ExternalLink, Newspaper, Brain, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { apiCall } from '@/lib/api';
import { Markdown } from '@/components/ui/Markdown';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

interface AiSentiment {
  summary: string | null;
  sentiment: string | null;
  status: 'idle' | 'processing' | 'success' | 'error';
  updated_at: string | null;
}

interface NewsResponse {
  news: NewsItem[];
  ai_sentiment: AiSentiment;
}

interface Props {
  ticker: string | null;
  onClose: () => void;
}

export function AssetNewsPanel({ ticker, onClose }: Props) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [aiSentiment, setAiSentiment] = useState<AiSentiment | null>(null);
  const [loading, setLoading] = useState(false);

  const handleReanalyze = () => {
    if (!ticker) return;
    setAiSentiment(prev => prev ? { ...prev, status: 'processing' } : { status: 'processing', summary: '', sentiment: 'Neutro', updated_at: null });
    apiCall<NewsResponse>(`/api/news/${ticker}?force=true`)
      .then(data => {
        setAiSentiment(data.ai_sentiment || null);
      })
      .catch(err => {
        console.error("Erro ao solicitar reanálise:", err);
      });
  };

  useEffect(() => {
    const controller = new AbortController();

    if (ticker) {
      setTimeout(() => setLoading(true), 0);
      apiCall<NewsResponse>(`/api/news/${ticker}`, { signal: controller.signal })
        .then(data => {
          setNews(data.news || []);
          setAiSentiment(data.ai_sentiment || null);
          setLoading(false);
        })
        .catch(err => {
          if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
          console.error("Erro ao carregar notícias:", err);
          setLoading(false);
        });
    }

    return () => {
      controller.abort();
    };
  }, [ticker]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    const controller = new AbortController();

    if (ticker && aiSentiment?.status === 'processing') {
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        apiCall<NewsResponse>(`/api/news/${ticker}`, { signal: controller.signal })
          .then(data => {
            setAiSentiment(data.ai_sentiment || null);
            if (data.news && data.news.length > 0) {
              setNews((prevNews) => prevNews.length === 0 ? data.news : prevNews);
            }
          })
          .catch(err => {
            if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
            console.error("Erro no polling de sentimento da IA:", err);
          });
      }, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      controller.abort();
    };
  }, [ticker, aiSentiment?.status]);

  if (!ticker) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-surface border-l border-border-subtle shadow-xl transform transition-transform duration-300 ease-in-out z-50 p-6 overflow-y-auto flex flex-col h-full">

      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <Newspaper size={20} className="text-status-success" />
            {ticker}
          </h2>
          <Badge label="Últimas Notícias" variant="slate" />
        </div>
        <button
          onClick={onClose}
          className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded-lg transition-colors"
        >
          <X size={24} />
        </button>
      </div>

      {/* 🤖 PAINEL DE INTELIGÊNCIA ARTIFICIAL */}
      {aiSentiment && (
        <div className="mb-6 p-4 rounded-xl border bg-surface-card border-border-subtle flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5 font-mono">
              <Brain size={14} className="text-accent" />
              IA Sentiment (Ollama)
            </span>
            <div className="flex items-center gap-2">
              {aiSentiment.status === 'processing' ? (
                <span className="text-2xs font-semibold text-status-warning flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" />
                  Processando...
                </span>
              ) : aiSentiment.status === 'success' ? (
                <button
                  onClick={handleReanalyze}
                  disabled={loading}
                  className="text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded-md transition-colors flex items-center gap-1 text-2xs font-semibold uppercase border border-border-subtle px-1.5 py-0.5"
                  title="Reanalisar sentimento com a IA"
                >
                  <RefreshCw size={10} />
                  Reanalisar
                </button>
              ) : null}
              {aiSentiment.status === 'success' && (
                <span className={`text-2xs font-semibold uppercase px-2 py-0.5 rounded-md border ${
                  aiSentiment.sentiment === 'Positivo' ? 'bg-status-success/15 text-status-success border-status-success/20' :
                  aiSentiment.sentiment === 'Negativo' ? 'bg-status-error/15 text-status-error border-status-error/20' :
                  'bg-surface-input text-text-muted border-border-subtle'
                }`}>
                  {aiSentiment.sentiment}
                </span>
              )}
              {aiSentiment.status === 'error' && (
                <span className="text-2xs font-semibold text-status-error">
                  Offline
                </span>
              )}
            </div>
          </div>
          
          <div className="text-xs text-text-primary leading-relaxed">
            {aiSentiment.status === 'processing' ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ) : aiSentiment.status === 'success' ? (
              <Markdown text={aiSentiment.summary || ''} />
            ) : aiSentiment.status === 'idle' ? (
              <div className="flex flex-col gap-2 py-2 items-center justify-center text-center">
                <p className="text-text-muted font-medium">Nenhuma análise disponível para este ativo.</p>
                <button
                  onClick={handleReanalyze}
                  className="px-3 py-1.5 bg-accent hover:bg-accent/90 text-white font-semibold text-2xs uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Brain size={12} />
                  Analisar com IA
                </button>
              </div>
            ) : (
              <p className="text-text-muted">Análise indisponível. Certifique-se de que o Ollama está rodando localmente com o modelo llama3.2:3b.</p>
            )}
          </div>
          {aiSentiment.status === 'success' && aiSentiment.updated_at && (
            <span className="text-2xs text-text-muted font-medium font-mono tabular-nums">
              Atualizado em: {new Date(aiSentiment.updated_at).toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4 flex-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border border-border-subtle rounded-xl space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <Newspaper size={48} className="mb-4 text-text-muted" />
            <p className="text-sm font-medium text-text-muted">Nenhuma notícia encontrada para este ativo.</p>
          </div>
        ) : (
          news.map((item, idx) => (
            <a
              key={idx}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="block p-4 bg-surface-card hover:bg-surface-elevated rounded-xl border border-border-subtle hover:border-accent/40 transition-colors group"
            >
              <h3 className="text-sm font-semibold text-text-primary mb-3 group-hover:text-accent transition-colors leading-snug">
                {item.title}
              </h3>
              <div className="flex justify-between items-center text-2xs font-semibold uppercase tracking-wider text-text-muted">
                <span>{item.source}</span>
                <ExternalLink size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </a>
          ))
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-border-subtle text-center">
        <p className="text-2xs text-text-muted font-medium uppercase tracking-wider">Fonte: Yahoo Finance</p>
      </div>
    </div>
  );
}
