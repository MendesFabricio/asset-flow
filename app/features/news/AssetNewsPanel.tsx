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
    if (ticker) {
      setTimeout(() => setLoading(true), 0);
      apiCall<NewsResponse>(`/api/news/${ticker}`)
        .then(data => {
          setNews(data.news || []);
          setAiSentiment(data.ai_sentiment || null);
          setLoading(false);
        })
        .catch(err => {
          console.error("Erro ao carregar notícias:", err);
          setLoading(false);
        });
    }
  }, [ticker]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (ticker && aiSentiment?.status === 'processing') {
      intervalId = setInterval(() => {
        apiCall<NewsResponse>(`/api/news/${ticker}`)
          .then(data => {
            setAiSentiment(data.ai_sentiment || null);
            if (data.news && data.news.length > 0) {
              setNews((prevNews) => prevNews.length === 0 ? data.news : prevNews);
            }
          })
          .catch(err => {
            console.error("Erro no polling de sentimento da IA:", err);
          });
      }, 10000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [ticker, aiSentiment?.status]);

  if (!ticker) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#0b0f19] border-l border-slate-800 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-in-out z-50 p-6 overflow-y-auto flex flex-col">

      <div className="flex justify-between items-center mb-8">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Newspaper size={20} className="text-emerald-500" />
            {ticker}
          </h2>
          <Badge label="Últimas Notícias" variant="slate" />
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* 🤖 PAINEL DE INTELIGÊNCIA ARTIFICIAL */}
      {aiSentiment && (
        <div className="mb-6 p-4 rounded-xl border bg-slate-900/40 border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-mono">
              <Brain size={14} className="text-purple-400" />
              IA Sentiment (Ollama)
            </span>
            <div className="flex items-center gap-2">
              {aiSentiment.status === 'processing' ? (
                <span className="text-[10px] font-bold text-yellow-500 animate-pulse flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" />
                  Processando...
                </span>
              ) : aiSentiment.status === 'success' ? (
                <button
                  onClick={handleReanalyze}
                  disabled={loading}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all flex items-center gap-1 text-[9px] font-bold uppercase border border-slate-800/80 px-1.5 py-0.5"
                  title="Reanalisar sentimento com a IA"
                >
                  <RefreshCw size={10} />
                  Reanalisar
                </button>
              ) : null}
              {aiSentiment.status === 'success' && (
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  aiSentiment.sentiment === 'Positivo' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/20' :
                  aiSentiment.sentiment === 'Negativo' ? 'bg-red-950/80 text-red-400 border border-red-500/20' :
                  'bg-slate-800 text-slate-300'
                }`}>
                  {aiSentiment.sentiment}
                </span>
              )}
              {aiSentiment.status === 'error' && (
                <span className="text-[10px] font-bold text-red-400">
                  Offline
                </span>
              )}
            </div>
          </div>
          
          <div className="text-xs text-slate-300 leading-relaxed">
            {aiSentiment.status === 'processing' ? (
              <div className="space-y-2">
                <Skeleton className="h-3 w-full bg-slate-800" />
                <Skeleton className="h-3 w-5/6 bg-slate-800" />
              </div>
            ) : aiSentiment.status === 'success' ? (
              <Markdown text={aiSentiment.summary || ''} />
            ) : aiSentiment.status === 'idle' ? (
              <div className="flex flex-col gap-2 py-2 items-center justify-center text-center">
                <p className="text-slate-400 font-medium italic">Nenhuma análise disponível para este ativo.</p>
                <button
                  onClick={handleReanalyze}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 border border-purple-500 shadow-md"
                >
                  <Brain size={12} />
                  Analisar com IA
                </button>
              </div>
            ) : (
              <p className="text-slate-500 italic">Análise indisponível. Certifique-se de que o Ollama está rodando localmente com o modelo llama3.2:3b.</p>
            )}
          </div>
          {aiSentiment.status === 'success' && aiSentiment.updated_at && (
            <span className="text-[9px] text-slate-500 font-medium font-mono">
              Atualizado em: {new Date(aiSentiment.updated_at).toLocaleString('pt-BR')}
            </span>
          )}
        </div>
      )}

      <div className="space-y-4 flex-1">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 border border-slate-800 rounded-xl space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : news.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
            <Newspaper size={48} className="mb-4" />
            <p className="text-sm font-medium">Nenhuma notícia encontrada para este ativo.</p>
          </div>
        ) : (
          news.map((item, idx) => (
            <a
              key={idx}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="block p-4 bg-slate-900/40 hover:bg-slate-800/60 rounded-xl border border-slate-800 hover:border-emerald-500/30 transition-all group"
            >
              <h3 className="text-sm font-bold text-slate-200 mb-3 group-hover:text-emerald-400 transition-colors leading-snug">
                {item.title}
              </h3>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span className="flex items-center gap-1.5">
                  <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                  {item.source}
                </span>
                <ExternalLink size={12} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </a>
          ))
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-slate-800/50 text-center">
        <p className="text-[10px] text-slate-600 font-medium uppercase tracking-widest">Fonte: Yahoo Finance</p>
      </div>
    </div>
  );
}
