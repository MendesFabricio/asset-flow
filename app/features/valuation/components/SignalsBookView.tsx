'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { BellRing, History, Loader2, RefreshCw, ShieldCheck, Activity } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { useChartPalette } from '@/lib/chartPalette';
import { PrivateValue } from '@/components/ui/PrivateValue';
import { SignalExplainabilityCard, SignalOpportunityV2 } from './SignalExplainabilityCard';

interface SignalHistoryItem {
  ticker: string;
  date: string | null;
  score: number;
  status: string;
  recomendacao: string;
  preco: number;
  mg_graham: number;
  mg_bazin: number;
  p_vp: number;
  quality_score: number | null;
  forward_return_30d: number | null;
  forward_return_90d: number | null;
  forward_return_180d: number | null;
}

interface BacktestBucket {
  count: number;
  avg_score: number;
  avg_return_30d: number | null;
  avg_return_90d: number | null;
  avg_return_180d: number | null;
}

interface SignalChangeItem {
  ticker: string;
  date: string | null;
  from_status: string;
  to_status: string;
  recomendacao: string;
  score: number;
}

interface SignalHistoryResponse {
  status: string;
  items: SignalHistoryItem[];
  summary: {
    total: number;
    by_status: Record<string, number>;
    backtest: Record<string, BacktestBucket>;
    recent_changes: SignalChangeItem[];
  };
}

const STATUS_BADGE: Record<string, string> = {
  COMPRA_FORTE: 'text-status-success bg-status-success/10 border-status-success/30',
  COMPRAR: 'text-status-success bg-status-success/10 border-status-success/30',
  NEUTRO: 'text-status-warning bg-status-warning/10 border-status-warning/30',
  INCONCLUSIVO: 'text-text-muted bg-surface-input border-border-subtle',
  REDUZIR: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  EVITAR: 'text-status-error bg-status-error/10 border-status-error/30',
};

