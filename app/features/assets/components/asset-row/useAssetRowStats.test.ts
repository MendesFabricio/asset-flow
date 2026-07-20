import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAssetRowStats } from './useAssetRowStats';
import { Asset } from '@/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    ticker: 'PETR4',
    tipo: 'Ação',
    qtd: 100,
    pm: 20,
    meta: 10,
    preco_atual: 25,
    min_6m: 18,
    total_atual: 2500,
    total_investido: 2000,
    lucro_valor: 500,
    lucro_pct: 25,
    pct_na_categoria: 12,
    falta_comprar: 0,
    recomendacao: 'Manter',
    status: 'MANTER',
    score: 50,
    motivo: 'Momentum forte • Preço atrativo',
    ...overrides,
  };
}

describe('useAssetRowStats', () => {
  it('formats BRL price by default', () => {
    const { result } = renderHook(() => useAssetRowStats(makeAsset()));
    expect(result.current.isUSD).toBe(false);
    expect(result.current.displayPrice).toContain('25');
  });

  it('formats USD price with $ prefix', () => {
    const { result } = renderHook(() =>
      useAssetRowStats(makeAsset({ currency: 'USD', preco_atual: 12.5, pm: 10 }))
    );
    expect(result.current.isUSD).toBe(true);
    expect(result.current.displayPrice).toBe('$ 12.50');
    expect(result.current.displayPM).toBe('$ 10.00');
  });

  it('splits motivos by the bullet separator', () => {
    const { result } = renderHook(() => useAssetRowStats(makeAsset()));
    expect(result.current.motivosLista).toEqual(['Momentum forte', 'Preço atrativo']);
  });

  it('computes overweight when pct exceeds meta', () => {
    const { result } = renderHook(() => useAssetRowStats(makeAsset({ pct_na_categoria: 15, meta: 10 })));
    expect(result.current.isOverweight).toBe(true);
    expect(result.current.percentualDaMeta).toBe(150);
    expect(result.current.barraWidth).toBe(100);
  });

  it('detects reports availability', () => {
    const { result } = renderHook(() =>
      useAssetRowStats(makeAsset({ last_report_url: 'http://x/report.pdf' }))
    );
    expect(result.current.hasReports).toBe(true);
  });

  it('computes positive intraday variation financials', () => {
    const { result } = renderHook(() =>
      useAssetRowStats(makeAsset({ change_percent: 10, total_atual: 1100 }))
    );
    expect(result.current.isPositiveIntraday).toBe(true);
    expect(Math.round(result.current.variacaoFinanceira)).toBe(100);
  });
});
