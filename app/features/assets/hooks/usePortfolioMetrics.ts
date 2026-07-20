'use client';

import { useMemo, useCallback } from 'react';
import { Asset, DashboardData } from '@/types';

export function usePortfolioMetrics(data: DashboardData | undefined, isHidden: boolean, formatMoney: (v: number) => string) {
  const topCompras = useMemo(() => {
    return data?.ativos?.filter((a: Asset) => a.falta_comprar > 0).sort((a: Asset, b: Asset) => (b.score || 0) - (a.score || 0)).slice(0, 3) || [];
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
      let variacaoPct = (asset as Asset & { change_percent?: number }).change_percent || 0;
      
      const todayDate = new Date().toISOString().split('T')[0];
      if (asset.mdata_date && asset.mdata_date !== todayDate) {
        variacaoPct = 0;
      }

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
