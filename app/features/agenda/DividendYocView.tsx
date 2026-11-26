'use client';

import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from 'recharts';
import { useChartPalette } from '@/lib/chartPalette';
import { getYocQuality, YocHistoryItem } from './types';

interface DividendYocViewProps {
  yocHistory: Record<string, YocHistoryItem[]>;
  selectedYocTicker: string;
  selectedYocYear: number | 'all';
  isHidden: boolean;
  money: (val: number) => string;
  onSelectTicker: (ticker: string) => void;
  onSelectYear: (year: number | 'all') => void;
}

export function DividendYocView({
  yocHistory,
  selectedYocTicker,
  selectedYocYear,
  isHidden,
  money,
  onSelectTicker,
  onSelectYear,
}: DividendYocViewProps) {
  const palette = useChartPalette();
  const isPortfolioYoc = selectedYocTicker === 'CARTEIRA';
  const yocTickersSorted = useMemo(
    () => [
      ...(yocHistory.CARTEIRA ? ['CARTEIRA'] : []),
      ...Object.keys(yocHistory).filter((tk) => tk !== 'CARTEIRA').sort(),
    ],
    [yocHistory]
  );

  const selectedYocData = useMemo(
    () => yocHistory[selectedYocTicker] || [],
    [yocHistory, selectedYocTicker]
  );

  const yocSummary = useMemo(() => {
    if (selectedYocData.length === 0) return null;
    const first = selectedYocData[0];
    const latest = selectedYocData[selectedYocData.length - 1];
    const totalReceived = selectedYocData.reduce((acc, row) => acc + (row.total_received ?? 0), 0);
    const totalPayments = selectedYocData.reduce((acc, row) => acc + (row.payments_count ?? (row.events?.length || 0)), 0);
    const allEvents = selectedYocData
      .filter((row) => selectedYocYear === 'all' || row.year === selectedYocYear)
      .flatMap((row) => (row.events || []).map((ev) => ({ ...ev, year: row.year })))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.date_com || '').localeCompare(a.date_com || ''));

    return { first, latest, totalReceived, totalPayments, allEvents };
  }, [selectedYocData, selectedYocYear]);

  const latestQual = yocSummary
    ? getYocQuality(yocSummary.latest.yoc, yocSummary.latest.dy_market ?? 0)
    : null;
  const displayedEvents = yocSummary ? yocSummary.allEvents.slice(0, 250) : [];

  return (
    <div className="space-y-6">
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="text-status-success" size={16} />
              <h2 className="text-base font-bold text-text-primary">
                {isPortfolioYoc
                  ? 'Evolução: YoC da Carteira Toda vs DY de Mercado'
                  : 'Evolução: YoC (PM do Momento) vs DY do Ativo'}
              </h2>
            </div>
            <p className="text-xs text-text-muted mt-1">
              {isPortfolioYoc
                ? 'Retorno em proventos sobre o custo investido na época vs valor de mercado da carteira (ex-Reserva)'
                : 'Compara seu Yield on Cost com o PM da época contra o DY de mercado do ativo na data de cada provento'}
            </p>
          </div>

          <select
            aria-label="Selecionar ativo ou carteira para análise de YoC e DY"
            value={selectedYocTicker}
            onChange={(e) => {
              onSelectTicker(e.target.value);
              onSelectYear('all');
            }}
            className="bg-surface-input border border-border-subtle rounded-xl text-xs font-semibold text-text-primary px-3 py-2 focus:outline-none focus:border-status-success"
          >
            {yocTickersSorted.map((tk) => (
              <option key={tk} value={tk}>
                {tk === 'CARTEIRA' ? '📊 Carteira Toda (Consolidado)' : tk}
              </option>
            ))}
          </select>
        </div>

        {selectedYocData.length === 0 || !yocSummary || !latestQual ? (
          <div className="h-64 flex items-center justify-center text-text-muted">
            Nenhum histórico disponível para esta seleção.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="p-3.5 rounded-xl bg-surface border border-border-subtle">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    YoC ({yocSummary.latest.year} · PM Momento)
                  </span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${latestQual.badgeClass}`}>
                    {latestQual.label}
                  </span>
                </div>
                <span className="text-lg font-mono font-bold mt-1 block" style={{ color: latestQual.barColor }}>
                  {yocSummary.latest.yoc.toFixed(2)}%
                </span>
                <span className={`text-[10px] font-mono block ${latestQual.spreadClass}`}>
                  {latestQual.spreadLabel}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  {isPortfolioYoc ? `DY de Mercado (${yocSummary.latest.year})` : `DY do Ativo (${yocSummary.latest.year})`}
                </span>
                <span className="text-lg font-mono font-bold text-accent mt-1 block">
                  {(yocSummary.latest.dy_market ?? 0).toFixed(2)}%
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  {isPortfolioYoc ? 'Patrimônio médio: ' : 'Cotação média: '}
                  {money(yocSummary.latest.market_price ?? 0)}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  {isPortfolioYoc ? `Custo Investido (${yocSummary.latest.year})` : `Meu PM no Momento (${yocSummary.latest.year})`}
                </span>
                <span className="text-lg font-mono font-bold text-status-warning mt-1 block">
                  {money(yocSummary.latest.pm_at_moment ?? 0)}
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  Inicial ({yocSummary.first.year}): {money(yocSummary.first.pm_at_moment ?? 0)}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border-subtle">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  {isPortfolioYoc ? 'Total Recebido (Carteira)' : `Recebido Histórico (${selectedYocTicker})`}
                </span>
                <span className="text-lg font-mono font-bold text-text-primary mt-1 block">
                  {money(yocSummary.totalReceived)}
                </span>
                <span className="text-[10px] font-mono text-text-muted">
                  {yocSummary.totalPayments} pagamento(s) liquidado(s)
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted mb-3 px-3 py-2 rounded-xl bg-surface border border-border-subtle">
              <span className="font-bold text-text-primary uppercase text-[10px] tracking-wider">Avaliação YoC:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" /> Ótimo (≥ 6% e ≥ DY)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#14b8a6]" /> Bom (≥ 6%, PM &gt; Cot.)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> Moderado (4%–6%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" /> Fraco (&lt; 4%)
              </span>
              <span className="inline-flex items-center gap-1.5 ml-auto font-mono text-[10px] text-status-success">
                --- Meta Bazin 6%
              </span>
            </div>

            <div className="h-80 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={selectedYocData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                  <XAxis dataKey="year" stroke={palette.axis} fontSize={11} />
                  <YAxis yAxisId="yield" orientation="left" stroke={palette.axis} fontSize={11} unit="%" />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    stroke={palette.axis}
                    fontSize={11}
                    tickFormatter={(val: number) => {
                      if (isHidden) return '•••';
                      return Math.abs(val) >= 1000
                        ? `R$ ${(Number(val) / 1000).toFixed(0)}k`
                        : `R$ ${Number(val).toFixed(0)}`;
                    }}
                  />
                  <ReferenceLine yAxisId="yield" y={6} stroke="#10b981" strokeDasharray="3 3" />
                  <ChartTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0]?.payload as YocHistoryItem | undefined;
                      if (!row) return null;
                      const q = getYocQuality(row.yoc, row.dy_market ?? 0);
                      const pmChangedInYear =
                        row.pm_avg_year !== undefined &&
                        row.pm_at_moment !== undefined &&
                        Math.abs(row.pm_avg_year - row.pm_at_moment) >= 0.02;
                      return (
                        <div
                          className="rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[240px]"
                          style={{ backgroundColor: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}` }}
                        >
                          <div className="flex items-center justify-between gap-2 font-bold text-text-primary border-b border-border-subtle pb-1">
                            <span>{isPortfolioYoc ? 'Carteira Toda' : selectedYocTicker} · {label}</span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${q.badgeClass}`}>
                              {q.label}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="font-medium" style={{ color: q.barColor }}>YoC (PM do Momento):</span>
                            <span className="font-mono font-bold" style={{ color: q.barColor }}>{row.yoc.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-accent font-medium">{isPortfolioYoc ? 'DY de Mercado:' : 'DY do Ativo (Mercado):'}</span>
                            <span className="font-mono font-bold text-accent">{(row.dy_market ?? 0).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-text-muted">Diferença (YoC - DY):</span>
                            <span className={`font-mono font-bold ${q.spreadClass}`}>{q.spreadLabel}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-status-warning font-medium">{isPortfolioYoc ? 'Custo Investido (Momento):' : 'Meu PM no Momento:'}</span>
                            <span className="font-mono font-bold text-status-warning">{money(row.pm_at_moment ?? 0)}</span>
                          </div>
                          {pmChangedInYear && (
                            <div className="flex justify-between gap-4 text-[11px] text-text-muted">
                              <span>{isPortfolioYoc ? 'Custo médio no ano:' : 'PM médio no ano:'}</span>
                              <span className="font-mono">{money(row.pm_avg_year ?? 0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-4 text-text-muted">
                            <span>{isPortfolioYoc ? 'Patrimônio médio:' : 'Cotação média no ano:'}</span>
                            <span className="font-mono text-text-primary">{money(row.market_price ?? 0)}</span>
                          </div>
                          <div className="flex justify-between gap-4 pt-1 border-t border-border-subtle text-[11px] text-text-muted">
                            <span>{isPortfolioYoc ? `Recebido (${row.payments_count ?? 0}x):` : `DPA (${row.payments_count ?? 0}x):`}</span>
                            <span className="font-mono text-text-primary">
                              {isPortfolioYoc ? money(row.total_received ?? 0) : `${money(row.dpa)} · Tot: ${money(row.total_received ?? 0)}`}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar yAxisId="yield" dataKey="yoc" name="YoC (PM do Momento)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={26}>
                    {selectedYocData.map((entry, idx) => (
                      <Cell key={`yoc-cell-${entry.year}-${idx}`} fill={getYocQuality(entry.yoc, entry.dy_market ?? 0).barColor} />
                    ))}
                  </Bar>
                  <Bar yAxisId="yield" dataKey="dy_market" name={isPortfolioYoc ? 'DY de Mercado (%)' : 'DY do Ativo (Mercado)'} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={26} />
                  <Line yAxisId="price" type="monotone" dataKey="pm_at_moment" name={isPortfolioYoc ? 'Custo Investido (R$)' : 'Meu PM no Momento (R$)'} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 6 }} />
                  <Line yAxisId="price" type="monotone" dataKey="market_price" name={isPortfolioYoc ? 'Patrimônio Médio (R$)' : 'Cotação Média do Ativo (R$)'} stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#94a3b8' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 overflow-x-auto border border-border-subtle rounded-xl">
              <table className="w-full text-xs text-left border-collapse bg-surface">
                <thead className="bg-surface-elevated text-text-muted font-bold border-b border-border-subtle">
                  <tr>
                    <th className="p-3">Ano</th>
                    <th className="p-3 text-right">Pgtos</th>
                    {!isPortfolioYoc && <th className="p-3 text-right">DPA</th>}
                    <th className="p-3 text-right">{isPortfolioYoc ? 'Custo no Momento' : 'Meu PM do Momento'}</th>
                    <th className="p-3 text-right">{isPortfolioYoc ? 'Patrimônio Médio' : 'Cotação Média'}</th>
                    <th className="p-3 text-right">YoC (PM Momento)</th>
                    <th className="p-3 text-right">{isPortfolioYoc ? 'DY Carteira' : 'DY do Ativo'}</th>
                    <th className="p-3 text-center">Avaliação</th>
                    <th className="p-3 text-right">Total Recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-text-primary">
                  {selectedYocData.map((row) => {
                    const isSelectedYr = selectedYocYear === row.year;
                    const q = getYocQuality(row.yoc, row.dy_market ?? 0);
                    return (
                      <tr
                        key={row.year}
                        onClick={() => onSelectYear(isSelectedYr ? 'all' : row.year)}
                        className={`cursor-pointer transition-colors ${isSelectedYr ? 'bg-accent-soft' : 'hover:bg-surface-elevated/60'}`}
                      >
                        <td className="p-3 font-bold font-mono">{row.year}</td>
                        <td className="p-3 text-right font-mono text-text-muted">{row.payments_count ?? 0}</td>
                        {!isPortfolioYoc && <td className="p-3 text-right font-mono">{money(row.dpa)}</td>}
                        <td className="p-3 text-right font-mono font-bold text-status-warning">{money(row.pm_at_moment ?? 0)}</td>
                        <td className="p-3 text-right font-mono text-text-muted">{money(row.market_price ?? 0)}</td>
                        <td className="p-3 text-right font-mono font-bold" style={{ color: q.barColor }}>{row.yoc.toFixed(2)}%</td>
                        <td className="p-3 text-right font-mono font-bold text-accent">{(row.dy_market ?? 0).toFixed(2)}%</td>
                        <td className="p-3 text-center">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${q.badgeClass}`}>{q.label}</span>
                            <span className={`text-[9px] font-mono ${q.spreadClass}`}>{q.spreadLabel}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono font-bold">{money(row.total_received ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {yocSummary.allEvents.length > 0 && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    Por Recebimento ({yocSummary.allEvents.length}) — YoC vs DY &amp; PM da Data
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectYear('all')}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        selectedYocYear === 'all'
                          ? 'bg-status-success text-white border-status-success'
                          : 'bg-surface border-border-subtle text-text-muted hover:text-text-primary'
                      }`}
                    >
                      Todos
                    </button>
                    {selectedYocData.map((row) => (
                      <button
                        key={row.year}
                        type="button"
                        onClick={() => onSelectYear(row.year)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border transition-colors ${
                          selectedYocYear === row.year
                            ? 'bg-status-success text-white border-status-success'
                            : 'bg-surface border-border-subtle text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {row.year}
                      </button>
                    ))}
                  </div>
                </div>

                {yocSummary.allEvents.length > 250 && (
                  <p className="text-[11px] text-text-muted mb-2">
                    Exibindo os 250 recebimentos mais recentes; selecione um ano acima para visualizar o ano completo.
                  </p>
                )}

                <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-border-subtle rounded-xl">
                  <table className="w-full text-xs text-left border-collapse bg-surface">
                    <thead className="sticky top-0 bg-surface-elevated text-text-muted font-bold border-b border-border-subtle">
                      <tr>
                        <th className="p-2.5">Pgto (Data-Com)</th>
                        {isPortfolioYoc && <th className="p-2.5">Ativo</th>}
                        <th className="p-2.5">Tipo</th>
                        <th className="p-2.5 text-right">Por Cota</th>
                        <th className="p-2.5 text-right">Meu PM Momento</th>
                        <th className="p-2.5 text-right">Cotação Momento</th>
                        <th className="p-2.5 text-right">YoC Momento</th>
                        <th className="p-2.5 text-right">DY Ativo</th>
                        <th className="p-2.5 text-center">PM vs Mercado</th>
                        <th className="p-2.5 text-right">Total Recebido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-text-primary">
                      {displayedEvents.map((ev, idx) => {
                        const payBr = (ev.date || '').split('-').reverse().join('/');
                        const comBr = (ev.date_com || ev.date || '').split('-').reverse().join('/');
                        const beatQuote = ev.yoc_at_moment >= ev.dy_at_moment - 0.01;
                        const pmMuchHigher = ev.market_price > 0 && ev.pm_at_moment > ev.market_price * 1.15;
                        const pmStatusClass = beatQuote
                          ? 'bg-emerald-500/15 text-status-success border-emerald-500/30'
                          : pmMuchHigher
                            ? 'bg-red-500/15 text-status-error border-red-500/30'
                            : 'bg-amber-500/15 text-status-warning border-amber-500/30';
                        const pmStatusLabel = beatQuote
                          ? '▲ PM ≤ Cotação'
                          : pmMuchHigher
                            ? '▼ PM caro (+15%)'
                            : '▼ PM > Cotação';
                        return (
                          <tr key={`${ev.ticker || ''}-${ev.date}-${ev.date_com}-${idx}`} className="hover:bg-surface-elevated/60">
                            <td className="p-2.5 font-mono">
                              <span className="font-semibold block">{payBr}</span>
                              <span className="text-[10px] text-text-muted">Com: {comBr} · {ev.quantity} un.</span>
                            </td>
                            {isPortfolioYoc && <td className="p-2.5 font-bold font-mono text-text-primary">{ev.ticker || '--'}</td>}
                            <td className="p-2.5 text-text-muted">{ev.type || 'Dividendo'}</td>
                            <td className="p-2.5 text-right font-mono">{isHidden ? 'R$ •••' : `R$ ${ev.dpa.toFixed(4)}`}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-status-warning">{money(ev.pm_at_moment)}</td>
                            <td className="p-2.5 text-right font-mono text-text-muted">{money(ev.market_price)}</td>
                            <td className={`p-2.5 text-right font-mono font-bold ${beatQuote ? 'text-status-success' : 'text-status-warning'}`}>{ev.yoc_at_moment.toFixed(2)}%</td>
                            <td className="p-2.5 text-right font-mono font-bold text-accent">{ev.dy_at_moment.toFixed(2)}%</td>
                            <td className="p-2.5 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${pmStatusClass}`}>{pmStatusLabel}</span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold">{money(ev.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
