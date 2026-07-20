'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { formatMoney } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';
import { apiCall } from '../lib/api';
import { ArrowLeft, Calendar, Percent, TrendingUp, Table, History, ChevronLeft, ChevronRight, Clock, Award, CalendarCheck } from 'lucide-react';
import {
  ResponsiveContainer, 
  BarChart, 
  Bar, 
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

interface YocHistoryItem {
  year: number;
  dpa: number;
  yoc: number;
}

interface SeasonalityRow {
  year: number;
  [key: string]: number; // m1 to m12
}

export default function ProventosPage() {
  const palette = useChartPalette();
  const [activeTab, setActiveTab] = useState<'calendar' | 'analytics' | 'yoc' | 'seasonality' | 'extrato'>('calendar');
  const [events, setEvents] = useState<Evento[]>([]);
  const [history, setHistory] = useState<Evento[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsItem[]>([]);
  const [yocHistory, setYocHistory] = useState<Record<string, YocHistoryItem[]>>({});
  const [seasonality, setSeasonality] = useState<SeasonalityRow[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [selectedYocTicker, setSelectedYocTicker] = useState('');
  
  // States for Calendar Grid
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-indexed

  // Fetch all data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiCall<Evento[]>('/api/calendar'),
      apiCall<Evento[]>('/api/dividends/history'),
      apiCall<AnalyticsItem[]>('/api/dividends/analytics'),
      apiCall<Record<string, YocHistoryItem[]>>('/api/dividends/yoc-history'),
      apiCall<SeasonalityRow[]>('/api/dividends/seasonality')
    ])
      .then(([calendarData, historyData, analyticsData, yocData, seasonalityData]) => {
        setEvents(calendarData || []);
        setHistory(historyData || []);
        setAnalytics(analyticsData || []);
        setYocHistory(yocData || {});
        setSeasonality(seasonalityData || []);

        const tickers = Object.keys(yocData || {});
        if (tickers.length > 0) {
          setSelectedYocTicker(tickers[0]);
        }
      })
      .catch((err) => {
        console.error("Erro ao carregar módulo de proventos:", err);
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
    
    // Procura na agenda futura
    const futureMatches = events.filter(e => e.date === dateKey);
    // Procura no histórico (extrato real)
    const historyMatches = history.filter(h => h.date === dateKey);
    
    return [
      ...futureMatches.map(f => ({ ...f, type: 'future' })),
      ...historyMatches.map(h => ({ ...h, type: 'past' }))
    ];
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

  return (
    <div className="min-h-screen bg-surface text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-800/80">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Proventos & Renda Passiva</h1>
              <p className="text-xs text-slate-500">Mapeamento de data-com, histórico de yield e sazonalidade</p>
            </div>
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
                                title={`${evt.ticker}: R$ ${evt.value_per_share.toFixed(4)}`}
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
                            const [y, m] = e.date.split('-');
                            return parseInt(y) === currentYear && parseInt(m) === (currentMonth + 1);
                          })
                          .map((evt, idx) => (
                            <div key={idx} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold text-white block">{evt.ticker}</span>
                                <span className="text-[9px] text-slate-500 font-mono">Data-COM: {evt.date.split('-').reverse().join('/')}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-mono font-bold text-emerald-400 block">{formatMoney(evt.total)}</span>
                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-wide block">{evt.status}</span>
                              </div>
                            </div>
                          ))
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
            {activeTab === 'yoc' && (
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="text-emerald-400" size={16} />
                    <h2 className="text-base font-bold text-white">Evolução do Yield on Cost (YoC) Real</h2>
                  </div>
                  
                  {/* Selector Dropdown */}
                  <select
                    value={selectedYocTicker}
                    onChange={(e) => setSelectedYocTicker(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-white px-3 py-2 focus:outline-none focus:border-emerald-500/50"
                  >
                    {Object.keys(yocHistory).map((tk) => (
                      <option key={tk} value={tk}>{tk}</option>
                    ))}
                  </select>
                </div>

                {selectedYocData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-slate-500">
                    Nenhum histórico disponível para este ativo.
                  </div>
                ) : (
                  <div className="h-72 w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedYocData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
                        <XAxis dataKey="year" stroke={palette.axis} fontSize={11} />
                        <YAxis stroke={palette.axis} fontSize={11} unit="%" />
                        <ChartTooltip 
                          contentStyle={{ backgroundColor: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, borderRadius: '12px' }}
                          labelStyle={{ color: palette.tooltipLabel, fontWeight: 'bold' }}
                          formatter={(value: any) => [`${value}%`, 'Yield on Cost']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                        <Bar dataKey="yoc" name="YoC Real" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

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
                                  {val > 0 ? formatMoney(val).replace('R$', '') : '--'}
                                </td>
                              );
                            })}
                            <td className="p-3 font-mono font-bold text-white text-right bg-slate-950/30">
                              {formatMoney(yearlyTotal)}
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
                  const items = history.filter(d => d.status === statusFilter);
                  if (items.length === 0) return null;

                  return (
                    <div key={statusFilter} className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 backdrop-blur-md">
                      <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${
                        statusFilter === 'PAGO' ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'PAGO' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                        {statusFilter === 'PAGO' ? 'Liquidados (Em Conta)' : 'Provisionados (Aguardando)'}
                      </h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {items.map((div, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                            <div className="flex items-center gap-4">
                              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                <CalendarCheck size={16} />
                              </div>
                              <div>
                                <span className="font-bold text-white text-base">{div.ticker}</span>
                                <p className="text-[10px] text-slate-500 font-mono uppercase">
                                  Data-Com: {div.date.split('-').reverse().join('/')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono font-bold text-base ${statusFilter === 'PAGO' ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {formatMoney(div.total)}
                              </p>
                              <span className="text-[8px] text-slate-500 font-bold uppercase block">
                                {statusFilter === 'PAGO' ? 'Confirmado' : 'Aguardando'}
                              </span>
                            </div>
                          </div>
                        ))}
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
