'use client';

import { useEffect, useState, useMemo } from 'react';
import { formatMoney } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';
import { SubPageHeader } from '../components/ui/SubPageHeader';
import { apiCall } from '../lib/api';
import { usePrivacy } from '../context/PrivacyContext';
import { Calendar, Percent, TrendingUp, Table, History, ChevronLeft, ChevronRight, Clock, Award, CalendarCheck } from 'lucide-react';
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
  Legend
} from 'recharts';
import { useChartPalette } from '../lib/chartPalette';

interface Evento {
  ticker: string;
  date: string;
  date_com?: string;
  date_payment?: string;
  type?: string;
  quantity?: number;
  total: number;
  status: string;
  value_per_share: number;
  is_estimate: boolean;
}

interface AnalyticsItem {
  ticker: string;
  dy_forward: number;
  payout_historico: number | null;
  regularidade_score: number;
  num_quarters: number;
}

interface YocDividendEvent {
  ticker?: string;
  date: string;
  date_com?: string;
  type?: string;
  dpa: number;
  total: number;
  quantity: number;
  pm_at_moment: number;
  market_price: number;
  yoc_at_moment: number;
  dy_at_moment: number;
}

interface YocQuality {
  barColor: string;
  label: 'Ótimo' | 'Bom' | 'Moderado' | 'Fraco';
  badgeClass: string;
  spread: number;
  spreadClass: string;
  spreadLabel: string;
}

