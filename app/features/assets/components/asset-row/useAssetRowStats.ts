import { useMemo } from 'react';
import { formatMoney } from '@/lib/format';
import { Asset } from '@/types';

export interface AssetRowStats {
  isUSD: boolean;
  variacaoIntraday: number;
  isPositiveIntraday: boolean;
  variacaoFinanceira: number;
  motivosLista: string[];
  percentualDaMeta: number;
  barraWidth: number;
  isOverweight: boolean;
  displayPrice: string;
  displayPM: string;
  hasReports: boolean;
}

  export function useAssetRowStats(ativo: Asset): AssetRowStats {
    return useMemo(() => {
      const isUSD = ativo.currency === 'USD';
      
      const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
      let variacaoIntraday = ativo.change_percent ?? 0;
      
      const todayDate = new Date().toISOString().split('T')[0];
      if (ativo.mdata_date && ativo.mdata_date !== todayDate) {
        variacaoIntraday = 0;
      }
  
      const isPositiveIntraday = variacaoIntraday >= 0;
  
      const divisor = 1 + variacaoIntraday / 100;
    const variacaoFinanceira = divisor > 0.0001 ? ativo.total_atual - ativo.total_atual / divisor : 0;

    const motivosRaw = ativo.motivo || '';
    const separator = motivosRaw.includes(' • ') ? ' • ' : ' + ';
    const motivosLista = motivosRaw ? motivosRaw.split(separator) : [];

    const percentualDaMeta = ativo.meta > 0 ? (ativo.pct_na_categoria / ativo.meta) * 100 : 0;

    return {
      isUSD,
      variacaoIntraday,
      isPositiveIntraday,
      variacaoFinanceira,
      motivosLista,
      percentualDaMeta,
      barraWidth: Math.min(percentualDaMeta, 100),
      isOverweight: ativo.pct_na_categoria > ativo.meta,
      displayPrice: isUSD ? `$ ${ativo.preco_atual.toFixed(2)}` : formatMoney(ativo.preco_atual),
      displayPM: isUSD ? `$ ${ativo.pm.toFixed(2)}` : formatMoney(ativo.pm),
      hasReports:
        !!ativo.last_report_url ||
        (typeof ativo.last_report_type === 'string' && ativo.last_report_type.length > 5) ||
        !!ativo.fundamentalist_data,
    };
  }, [ativo]);
}
