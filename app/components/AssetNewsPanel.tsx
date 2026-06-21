'use client';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { X, ExternalLink, Newspaper, icon as LucideIcon } from 'lucide-react';
import { Skeleton } from './ui/Skeleton';
import { Badge } from './ui/Badge';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  published: string;
}

interface Props {
  ticker: string | null;
  onClose: () => void;
}

export default function AssetNewsPanel({ ticker, onClose }: Props) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ticker) {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/news/${ticker}`)
        .then(res => res.json())
        .then(data => {
          setNews(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [ticker]);

  if (!ticker) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#0b0f19] border-l border-slate-800 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-in-out z-50 p-6 overflow-y-auto flex flex-col">
      
      {/* Cabeçalho - Mais espaçado e elegante */}
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

      {/* Lista de Notícias */}
      <div className="space-y-4 flex-1">
        {loading ? (
          // Uso do novo componente Skeleton para um loading mais "premium"
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
      
      {/* Footerzinho sutil */}
      <div className="mt-8 pt-4 border-t border-slate-800/50 text-center">
         <p className="text-[10px] text-slate-600 font-medium uppercase tracking-widest">Fonte: Yahoo Finance</p>
      </div>
    </div>
  );
}
