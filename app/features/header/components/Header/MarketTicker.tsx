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
    const intervalFetch = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchIndices();
    }, 120000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalFetch);
    };
  }, []);

  const activeTickers = React.useMemo(() => [
    { label: 'IBOV', key: 'ibov', data: indices.ibov, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'IFIX', key: 'ifix', data: indices.ifix, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'NASDAQ', key: 'nasdaq', data: indices.nasdaq, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'S&P 500', key: 'sp500', data: indices.sp500, format: (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' },
    { label: 'DÓLAR', key: 'dolar', data: indices.dolar, format: (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
    { label: 'BTC', key: 'btc', data: indices.btc, format: (v: number) => 'US$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) }
  ].filter(t => t.data) as Array<{ label: string; key: string; data: IndexData; format: (v: number) => string }>, [indices]);

  // Rotação do carrossel (pausa quando a aba está oculta)
  useEffect(() => {
    if (activeTickers.length <= 1) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setTickerIndex((prev) => (prev + 1) % activeTickers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTickers.length]);

  if (loading || activeTickers.length === 0) {
    return (
      <div className="h-7 w-[210px] bg-surface-card border border-border-subtle rounded-md animate-pulse" />
    );
  }

  const current = activeTickers[tickerIndex];
  const isPositive = current.data.change >= 0;

  return (
    <div className="relative group/ticker">
      <div className="flex items-center justify-between w-[210px] px-3 py-1 bg-surface-card hover:bg-surface-elevated border border-border-subtle rounded-md cursor-pointer transition-colors duration-150 select-none">
        <span className="text-2xs font-semibold text-text-muted tracking-wider uppercase">{current.label}</span>
        
        <span className="text-xs font-semibold text-text-primary font-mono tabular-nums">
          {current.format(current.data.price)}
        </span>
        
        <span className={`text-2xs font-semibold flex items-center font-mono tabular-nums leading-none ${
          isPositive ? 'text-status-success' : 'text-status-error'
        }`}>
          <span className="mr-0.5 text-2xs">{isPositive ? '▲' : '▼'}</span>
          {Math.abs(current.data.change).toFixed(2)}%
        </span>
      </div>

      {/* TOOLTIP INTERATIVO */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-surface-card border border-border-subtle rounded-xl shadow-lg p-3 opacity-0 invisible group-hover/ticker:opacity-100 group-hover/ticker:visible transition-opacity duration-150 z-50 pointer-events-none">
        <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Informações do Índice</p>
        <p className="text-xs font-semibold text-text-primary mt-1">{current.label}</p>
        
        <div className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-2xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Valor Atual:</span>
            <span className="font-mono text-text-primary font-semibold tabular-nums">{current.format(current.data.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Variação 24h:</span>
            <span className={`font-semibold font-mono tabular-nums ${isPositive ? 'text-status-success' : 'text-status-error'}`}>
              {isPositive ? '+' : '-'}{Math.abs(current.data.change).toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between text-2xs text-text-muted mt-1 border-t border-border-subtle pt-1">
            <span>Última Coleta:</span>
            <span className="tabular-nums">{lastUpdate || '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

MarketTicker.displayName = 'MarketTicker';
