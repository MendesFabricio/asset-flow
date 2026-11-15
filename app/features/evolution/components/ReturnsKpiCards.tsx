'use client';

import useSWR from 'swr';
import { TrendingUp, Award, Landmark, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';

interface ReturnsResponse {
  status: string;
  has_data: boolean;
  start_date?: string;
  end_date?: string;
  days?: number;
  is_short_horizon?: boolean;
  patrimonio_atual: number;
  xirr_aa_pct: number | null;
  xirr_periodo_pct: number | null;
  xirr_real_aa_pct: number | null;
  twr_pct: number | null;
  roi_simples_pct: number | null;
  benchmarks: {
    cdi_pct: number | null;
    cdi_source: string;
    ibov_pct: number | null;
    ipca_pct: number | null;
    pct_cdi: number | null;
  };
  cashflow_summary: {
    total_compras: number;
    total_vendas: number;
    total_dividendos: number;
    aporte_liquido: number;
  };
}

function fmtPct(val: number | null | undefined, suffix = '%'): string {
  if (val === null || val === undefined || Number.isNaN(val)) return 'N/D';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}${suffix}`;
}

export default function ReturnsKpiCards() {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const { data: rawData, isLoading: loading } = useSWR<ReturnsResponse>('/api/performance/returns', apiCall);
  const data = rawData?.status === 'Sucesso' ? rawData : null;

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-surface-card border border-border-subtle animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data || !data.has_data) return null;

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const xirrPositive = (data.xirr_aa_pct ?? 0) >= 0;
  const twrPositive = (data.twr_pct ?? 0) >= 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-text-secondary">
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {data.is_short_horizon ? 'TIR no Período' : 'TIR (XIRR a.a.)'}
          </span>
          <TrendingUp size={16} className={xirrPositive ? 'text-emerald-400' : 'text-rose-400'} />
        </div>
        <div className={`text-2xl font-black mt-2 ${xirrPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {data.is_short_horizon
            ? fmtPct(data.xirr_periodo_pct)
            : fmtPct(data.xirr_aa_pct, '% a.a.')}
        </div>
        <p className="text-[11px] text-text-secondary mt-1">
          {data.is_short_horizon
            ? `Janela curta (${data.days ?? 0}d)`
            : `Período: ${fmtPct(data.xirr_periodo_pct)}`}{' '}
          · Real (IPCA): {fmtPct(data.xirr_real_aa_pct, '% a.a.')}
        </p>
      </Card>

      <Card className="p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-text-secondary">
          <span className="text-[11px] font-bold uppercase tracking-wider">TWR (Modified Dietz)</span>
          <Award size={16} className={twrPositive ? 'text-blue-400' : 'text-rose-400'} />
        </div>
        <div className={`text-2xl font-black mt-2 ${twrPositive ? 'text-text-primary' : 'text-rose-400'}`}>
          {fmtPct(data.twr_pct)}
        </div>
        <p className="text-[11px] text-text-secondary mt-1">
          ROI simples s/ compras: {fmtPct(data.roi_simples_pct)}
        </p>
      </Card>

      <Card className="p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-text-secondary">
          <span className="text-[11px] font-bold uppercase tracking-wider">vs. CDI & Benchmarks</span>
          <Landmark size={16} className="text-amber-400" />
        </div>
        <div className="text-2xl font-black text-text-primary mt-2">
          {data.benchmarks.pct_cdi !== null ? `${data.benchmarks.pct_cdi.toFixed(1)}% CDI` : 'N/D'}
        </div>
        <p className="text-[11px] text-text-secondary mt-1">
          CDI: {fmtPct(data.benchmarks.cdi_pct)}
          {data.benchmarks.cdi_source === 'fallback' || data.benchmarks.cdi_source === 'bcb_stale_cache'
            ? ' (estimado)'
            : ''}{' '}
          · IPCA: {fmtPct(data.benchmarks.ipca_pct)}
          {data.benchmarks.ibov_pct !== null ? ` · IBOV: ${fmtPct(data.benchmarks.ibov_pct)}` : ''}
        </p>
      </Card>

      <Card className="p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-text-secondary">
          <span className="text-[11px] font-bold uppercase tracking-wider">Aporte Líq. & Proventos</span>
          <Wallet size={16} className="text-purple-400" />
        </div>
        <div className="text-2xl font-black text-text-primary mt-2">
          {maskMoney(data.cashflow_summary.aporte_liquido)}
        </div>
        <p className="text-[11px] text-text-secondary mt-1">
          Proventos recebidos: {maskMoney(data.cashflow_summary.total_dividendos)}
        </p>
      </Card>
    </div>
  );
}
