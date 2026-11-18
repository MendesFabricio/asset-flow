'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Layers, BarChart3, Loader2, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { HistoryDataPoint } from '@/types';

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
    total_aporte_do_bolso?: number;
    total_variacao_mercado: number;
    total_dividendos: number;
    retorno_total_acumulado: number;
    retorno_sobre_bolso_pct?: number;
    variacao_mercado_real_acumulada: number;
    retorno_total_real_acumulado: number;
    ipca_acumulado_pct: number;
    ipca_fallback_months?: number;
  };
}

type ViewTab = 'total' | 'classes' | 'attribution';
type TimeRange = '1y' | '2y' | 'all';

const CLASS_COLORS: Record<string, string> = {
  'Ação': '#3b82f6',
  'FII': '#8b5cf6',
  'Renda Fixa': '#10b981',
  'Cripto': '#f59e0b',
  'Internacional': '#ec4899',
  'Reserva': '#64748b',
  'Outros': '#94a3b8',
};

const getClassColor = (name: string, index: number) =>
  CLASS_COLORS[name] || `hsl(${index * 45}, 70%, 50%)`;

const parseHistoryDate = (raw: string): Date | null => {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!br) return null;
  const year = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
  return new Date(year, Number(br[2]) - 1, Number(br[1]));
};