function fmtRet(v: number | null) {
  if (v === null || v === undefined) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

interface SignalV2OpportunitiesResponse {
  status: string;
  regime?: {
    composite_regime?: string;
    label?: string;
    selic_annual?: number;
  };
  calibration_summary?: {
    total_audited?: number;
    brier_score?: number | null;
    observed_hit_rate?: number | null;
  };
  opportunities?: SignalOpportunityV2[];
}

export function SignalsBookView({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const palette = useChartPalette();
  const [tickerFilter, setTickerFilter] = useState('');
  const [debouncedTicker, setDebouncedTicker] = useState('');
  const [universeFilter, setUniverseFilter] = useState<'all' | 'portfolio' | 'market'>('all');
  const [horizonDays, setHorizonDays] = useState<30 | 90 | 180>(90);
  const [latestOnly, setLatestOnly] = useState(true);
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recalibrating, setRecalibrating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<SignalHistoryResponse | null>(null);
  const [v2Data, setV2Data] = useState<SignalV2OpportunitiesResponse | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTicker(tickerFilter.trim().toUpperCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [tickerFilter]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = debouncedTicker
        ? `?ticker=${encodeURIComponent(debouncedTicker)}&limit=300`
        : '?limit=300';
      const v2Params = new URLSearchParams({ horizon: String(horizonDays) });
      if (debouncedTicker) v2Params.set('ticker', debouncedTicker);
      if (universeFilter !== 'all') v2Params.set('universe', universeFilter);
      const [res, resV2] = await Promise.all([
        apiCall<SignalHistoryResponse>(`/api/valuation/signals/history${qs}`),
        apiCall<SignalV2OpportunitiesResponse>(`/api/signals/v2/opportunities?${v2Params.toString()}`).catch(() => null),
      ]);
      if (res.status === 'Sucesso') {
        setData(res);
      } else {
        setErrorMsg('Não foi possível carregar o Livro de Sinais.');
      }
      if (resV2 && resV2.status === 'Sucesso') {
        setV2Data(resV2);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao carregar Livro de Sinais.');
    } finally {
      setLoading(false);
    }
  }, [debouncedTicker, horizonDays, universeFilter]);

  const handleRecalibrate = useCallback(async () => {
    setRecalibrating(true);
    try {
      await apiCall('/api/signals/v2/recalibrate', {
        method: 'POST',
        body: JSON.stringify({ sync_prices: true }),
      });
      await loadHistory();
    } catch {
      setErrorMsg('Falha ao recalibrar o motor estatístico.');
    } finally {
      setRecalibrating(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const visibleItems = useMemo(() => {
    const raw = data?.items || [];
    const term = tickerFilter.trim().toUpperCase();
    const filtered = term ? raw.filter((item) => item.ticker.toUpperCase().includes(term)) : raw;
    if (!latestOnly) return filtered;

    const seen = new Set<string>();
    return filtered.filter((item) => {
      if (seen.has(item.ticker)) return false;
      seen.add(item.ticker);
      return true;
    });
  }, [data, tickerFilter, latestOnly]);

  const chartRows = useMemo(() => {
    const bt = data?.summary?.backtest || {};
    const order = ['COMPRA_FORTE', 'COMPRAR', 'NEUTRO', 'INCONCLUSIVO', 'REDUZIR', 'EVITAR'];
    const keys = [...order.filter((k) => bt[k]), ...Object.keys(bt).filter((k) => !order.includes(k))];
    return keys.map((st) => ({
      status: st,
      count: bt[st].count,
      avg_score: bt[st].avg_score,
      ret_30d: bt[st].avg_return_30d ?? 0,
      ret_90d: bt[st].avg_return_90d ?? 0,
      ret_180d: bt[st].avg_return_180d ?? 0,
      hasReturns:
        bt[st].avg_return_30d !== null ||
        bt[st].avg_return_90d !== null ||
        bt[st].avg_return_180d !== null,
    }));
  }, [data]);

  const hasAnyForwardReturns = chartRows.some((r) => r.hasReturns);

  return (
    <div className="space-y-4">
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-accent" />
          <div>
            <h3 className="text-sm font-bold text-text-primary">Livro de Sinais &amp; Backtest (30 / 90 / 180d)</h3>
            <p className="text-[11px] text-text-muted">
              Histórico diário dos sinais emitidos, alertas de mudança de recomendação e retorno posterior por faixa de sinal.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLatestOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${latestOnly
                ? 'bg-accent-soft border-accent/40 text-accent'
                : 'bg-surface-elevated border-border-subtle text-text-muted hover:text-text-primary'
              }`}
            title="Alternar entre apenas o último sinal de cada ativo ou todo o histórico diário"
          >
            {latestOnly ? 'Último por ativo' : 'Histórico diário'}
          </button>
          <input
            type="text"
            aria-label="Filtrar ticker no Livro de Sinais"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            placeholder="Filtrar ticker (ex: PETR4)"
            className="px-3 py-1.5 rounded-lg bg-surface-input border border-border-subtle text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent w-44"
          />
          <button
            type="button"
            onClick={loadHistory}
            aria-label="Recarregar Livro de Sinais"
            className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-subtle text-xs font-bold text-text-primary hover:border-accent flex items-center gap-1"
          >
            {loading ? <Loader2 size={12} className="animate-spin text-accent" /> : <RefreshCw size={12} />} Atualizar
          </button>
          <button
            type="button"
            disabled={recalibrating}
            onClick={handleRecalibrate}
            className="px-3 py-1.5 rounded-lg bg-accent-soft border border-accent/40 text-xs font-bold text-accent hover:bg-accent/20 flex items-center gap-1 disabled:opacity-50"
          >
            {recalibrating ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
            Recalibrar Walk-Forward
          </button>
        </div>
      </div>

      {/* Painel v2: Regime Macro, Brier Score & Cards de Explicabilidade */}
      {v2Data && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-3.5 md:col-span-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                  <Activity size={12} className="text-accent" /> Regime de Mercado Vigente
                </div>
                <div className="text-sm font-bold text-text-primary mt-0.5">
                  {v2Data.regime?.label || v2Data.regime?.composite_regime || 'Calculando regime...'}
                </div>
              </div>
              {v2Data.regime?.selic_annual != null && (
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-subtle text-accent">
                  Selic {(v2Data.regime.selic_annual * 100).toFixed(2)}%
                </span>
              )}
            </div>
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Brier Score (90d)</div>
                <div className="text-sm font-mono font-bold text-text-primary mt-0.5">
                  {v2Data.calibration_summary?.brier_score != null
                    ? v2Data.calibration_summary.brier_score.toFixed(3)
                    : 'Aguardando M ≥ 1'}
                </div>
              </div>
              <div className="text-right text-[10px] text-text-muted">
                <div>{v2Data.calibration_summary?.total_audited ?? 0} auditoria(s)</div>
                {v2Data.calibration_summary?.observed_hit_rate != null && (
                  <div>Acerto real: {(v2Data.calibration_summary.observed_hit_rate * 100).toFixed(1)}%</div>
                )}
              </div>
            </div>
          </div>

          {v2Data.opportunities && v2Data.opportunities.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {([
                    { id: 'all', label: 'Todos (Carteira + Líquidas)' },
                    { id: 'portfolio', label: 'Minha Carteira' },
                    { id: 'market', label: 'Mercado (Alta Liquidez)' },
                  ] as const).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUniverseFilter(u.id)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                        universeFilter === u.id
                          ? 'bg-accent-soft border-accent/40 text-accent'
                          : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {([30, 90, 180] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setHorizonDays(h)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-bold transition-colors ${
                        horizonDays === h
                          ? 'bg-accent-soft border-accent/40 text-accent'
                          : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {h}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {v2Data.opportunities.slice(0, 10).map((opp) => (
                  <SignalExplainabilityCard
                    key={`${opp.ticker}-${opp.setup_code}`}
                    opportunity={opp}
                    onSelectTicker={onSelectTicker}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && !data && (
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-10 flex items-center justify-center gap-2 text-xs text-text-muted">
          <Loader2 size={16} className="animate-spin text-accent" />
          Carregando Livro de Sinais &amp; Backtest...
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <span className="text-xs text-text-muted">
          Auditoria histórica de snapshots ({data?.summary?.total || 0} registros)
        </span>
        <button
          type="button"
          onClick={() => setShowAuditHistory((prev) => !prev)}
          aria-expanded={showAuditHistory}
          className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle text-xs font-bold text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
        >
          {showAuditHistory ? 'Ocultar Auditoria & Histórico' : 'Ver Auditoria & Histórico Completo'}
        </button>
      </div>

      {showAuditHistory && (
        <>
          {/* Gráfico de Backtest / Distribuição por Status */}
          {chartRows.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-surface-card border border-border-subtle rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-text-primary">
                {hasAnyForwardReturns
                  ? 'Retorno Médio Posterior por Sinal (%)'
                  : 'Distribuição & Score Médio por Sinal'}
              </span>
              <span className="text-[10px] text-text-muted">
                {data?.summary?.total || 0} registro(s) no livro
              </span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis dataKey="status" stroke={palette.axis} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => String(v).replaceAll('_', ' ')} />
                  <YAxis yAxisId="left" stroke={palette.axis} fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => hasAnyForwardReturns ? `${v}%` : `${v}`} />
                  {!hasAnyForwardReturns && (
                    <YAxis yAxisId="right" orientation="right" stroke={palette.axis} fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                  )}
                  <Tooltip
                    contentStyle={{
                      backgroundColor: palette.tooltipBg,
                      borderColor: palette.tooltipBorder,
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  {hasAnyForwardReturns ? (
                    <>
                      <ReferenceLine yAxisId="left" y={0} stroke={palette.axis} strokeOpacity={0.5} />
                      <Bar yAxisId="left" dataKey="ret_30d" name="Retorno 30d (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={250} />
                      <Bar yAxisId="left" dataKey="ret_90d" name="Retorno 90d (%)" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={250} />
                      <Bar yAxisId="left" dataKey="ret_180d" name="Retorno 180d (%)" fill="#8b5cf6" radius={[4, 4, 0, 0]} animationDuration={250} />
                    </>
                  ) : (
                    <>
                      <Bar yAxisId="left" dataKey="count" name="Qtd. Ativos" fill="#3b82f6" radius={[4, 4, 0, 0]} animationDuration={250} />
                      <Bar yAxisId="right" dataKey="avg_score" name="Score Médio" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={250} />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
              <BellRing size={14} className="text-accent" />
              Mudanças Recentes de Sinal
            </div>
            {(data?.summary?.recent_changes || []).length === 0 ? (
              <p className="text-[11px] text-text-muted pt-2">
                Nenhuma transição registrada ainda. A cada snapshot diário, mudanças de status geram alertas automáticos aqui.
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {data!.summary.recent_changes.map((chg, idx) => (
                  <div
                    key={`${chg.ticker}-${chg.date}-${idx}`}
                    className="p-2.5 rounded-lg bg-surface-elevated border border-border-subtle text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-text-primary">{chg.ticker}</span>
                      <span className="text-text-muted ml-1.5 text-[10px]">{chg.date}</span>
                      <div className="text-[10px] text-text-muted">
                        {chg.from_status.replaceAll('_', ' ')} → <strong className="text-text-primary">{chg.to_status.replaceAll('_', ' ')}</strong>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-accent">{chg.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela completa do Livro de Sinais */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider border-b border-border-subtle sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-4 py-3">Ativo</th>
                <th scope="col" className="px-4 py-3">Data</th>
                <th scope="col" className="px-4 py-3">Sinal</th>
                <th scope="col" className="px-4 py-3 text-right">Score</th>
                <th scope="col" className="px-4 py-3 text-right">Preço Ref.</th>
                <th scope="col" className="px-4 py-3 text-right">Graham</th>
                <th scope="col" className="px-4 py-3 text-right">Bazin</th>
                <th scope="col" className="px-4 py-3 text-right">30d / 90d / 180d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {visibleItems.map((row, idx) => (
                <tr
                  key={`${row.ticker}-${row.date}-${idx}`}
                  onClick={() => onSelectTicker(row.ticker)}
                  className="hover:bg-surface-elevated cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-bold text-text-primary">{row.ticker}</td>
                  <td className="px-4 py-2.5 font-mono text-text-muted">{row.date}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE[row.status] || STATUS_BADGE.INCONCLUSIVO}`}>
                      {row.status.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-text-primary">{row.score}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-primary">
                    <PrivateValue value={formatMoney(row.preco)} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-muted">
                    {row.mg_graham ? `${row.mg_graham > 0 ? '+' : ''}${row.mg_graham.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-text-muted">
                    {row.mg_bazin ? `${row.mg_bazin > 0 ? '+' : ''}${row.mg_bazin.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11px] text-text-muted whitespace-nowrap">
                    {fmtRet(row.forward_return_30d)} / {fmtRet(row.forward_return_90d)} / {fmtRet(row.forward_return_180d)}
                  </td>
                </tr>
              ))}
              {visibleItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-text-muted text-xs">
                    Nenhum snapshot de sinal encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
