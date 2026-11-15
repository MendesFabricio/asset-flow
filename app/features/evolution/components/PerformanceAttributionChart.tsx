'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Loader2, Layers } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';

interface AttributionPoint {
  year: number;
  month: number;
  period: string;
  patrimonio_inicio: number;
  patrimonio_fim: number;
  aportes_liquidos: number;
  crescimento_custodia: number;
  variacao_mercado: number;
  dividendos: number;
  retorno_total: number;
  ipca_mes_pct: number;
  erosao_ipca: number;
  variacao_mercado_real: number;
  retorno_total_real: number;
}

interface AttributionResponse {
  status: string;
  ipca_source: string;
  series: AttributionPoint[];
  summary: {
    patrimonio_atual: number;
    total_aportes_liquidos: number;
    total_variacao_mercado: number;
    total_dividendos: number;
    retorno_total_acumulado: number;
    variacao_mercado_real_acumulada: number;
    retorno_total_real_acumulado: number;
    ipca_acumulado_pct: number;
  };
}

export default function PerformanceAttributionChart() {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'nominal' | 'real'>('nominal');

  useEffect(() => {
    let active = true;
    apiCall<AttributionResponse>('/api/performance/attribution')
      .then((res) => {
        if (!active) return;
        if (res.status === 'Sucesso') setData(res);
        else setErrorMsg('Não foi possível carregar a atribuição patrimonial.');
      })
      .catch((err) => {
        console.error(err);
        if (active) setErrorMsg('Erro de conexão ao carregar atribuição patrimonial.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    return data.series.map((row) => ({
      ...row,
      market_metric: mode === 'real' ? row.variacao_mercado_real : row.variacao_mercado,
    }));
  }, [data, mode]);

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  return (
    <Card className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-blue-400" />
            <h3 className="text-lg font-bold text-text-primary">Atribuição Patrimonial Mensal</h3>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Decomposição do crescimento entre Aportes Líquidos, Valorização de Mercado ({mode === 'real' ? 'descontando IPCA' : 'Nominal'}) e Dividendos.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-1 self-start">
          <button
            type="button"
            onClick={() => setMode('nominal')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === 'nominal'
                ? 'bg-blue-600 text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Nominal (BRL)
          </button>
          <button
            type="button"
            onClick={() => setMode('real')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === 'real'
                ? 'bg-emerald-600 text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Real (IPCA)
          </button>
        </div>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">Aportes Líquidos</span>
            <span className="text-sm font-bold text-blue-400">{maskMoney(data.summary.total_aportes_liquidos)}</span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">
              {mode === 'real' ? 'Ganho Real de Mercado' : 'Variação de Mercado'}
            </span>
            <span className="text-sm font-bold text-emerald-400">
              {maskMoney(mode === 'real' ? data.summary.variacao_mercado_real_acumulada : data.summary.total_variacao_mercado)}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">Dividendos</span>
            <span className="text-sm font-bold text-amber-400">{maskMoney(data.summary.total_dividendos)}</span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">IPCA Acumulado</span>
            <span className="text-sm font-bold text-text-primary">{data.summary.ipca_acumulado_pct.toFixed(2)}%</span>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-400">
          {errorMsg}
        </div>
      )}

      <div className="h-80 w-full">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-text-secondary">
            Sem histórico mensal suficiente para atribuição.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.25} />
              <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                width={80}
                tickFormatter={(v) => (isHidden ? '••••' : `R$ ${Math.round(v)}`)}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                formatter={(value, name) => [
                  isHidden ? 'R$ •••••' : formatMoney(Number(value) || 0),
                  String(name),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="aportes_liquidos" name="Aportes Líquidos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="market_metric"
                name={mode === 'real' ? 'Mercado Real (pós-IPCA)' : 'Variação Mercado'}
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="dividendos" name="Dividendos" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="patrimonio_fim"
                name="Patrimônio Fim"
                stroke="#a855f7"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="text-[11px] text-text-secondary mt-3">
        Identidade contábil mensal: Δ Custódia = Aportes Líquidos + Variação de Mercado · Fonte IPCA: BCB SGS 433.
      </p>
    </Card>
  );
}