function getYocQuality(yoc: number, dy: number): YocQuality {
  const spread = yoc - dy;
  const beatMarket = spread >= -0.05;
  const sign = spread >= 0 ? '+' : '';
  const spreadLabel = beatMarket
    ? `▲ ${sign}${spread.toFixed(2)} p.p. vs DY`
    : `▼ ${spread.toFixed(2)} p.p. vs DY`;
  const spreadClass = beatMarket ? 'text-status-success' : 'text-status-warning';

  if (yoc >= 6 && beatMarket) {
    return {
      barColor: '#10b981',
      label: 'Ótimo',
      badgeClass: 'bg-emerald-500/15 text-status-success border-emerald-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  if (yoc >= 6) {
    return {
      barColor: '#14b8a6',
      label: 'Bom',
      badgeClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  if (yoc >= 4) {
    return {
      barColor: '#f59e0b',
      label: 'Moderado',
      badgeClass: 'bg-amber-500/15 text-status-warning border-amber-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  return {
    barColor: '#ef4444',
    label: 'Fraco',
    badgeClass: 'bg-red-500/15 text-status-error border-red-500/30',
    spread,
    spreadClass,
    spreadLabel,
  };
}

interface YocHistoryItem {
  year: number;
  dpa: number;
  total_received?: number;
  yoc: number;
  dy_market?: number;
  pm_at_moment?: number;
  pm_avg_year?: number;
  market_price?: number;
  payments_count?: number;
  events?: YocDividendEvent[];
}

interface SeasonalityRow {
  year: number;
  [key: string]: number; // m1 to m12
}

export default function ProventosPage() {
  const palette = useChartPalette();
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));
  const [activeTab, setActiveTab] = useState<'calendar' | 'analytics' | 'yoc' | 'seasonality' | 'extrato'>('calendar');
  const [events, setEvents] = useState<Evento[]>([]);
  const [history, setHistory] = useState<Evento[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsItem[]>([]);
  const [yocHistory, setYocHistory] = useState<Record<string, YocHistoryItem[]>>({});
  const [seasonality, setSeasonality] = useState<SeasonalityRow[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedYocTicker, setSelectedYocTicker] = useState('');
  const [selectedYocYear, setSelectedYocYear] = useState<number | 'all'>('all');
  
  // States for Calendar Grid
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-indexed

  // Fetch all data
  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiCall<Evento[]>('/api/calendar'),
      apiCall<Evento[]>('/api/dividends/history'),
      apiCall<AnalyticsItem[]>('/api/dividends/analytics'),
      apiCall<Record<string, YocHistoryItem[]>>('/api/dividends/yoc-history'),
      apiCall<SeasonalityRow[]>('/api/dividends/seasonality')
    ])
      .then(([calendarRes, historyRes, analyticsRes, yocRes, seasonalityRes]) => {
        if (calendarRes.status === 'fulfilled') setEvents(calendarRes.value || []);
        else console.error('Erro ao carregar /api/calendar:', calendarRes.reason);

        if (historyRes.status === 'fulfilled') setHistory(historyRes.value || []);
        else console.error('Erro ao carregar /api/dividends/history:', historyRes.reason);

        if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value || []);
        else console.error('Erro ao carregar /api/dividends/analytics:', analyticsRes.reason);

        if (yocRes.status === 'fulfilled') {
          const yocData = yocRes.value || {};
          setYocHistory(yocData);
          const tickers = Object.keys(yocData).sort();
          if (tickers.includes('CARTEIRA')) {
            setSelectedYocTicker('CARTEIRA');
          } else if (tickers.length > 0) {
            setSelectedYocTicker(tickers[0]);
          }
        } else {
          console.error('Erro ao carregar /api/dividends/yoc-history:', yocRes.reason);
        }

        if (seasonalityRes.status === 'fulfilled') setSeasonality(seasonalityRes.value || []);
        else console.error('Erro ao carregar /api/dividends/seasonality:', seasonalityRes.reason);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Calendar Grid Calculations
  const daysInMonth = useMemo(() => new Date(currentYear, currentMonth + 1, 0).getDate(), [currentYear, currentMonth]);
  const firstDayIndex = useMemo(() => new Date(currentYear, currentMonth, 1).getDay(), [currentYear, currentMonth]);

  const monthName = useMemo(() => {
    return new Date(currentYear, currentMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [currentYear, currentMonth]);

  const calendarCells = useMemo(() => {
    const cells = [];
    
    // Add empty slots for the offset
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    
    // Add day numbers
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(day);
    }
    
    return cells;
  }, [daysInMonth, firstDayIndex]);

  const getEventsForDay = (day: number) => {
    const paddedMonth = String(currentMonth + 1).padStart(2, '0');
    const paddedDay = String(day).padStart(2, '0');
    const dateKey = `${currentYear}-${paddedMonth}-${paddedDay}`;

    const futureMatches = events.filter(e => (e.date_payment || e.date) === dateKey);
    const historyMatches = history.filter(h => (h.date_payment || h.date) === dateKey);

    const combined = [
      ...historyMatches.map(h => ({ ...h, sourceType: 'past' as const })),
      ...futureMatches.map(f => ({ ...f, sourceType: 'future' as const })),
    ];
    const seen = new Set<string>();
    return combined.filter(ev => {
      const k = `${ev.ticker}|${ev.date_com || ev.date}|${ev.date_payment || ev.date}|${Number(ev.total || 0).toFixed(2)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Seasonality Max Value for heat mapping
  const maxSeasonalityVal = useMemo(() => {
    let max = 0.1;
    seasonality.forEach(row => {
      for (let m = 1; m <= 12; m++) {
        const val = row[`m${m}`] || 0;
        if (val > max) max = val;
      }
    });
    return max;
  }, [seasonality]);

  const getHeatmapColor = (val: number) => {
    if (!val || val === 0) return 'bg-slate-950/40 text-slate-600 border-slate-900/40';
    const intensity = Math.min(0.85, 0.15 + (val / maxSeasonalityVal) * 0.7);
    return {
      backgroundColor: `rgba(16, 185, 129, ${intensity})`,
      color: intensity > 0.5 ? '#022c22' : '#a7f3d0'
    };
  };

  // Yoc Data for selected ticker
  const selectedYocData = useMemo(() => {
    return yocHistory[selectedYocTicker] || [];
  }, [yocHistory, selectedYocTicker]);

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

  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <SubPageHeader />
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Proventos &amp; Renda Passiva</h1>
            <p className="text-xs text-text-muted">Mapeamento de data-com, histórico de yield e sazonalidade</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-5 bg-slate-900/60 p-1 rounded-2xl border border-slate-800/80 mb-8 max-w-4xl">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'calendar' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar size={13} /> Calendário
          </button>
          
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Percent size={13} /> Yield & Consistência
          </button>

          <button
            onClick={() => setActiveTab('yoc')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'yoc' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp size={13} /> Evolução YOC
          </button>

          <button
            onClick={() => setActiveTab('seasonality')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'seasonality' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table size={13} /> Sazonalidade
          </button>

          <button
            onClick={() => setActiveTab('extrato')}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all col-span-2 sm:col-span-1 ${
              activeTab === 'extrato' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={13} /> Extrato Real
          </button>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-64 w-full bg-slate-900/60 rounded-xl" />
            <Skeleton className="h-20 w-full bg-slate-900/60 rounded-xl" />
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            
            {/* 1. CALENDÁRIO VISUAL */}
            {activeTab === 'calendar' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Calendário de Grade */}
                <div className="lg:col-span-2 bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-md">
                  <div className="flex justify-between items-center mb-5">
                    <h2 className="text-base font-bold text-white capitalize">{monthName}</h2>
                    <div className="flex gap-1">
                      <button onClick={handlePrevMonth} className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800">
                        <ChevronLeft size={16} />
                      </button>
                      <button onClick={handleNextMonth} className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Grid Header (Days of week) */}
                  <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    <span>Dom</span>
                    <span>Seg</span>
                    <span>Ter</span>
                    <span>Qua</span>
                    <span>Qui</span>
                    <span>Sex</span>
                    <span>Sáb</span>
                  </div>

                  {/* Grid Cells */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {calendarCells.map((day, idx) => {
                      if (day === null) {
                        return <div key={`empty-${idx}`} className="h-20 bg-slate-950/10 rounded-lg border border-transparent" />;
                      }

                      const dayEvents = getEventsForDay(day);
                      const hasEvents = dayEvents.length > 0;

                      return (
                        <div 
                          key={`day-${day}`} 
                          className={`h-20 p-1.5 bg-slate-900/30 border rounded-xl flex flex-col justify-between transition-colors hover:bg-slate-900/50 ${
                            hasEvents ? 'border-slate-800/80 shadow-[inset_0_1px_2px_rgba(255,255,255,0.02)]' : 'border-slate-950'
                          }`}
                        >
                          <span className="text-xs font-mono font-bold text-slate-500">{day}</span>
                          
                          <div className="flex flex-col gap-0.5 overflow-hidden">
                            {dayEvents.slice(0, 2).map((evt, i) => (
                              <div 
                                key={i} 
                                title={isHidden ? evt.ticker : `${evt.ticker}: R$ ${evt.value_per_share.toFixed(4)}`}
                                className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded truncate ${
                                  evt.status === 'PAGO' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' 
                                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/15'
                                }`}
                              >
                                {evt.ticker}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <span className="text-[7px] font-bold text-slate-500 text-right">+{dayEvents.length - 2} mais</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Eventos Destacados do Mês */}
                <div className="flex flex-col gap-4">
                  <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-md">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-1.5">
                      <Clock size={12} className="text-blue-400" />
                      Proventos de {monthName}
                    </h3>

                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {events.filter(e => {
                        const [y, m] = e.date.split('-');
                        return parseInt(y) === currentYear && parseInt(m) === (currentMonth + 1);
                      }).length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-8">Nenhum provento provisionado para este mês.</p>
                      ) : (
                        events
                          .filter(e => {
                            const eff = e.date_payment || e.date;
                            const [y, m] = eff.split('-');
                            return parseInt(y) === currentYear && parseInt(m) === (currentMonth + 1);
                          })
                          .map((evt, idx) => {
                            const payFmt = (evt.date_payment || evt.date).split('-').reverse().join('/');
                            const comFmt = (evt.date_com || evt.date).split('-').reverse().join('/');
                            const isPaid = evt.status === 'PAGO';
                            return (
                              <div key={idx} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-white">{evt.ticker}</span>
                                    {evt.type && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-slate-300">
                                        {evt.type}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                                    Pgto: {payFmt} · Com: {comFmt}
                                  </span>
                                  {evt.quantity ? (
                                    <span className="text-[9px] text-slate-500 font-mono block">
                                      {evt.quantity} un. × R$ {Number(evt.value_per_share || 0).toFixed(4)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-xs font-mono font-bold block ${isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {money(evt.total)}
                                  </span>
                                  <span className={`text-[8px] font-black uppercase tracking-wide block ${isPaid ? 'text-emerald-500/80' : 'text-amber-400'}`}>
                                    {evt.status}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. YIELDS & CONSISTÊNCIA */}
            {activeTab === 'analytics' && (
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-md overflow-hidden">
                <div className="flex items-center gap-2 mb-6">
                  <Award className="text-indigo-400" size={16} />
                  <h2 className="text-base font-bold text-white">Análise de Rendimento & Consistência</h2>
                </div>

                <div className="overflow-x-auto w-full border border-slate-900 rounded-xl">
                  <table className="w-full text-xs text-left border-collapse bg-slate-950/20">
                    <thead className="bg-slate-900/60 text-slate-400 font-bold border-b border-slate-900">
                      <tr>
                        <th className="p-3">Ativo</th>
                        <th className="p-3 text-right">DY Forward Est.</th>
                        <th className="p-3 text-right">Payout Histórico</th>
                        <th className="p-3 text-right">Regularidade (Trimestres)</th>
                        <th className="p-3 text-right">Score de Consistência</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 text-slate-300">
                      {analytics.map((row) => (
                        <tr key={row.ticker} className="hover:bg-slate-900/20">
                          <td className="p-3 font-bold text-white">{row.ticker}</td>
                          <td className="p-3 text-right text-emerald-400 font-mono font-bold">{row.dy_forward.toFixed(2)}%</td>
                          <td className="p-3 text-right font-mono">
                            {row.payout_historico !== null ? `${row.payout_historico.toFixed(1)}%` : '--'}
                          </td>
                          <td className="p-3 text-right text-slate-400 font-mono">{row.num_quarters}T</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                row.regularidade_score >= 80 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : row.regularidade_score >= 40 
                                    ? 'bg-amber-500/10 text-amber-400' 
                                    : 'bg-red-500/10 text-red-400'
                              }`}>
                                {row.regularidade_score} / 100
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. EVOLUÇÃO YIELD ON COST */}
            {activeTab === 'yoc' && (() => {
              const isPortfolioYoc = selectedYocTicker === 'CARTEIRA';
              const yocTickersSorted = [
                ...(yocHistory.CARTEIRA ? ['CARTEIRA'] : []),
                ...Object.keys(yocHistory).filter((tk) => tk !== 'CARTEIRA').sort(),
              ];
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

                      {/* Selector Dropdown */}
                      <select
                        aria-label="Selecionar ativo ou carteira para análise de YoC e DY"
                        value={selectedYocTicker}
                        onChange={(e) => {
                          setSelectedYocTicker(e.target.value);
                          setSelectedYocYear('all');
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
                        {/* KPI Summary Cards */}
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

                        {/* Semáforo de Qualidade */}
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

                        {/* Composed Chart: YoC (%) colorido + DY (%) vs PM/Custo (R$) + Mercado (R$) */}
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
                                      style={{
                                        backgroundColor: palette.tooltipBg,
                                        border: `1px solid ${palette.tooltipBorder}`,
                                      }}
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
                                        <span className="text-accent font-medium">
                                          {isPortfolioYoc ? 'DY de Mercado:' : 'DY do Ativo (Mercado):'}
                                        </span>
                                        <span className="font-mono font-bold text-accent">{(row.dy_market ?? 0).toFixed(2)}%</span>
                                      </div>
                                      <div className="flex justify-between gap-4 text-[11px]">
                                        <span className="text-text-muted">Diferença (YoC - DY):</span>
                                        <span className={`font-mono font-bold ${q.spreadClass}`}>{q.spreadLabel}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-status-warning font-medium">
                                          {isPortfolioYoc ? 'Custo Investido (Momento):' : 'Meu PM no Momento:'}
                                        </span>
                                        <span className="font-mono font-bold text-status-warning">
                                          {money(row.pm_at_moment ?? 0)}
                                        </span>
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
                                  <Cell
                                    key={`yoc-cell-${entry.year}-${idx}`}
                                    fill={getYocQuality(entry.yoc, entry.dy_market ?? 0).barColor}
                                  />
                                ))}
                              </Bar>
                              <Bar yAxisId="yield" dataKey="dy_market" name={isPortfolioYoc ? 'DY de Mercado (%)' : 'DY do Ativo (Mercado)'} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={26} />
                              <Line
                                yAxisId="price"
                                type="monotone"
                                dataKey="pm_at_moment"
                                name={isPortfolioYoc ? 'Custo Investido (R$)' : 'Meu PM no Momento (R$)'}
                                stroke="#f59e0b"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: '#f59e0b' }}
                                activeDot={{ r: 6 }}
                              />
                              <Line
                                yAxisId="price"
                                type="monotone"
                                dataKey="market_price"
                                name={isPortfolioYoc ? 'Patrimônio Médio (R$)' : 'Cotação Média do Ativo (R$)'}
                                stroke="#94a3b8"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={{ r: 3, fill: '#94a3b8' }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Resumo Anual */}
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
                                    onClick={() => setSelectedYocYear(isSelectedYr ? 'all' : row.year)}
                                    className={`cursor-pointer transition-colors ${
                                      isSelectedYr ? 'bg-accent-soft' : 'hover:bg-surface-elevated/60'
                                    }`}
                                  >
                                    <td className="p-3 font-bold font-mono">{row.year}</td>
                                    <td className="p-3 text-right font-mono text-text-muted">{row.payments_count ?? 0}</td>
                                    {!isPortfolioYoc && <td className="p-3 text-right font-mono">{money(row.dpa)}</td>}
                                    <td className="p-3 text-right font-mono font-bold text-status-warning">
                                      {money(row.pm_at_moment ?? 0)}
                                    </td>
                                    <td className="p-3 text-right font-mono text-text-muted">
                                      {money(row.market_price ?? 0)}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold" style={{ color: q.barColor }}>
                                      {row.yoc.toFixed(2)}%
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-accent">
                                      {(row.dy_market ?? 0).toFixed(2)}%
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="inline-flex flex-col items-center gap-0.5">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${q.badgeClass}`}>
                                          {q.label}
                                        </span>
                                        <span className={`text-[9px] font-mono ${q.spreadClass}`}>
                                          {q.spreadLabel}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">
                                      {money(row.total_received ?? 0)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Histórico por Recebimento Individual */}
                        {yocSummary.allEvents.length > 0 && (
                          <div className="mt-6">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                                Por Recebimento ({yocSummary.allEvents.length}) — YoC vs DY &amp; PM da Data
                              </h3>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedYocYear('all')}
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
                                    onClick={() => setSelectedYocYear(row.year)}
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
                                        {isPortfolioYoc && (
                                          <td className="p-2.5 font-bold font-mono text-text-primary">
                                            {ev.ticker || '--'}
                                          </td>
                                        )}
                                        <td className="p-2.5 text-text-muted">{ev.type || 'Dividendo'}</td>
                                        <td className="p-2.5 text-right font-mono">
                                          {isHidden ? 'R$ •••' : `R$ ${ev.dpa.toFixed(4)}`}
                                        </td>
                                        <td className="p-2.5 text-right font-mono font-bold text-status-warning">
                                          {money(ev.pm_at_moment)}
                                        </td>
                                        <td className="p-2.5 text-right font-mono text-text-muted">
                                          {money(ev.market_price)}
                                        </td>
                                        <td className={`p-2.5 text-right font-mono font-bold ${beatQuote ? 'text-status-success' : 'text-status-warning'}`}>
                                          {ev.yoc_at_moment.toFixed(2)}%
                                        </td>
                                        <td className="p-2.5 text-right font-mono font-bold text-accent">
                                          {ev.dy_at_moment.toFixed(2)}%
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${pmStatusClass}`}>
                                            {pmStatusLabel}
                                          </span>
                                        </td>
                                        <td className="p-2.5 text-right font-mono font-bold">
                                          {money(ev.total)}
                                        </td>
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
            })()}

            {/* 4. HEATMAP DE SAZONALIDADE */}
            {activeTab === 'seasonality' && (
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-md overflow-hidden">
                <div className="flex items-center gap-2 mb-6">
                  <Table className="text-purple-400" size={16} />
                  <h2 className="text-base font-bold text-white">Heatmap Sazonal de Rendimentos</h2>
                </div>

                <div className="overflow-x-auto w-full border border-slate-900 rounded-xl">
                  <table className="w-full text-xs text-center border-collapse bg-slate-950/20">
                    <thead className="bg-slate-900/60 text-slate-400 font-bold border-b border-slate-900">
                      <tr>
                        <th className="p-3 text-left">Ano</th>
                        {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(m => (
                          <th key={m} className="p-3">{m}</th>
                        ))}
                        <th className="p-3 font-bold text-white text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {seasonality.map((row) => {
                        const yearlyTotal = Array.from({ length: 12 }, (_, i) => row[`m${i + 1}`] || 0).reduce((a, b) => a + b, 0);

                        return (
                          <tr key={row.year} className="hover:bg-slate-900/10">
                            <td className="p-3 font-bold text-white text-left bg-slate-950/30">{row.year}</td>
                            {Array.from({ length: 12 }, (_, i) => {
                              const val = row[`m${i + 1}`] || 0;
                              const style = getHeatmapColor(val);
                              return (
                                <td 
                                  key={i} 
                                  className="p-3 border border-slate-900 font-mono font-bold text-[10px]"
                                  style={typeof style === 'object' ? style : {}}
                                >
                                  {val > 0 ? (isHidden ? '•••' : formatMoney(val).replace('R$', '')) : '--'}
                                </td>
                              );
                            })}
                            <td className="p-3 font-mono font-bold text-white text-right bg-slate-950/30">
                              {money(yearlyTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. EXTRATO REAL */}
            {activeTab === 'extrato' && (
              <div className="space-y-8">
                {['A RECEBER', 'PAGO'].map(statusFilter => {
                  const items = history
                    .filter(d => d.status === statusFilter)
                    .sort((a, b) => {
                      const da = a.date_payment || a.date || '';
                      const db = b.date_payment || b.date || '';
                      return statusFilter === 'A RECEBER' ? da.localeCompare(db) : db.localeCompare(da);
                    });
                  if (items.length === 0) return null;

                  return (
                    <div key={statusFilter} className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-md">
                      <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${
                        statusFilter === 'PAGO' ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'PAGO' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                        {statusFilter === 'PAGO' ? `Liquidados (Em Conta) — ${items.length}` : `Provisionados / Anunciados (Aguardando) — ${items.length}`}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {items.map((div, i) => {
                          const payFmt = (div.date_payment || div.date || '').split('-').reverse().join('/');
                          const comFmt = (div.date_com || div.date || '').split('-').reverse().join('/');
                          return (
                            <div key={i} className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                  statusFilter === 'PAGO'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  <CalendarCheck size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-white text-base">{div.ticker}</span>
                                    {div.type && (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-slate-300">
                                        {div.type}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-mono uppercase">
                                    Pgto: {payFmt} · Data-Com: {comFmt}
                                  </p>
                                  {div.quantity ? (
                                    <p className="text-[9px] text-slate-500 font-mono">
                                      {div.quantity} un. · R$ {Number(div.value_per_share || 0).toFixed(4)}/cota
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`font-mono font-bold text-base ${statusFilter === 'PAGO' ? 'text-emerald-400' : 'text-amber-300'}`}>
                                  {money(div.total)}
                                </p>
                                <span className="text-[8px] text-slate-500 font-bold uppercase block">
                                  {statusFilter === 'PAGO' ? 'Confirmado' : 'A Receber'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
