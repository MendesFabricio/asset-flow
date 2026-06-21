'use client';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';
import { ArrowUp, ArrowDown } from 'lucide-react';

export const MarketTicker = () => {
  const [indices, setIndices] = useState<{
    ibov: { price: number; change: number } | null;
    ifix: { price: number; change: number } | null;
  }>({ ibov: null, ifix: null });

  const [tickerIndex, setTickerIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Busca dados
  useEffect(() => {
    const fetchIndices = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/market/indices`);
        const data = await res.json();
        setIndices({
          ibov: data.ibov || null,
          ifix: data.ifix || null,
        });
      } catch (e) {
        console.error("Erro Ticker:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchIndices();
  }, []);

  const activeTickers = [
    { name: 'IBOV', data: indices.ibov },
    { name: 'IFIX', data: indices.ifix }
  ].filter(item => item.data);

  // Carrossel
  useEffect(() => {
    if (activeTickers.length <= 1) return;
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % activeTickers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTickers.length]);

  if (loading) return null; // Ou um esqueleto de loading se preferir

  const currentTicker = activeTickers[tickerIndex];

  if (!currentTicker) return null;

  return (
    <div key={currentTicker.name} className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-500 cursor-default hover:border-slate-600 transition-colors">
      <span className="text-[10px] font-bold text-slate-400 tracking-wider w-8 text-center">{currentTicker.name}</span>
      <span className="text-xs font-bold text-slate-200 tabular-nums">
        {currentTicker.data?.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
      </span>
      <div className={`flex items-center gap-0.5 text-xs font-bold ${currentTicker.data!.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {currentTicker.data!.change >= 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
        {Math.abs(currentTicker.data!.change).toFixed(2)}%
      </div>
    </div>
  );
};
