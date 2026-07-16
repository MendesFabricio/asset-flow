'use client';

import React, { useState, useEffect } from 'react';
import { apiCall } from '@/lib/api';

interface IndexData {
  price: number;
  change: number;
}

interface MarketIndices {
  ibov?: IndexData;
  ifix?: IndexData;
  nasdaq?: IndexData;
  sp500?: IndexData;
  dolar?: IndexData;
  btc?: IndexData;
}

export const MarketTicker = React.memo(() => {
  const [indices, setIndices] = useState<MarketIndices>({});
  const [tickerIndex, setTickerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    async function fetchIndices() {
      try {
        const data = await apiCall<MarketIndices>('/api/market/indices');
        setIndices(data);
        setLastUpdate(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      } catch (e) {
        console.error("Erro ao buscar índices de mercado:", e);
      } finally {
        setLoading(false);
      }
    }

    // Atraso de 3s para escalonar os pollings iniciais do header
    const initialTimer = setTimeout(fetchIndices, 3000);
    // Índices são atualizados pelo worker a cada 3min; polling a cada 2min é suficiente
    const intervalFetch = setInterval(fetchIndices, 120000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalFetch);
    };
  }, []);

  const activeTickers = [
    { label: 'IBOV', key: 'ibov', data: indices.ibov, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'IFIX', key: 'ifix', data: indices.ifix, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'NASDAQ', key: 'nasdaq', data: indices.nasdaq, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'S&P 500', key: 'sp500', data: indices.sp500, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'DÓLAR', key: 'dolar', data: indices.dolar, format: (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
    { label: 'BTC', key: 'btc', data: indices.btc, format: (v: number) => 'US$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
  ].filter(t => t.data) as Array<{ label: string; key: string; data: IndexData; format: (v: number) => string }>;

  // Rotação do carrossel
  useEffect(() => {
    if (activeTickers.length <= 1) return;
    const interval = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % activeTickers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTickers.length]);

  if (loading || activeTickers.length === 0) {
    return (
      <div className="h-7 w-[210px] bg-slate-900/50 border border-slate-800 rounded-full animate-pulse" />
    );
  }

  const current = activeTickers[tickerIndex];
  const isPositive = current.data.change >= 0;

  return (
    <div className="relative group/ticker">
      <div className="flex items-center justify-between w-[210px] px-3 py-1 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-full shadow-sm cursor-pointer hover:border-slate-700 transition-all select-none duration-300">
        <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">{current.label}</span>
        
        <span className="text-xs font-semibold text-slate-200 font-mono tabular-nums">
          {current.format(current.data.price)}
        </span>
        
        <span className={`text-[10px] font-bold flex items-center font-mono tabular-nums leading-none ${
          isPositive ? 'text-emerald-500' : 'text-rose-500'
        }`}>
          <span className="mr-0.5 text-[8px]">{isPositive ? '▲' : '▼'}</span>
          {Math.abs(current.data.change).toFixed(2)}%
        </span>
      </div>

      {/* TOOLTIP INTERATIVO */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-3 opacity-0 invisible group-hover/ticker:opacity-100 group-hover/ticker:visible transition-all duration-200 z-50 pointer-events-none">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Informações do Índice</p>
        <p className="text-xs font-bold text-slate-200 mt-1">{current.label}</p>
        
        <div className="mt-2 space-y-1 border-t border-slate-900 pt-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-500">Valor Atual:</span>
            <span className="font-mono text-slate-300 font-semibold">{current.format(current.data.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Variação 24h:</span>
            <span className={`font-semibold font-mono ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
              {isPositive ? '+' : '-'}{Math.abs(current.data.change).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-1 border-t border-slate-900/60 pt-1">
            <span>Última Coleta:</span>
            <span>{lastUpdate || '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

MarketTicker.displayName = 'MarketTicker';
