'use client';

import { useMemo, useCallback } from 'react';
import { Asset } from '../types';

export function usePortfolioMetrics(data: any, isHidden: boolean, formatMoney: (v: number) => string) {
  const topCompras = useMemo(() => {
    return data?.ativos?.filter((a: any) => a.falta_comprar > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 3) || [];
  }, [data?.ativos]);

  const lucroTotal = useMemo(() => {
    return data?.resumo?.LucroTotal || 0;
  }, [data?.resumo?.LucroTotal]);

  const totalInvestido = useMemo(() => {
    return data?.resumo?.TotalInvestido ?? 0;
  }, [data?.resumo?.TotalInvestido]);

  const rendaMensal = useMemo(() => {
    return data?.resumo?.RendaMensal ?? 0;
  }, [data?.resumo?.RendaMensal]);

  const yocMedio = useMemo(() => {
    return totalInvestido > 0 ? ((rendaMensal * 12) / totalInvestido) * 100 : 0;
  }, [totalInvestido, rendaMensal]);

  const variacaoDiariaTotal = useMemo(() => {
    return data?.ativos?.reduce((acc: number, asset: Asset) => {
      const variacaoPct = (asset as Asset & { change_percent?: number }).change_percent || 0;
      const totalAtual = asset.total_atual || 0;
      const valOntem = totalAtual / (1 + variacaoPct / 100);
      return acc + (totalAtual - valOntem);
    }, 0) || 0;
  }, [data?.ativos]);

  const money = useCallback((val: number) => isHidden ? '••••••' : formatMoney(val), [isHidden, formatMoney]);

  return {
    topCompras,
    lucroTotal,
    totalInvestido,
    rendaMensal,
    yocMedio,
    variacaoDiariaTotal,
    money,
  };
}