const formatCompactAxis = (v: number, isHidden: boolean) => {
  if (isHidden) return '••••';
  const abs = Math.abs(v);
  if (abs >= 1000) return `R$${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `R$${Math.round(v)}`;
};

export default function PerformanceAttributionChart({
  history = [],
}: {
  history?: HistoryDataPoint[];
}) {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const palette = useChartPalette();

  const [view, setView] = useState<ViewTab>('total');
  const [mode, setMode] = useState<'nominal' | 'real'>('nominal');
  const [historyRange, setHistoryRange] = useState<TimeRange>('all');
  const [attrRange, setAttrRange] = useState<TimeRange>('1y');

  const { data: rawData, error, isLoading: loading } = useSWR<AttributionResponse>(
    '/api/performance/attribution',
    apiCall,
  );
  const data = rawData?.status === 'Sucesso' ? rawData : null;
  const errorMsg = error
    ? 'Erro de conexão ao carregar atribuição patrimonial.'
    : rawData && rawData.status !== 'Sucesso'
      ? 'Não foi possível carregar a atribuição patrimonial.'
      : null;

  const filteredHistory = useMemo(() => {
    if (history.length === 0) return history;
    let sliced = history;
    if (historyRange !== 'all') {
      const months = historyRange === '1y' ? 12 : 24;
      const lastDate = parseHistoryDate(history[history.length - 1]?.date);
      if (lastDate) {
        const cutoff = new Date(lastDate);
        cutoff.setMonth(cutoff.getMonth() - months);
        sliced = history.filter((item) => {
          const dt = parseHistoryDate(item.date);
          return dt ? dt >= cutoff : true;
        });
      }
    }
    const MAX_POINTS = 200;
    if (sliced.length <= MAX_POINTS) return sliced;
    const step = (sliced.length - 1) / (MAX_POINTS - 1);
    const sampled: HistoryDataPoint[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      sampled.push(sliced[Math.round(i * step)]);
    }
    sampled.push(sliced[sliced.length - 1]);
    return sampled;
  }, [history, historyRange]);

  const assetClasses = useMemo(() => {
    const keys = new Set<string>();
    filteredHistory.forEach((item) => {
      Object.entries(item).forEach(([key, val]) => {
        if (!['date', 'Patrimônio', 'Investido', 'Lucro', 'IPCA_6'].includes(key) && Number(val) > 0) {
          keys.add(key);
        }
      });
    });
    const last = filteredHistory[filteredHistory.length - 1] || {};
    return Array.from(keys).sort((a, b) => Number(last[b] || 0) - Number(last[a] || 0));
  }, [filteredHistory]);

  const chartData = useMemo(() => {
    if (!data?.series) return [];
    const mapped = data.series.map((row) => ({
      ...row,
      market_metric: mode === 'real' ? row.variacao_mercado_real : row.variacao_mercado,
    }));
    if (attrRange === 'all') return mapped;
    const sliceCount = attrRange === '1y' ? 12 : 24;
    return mapped.slice(-sliceCount);
  }, [data, mode, attrRange]);

  const lastItem = history[history.length - 1];
  const lastPatrimonio = lastItem?.Patrimônio || 0;
  const lastInvestido = lastItem?.Investido || 0;
  const fallbackGrowth = lastInvestido > 0 ? ((lastPatrimonio - lastInvestido) / lastInvestido) * 100 : 0;
  const totalReturnPct = data?.summary?.retorno_sobre_bolso_pct;
  const growth = totalReturnPct !== undefined ? totalReturnPct : fallbackGrowth;
  const growthLabel = totalReturnPct !== undefined ? 'Retorno Total s/ Bolso:' : 'Rentabilidade Histórica:';

  const aporteBolso = data?.summary
    ? (data.summary.total_aporte_do_bolso ?? data.summary.total_aportes_liquidos)
    : 0;
  const totalReturnVal = data?.summary
    ? mode === 'real'
      ? data.summary.retorno_total_real_acumulado
      : data.summary.retorno_total_acumulado
    : 0;
  const marketDeltaVal = data?.summary
    ? mode === 'real'
      ? data.summary.variacao_mercado_real_acumulada
      : data.summary.total_variacao_mercado
    : 0;

  const activeRange = view === 'attribution' ? attrRange : historyRange;
  const setActiveRange = (next: TimeRange) => {
    if (view === 'attribution') setAttrRange(next);
    else setHistoryRange(next);
  };

  const maskMoney = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  return (
    <Card className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <TrendingUp size={18} className="text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h3 className="text-base font-bold text-text-primary">
                Evolução &amp; Atribuição Patrimonial
              </h3>
              {(history.length > 0 || data?.summary) && (
                <span className="text-xs text-text-secondary">
                  {growthLabel}{' '}
                  <strong className={growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {growth > 0 ? '+' : ''}
                    {growth.toFixed(2)}%
                  </strong>
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {view === 'total' && 'Curva diária do patrimônio total comparado ao capital aportado.'}
              {view === 'classes' && 'Distribuição empilhada do patrimônio por classe de ativo.'}
              {view === 'attribution' &&
                `Decomposição mensal entre Aportes, Variação de Mercado (${mode === 'real' ? 'descontando IPCA' : 'Nominal'}) e Dividendos.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-1">
            <button
              type="button"
              onClick={() => setView('total')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === 'total'
                  ? 'bg-blue-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Activity size={13} /> Total
            </button>
            {assetClasses.length > 0 && (
              <button
                type="button"
                onClick={() => setView('classes')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  view === 'classes'
                    ? 'bg-purple-600 text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Layers size={13} /> Classes
              </button>
            )}
            <button
              type="button"
              onClick={() => setView('attribution')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === 'attribution'
                  ? 'bg-emerald-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <BarChart3 size={13} /> Atribuição
            </button>
          </div>

          {view === 'attribution' && (
            <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-1">
              <button
                type="button"
                onClick={() => setMode('nominal')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'nominal'
                    ? 'bg-blue-600 text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Nominal
              </button>
              <button
                type="button"
                onClick={() => setMode('real')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'real'
                    ? 'bg-emerald-600 text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Real (IPCA)
              </button>
            </div>
          )}

          <div className="inline-flex rounded-lg border border-border-subtle bg-surface p-1">
            {(['1y', '2y', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setActiveRange(r)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  activeRange === r
                    ? 'bg-surface-card text-text-primary border border-border-subtle'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {r === '1y' ? '1A' : r === '2y' ? '2A' : 'Tudo'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 text-xs">
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">
              Aporte do Bolso
            </span>
            <span className="text-sm font-bold text-blue-400">
              {maskMoney(aporteBolso)}
            </span>
            <span className="text-[10px] text-text-secondary block mt-0.5">
              Compras líq. (c/ reinvest.): {maskMoney(data.summary.total_aportes_liquidos)}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">
              {mode === 'real' ? 'Retorno Total Real' : 'Retorno Total'}
            </span>
            <span
              className={`text-sm font-bold ${
                totalReturnVal >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {maskMoney(totalReturnVal)}
            </span>
            <span className="text-[10px] text-text-secondary block mt-0.5">
              Mercado: {maskMoney(marketDeltaVal)}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">
              Dividendos
            </span>
            <span className="text-sm font-bold text-amber-400">
              {maskMoney(data.summary.total_dividendos)}
            </span>
            <span className="text-[10px] text-text-secondary block mt-0.5">
              Proventos pagos até hoje
            </span>
          </div>
          <div className="p-3 rounded-lg bg-surface border border-border-subtle">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary block">
              IPCA Acumulado
            </span>
            <span className="text-sm font-bold text-text-primary">
              {data.summary.ipca_acumulado_pct.toFixed(2)}%
            </span>
            <span className="text-[10px] text-text-secondary block mt-0.5">
              Patrimônio: {maskMoney(data.summary.patrimonio_atual)}
            </span>
          </div>
        </div>
      )}

      {errorMsg && view === 'attribution' && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-400">
          {errorMsg}
        </div>
      )}

      <div className="h-[340px] w-full">
        {view === 'attribution' ? (
          loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-text-secondary" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-text-secondary">
              Sem histórico mensal suficiente para atribuição.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  width={72}
                  tickFormatter={(v) => formatCompactAxis(Number(v), isHidden)}
                  tick={{ fill: palette.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={72}
                  tickFormatter={(v) => formatCompactAxis(Number(v), isHidden)}
                  tick={{ fill: '#a855f7', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine yAxisId="left" y={0} stroke={palette.axis} strokeOpacity={0.35} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: palette.tooltipBg,
                    borderColor: palette.tooltipBorder,
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(value, name) => [
                    isHidden ? 'R$ •••••' : formatMoney(Number(value) || 0),
                    String(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  yAxisId="left"
                  dataKey="aportes_liquidos"
                  name="Aportes Líquidos"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  animationDuration={280}
                />
                <Bar
                  yAxisId="left"
                  dataKey="market_metric"
                  name={mode === 'real' ? 'Mercado Real (pós-IPCA)' : 'Variação Mercado'}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  animationDuration={280}
                />
                <Bar
                  yAxisId="left"
                  dataKey="dividendos"
                  name="Dividendos"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  animationDuration={280}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="patrimonio_fim"
                  name="Patrimônio Fim (eixo dir.)"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  animationDuration={280}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )
        ) : filteredHistory.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-text-secondary">
            Aguardando dados históricos diários...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {view === 'total' && (
                <defs>
                  <linearGradient id="colorPatrimonioUnified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis
                dataKey="date"
                stroke={palette.axis}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                width={72}
                stroke={palette.axis}
                fontSize={11}
                tickFormatter={(v) => formatCompactAxis(Number(v), isHidden)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{
                  stroke: view === 'total' ? '#22d3ee' : '#a855f7',
                  strokeWidth: 1,
                  strokeDasharray: '4 4',
                }}
                contentStyle={{
                  backgroundColor: palette.tooltipBg,
                  borderColor: palette.tooltipBorder,
                  borderRadius: '0.75rem',
                  fontSize: '12px',
                }}
                formatter={(value, name) => {
                  const formatted = isHidden ? 'R$ •••••' : formatMoney(Number(value) || 0);
                  if (name === 'Patrimônio') return [formatted, 'TOTAL'];
                  if (name === 'Investido') return [formatted, 'APORTADO'];
                  return [formatted, String(name).toUpperCase()];
                }}
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              {view === 'total' ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="Investido"
                    name="Capital Investido (c/ Reinv.)"
                    stroke="#94a3b8"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    fill="transparent"
                    activeDot={false}
                    animationDuration={280}
                  />
                  <Area
                    type="monotone"
                    dataKey="Patrimônio"
                    name="Patrimônio Total"
                    stroke="#22d3ee"
                    strokeWidth={2.25}
                    fill="url(#colorPatrimonioUnified)"
                    activeDot={{ r: 5, strokeWidth: 0, fill: palette.activeDotFill }}
                    animationDuration={280}
                  />
                </>
              ) : (
                assetClasses.map((cls, idx) => (
                  <Area
                    key={cls}
                    type="monotone"
                    dataKey={cls}
                    stackId="1"
                    stroke={getClassColor(cls, idx)}
                    strokeWidth={1.25}
                    fill={getClassColor(cls, idx)}
                    fillOpacity={0.62}
                    activeDot={{ r: 4, strokeWidth: 0, fill: palette.activeDotFill }}
                    animationDuration={280}
                  />
                ))
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {view === 'attribution' && (
        <p className="text-[11px] text-text-secondary mt-3">
          Identidade contábil mensal: Δ Custódia = Aportes Líquidos + Variação de Mercado · Fonte IPCA:{' '}
          {data?.ipca_source === 'bcb_sgs_433' ? 'BCB SGS 433' : 'Estimado (Fallback)'}
          {(data?.summary?.ipca_fallback_months ?? 0) > 0
            ? ` (${data?.summary.ipca_fallback_months} mês(es) estimado(s))`
            : ''}
          .
        </p>
      )}
    </Card>
  );
}
