'use client';
import { useEffect, useState } from 'react';
import { Calendar as CalIcon, ArrowLeft, Clock, CalendarCheck, History } from 'lucide-react';
import Link from 'next/link';
import { formatMoney } from '../utils';
import { Skeleton } from '../components/ui/Skeleton';
import { apiCall } from '../utils/apiClient';

interface Evento {
  ticker: string;
  date: string;
  total: number;
  status: string;
  value_per_share: number;
  is_estimate: boolean;
}

export default function ProventosPage() {
  const [activeTab, setActiveTab] = useState<'agenda' | 'extrato'>('agenda');
  const [events, setEvents] = useState<Evento[]>([]);
  const [history, setHistory] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiCall<Evento[]>('/api/calendar'),
      apiCall<Evento[]>('/api/dividends/history')
    ])
      .then(([calendarData, historyData]) => {
        setEvents(calendarData);
        setHistory(historyData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar proventos:", err);
        setLoading(false);
      });
  }, []);

  const groupedEvents = events.reduce((acc, evt) => {
    const key = evt.date.substring(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(evt);
    return acc;
  }, {} as Record<string, Evento[]>);

  const months = Object.keys(groupedEvents).sort();

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 p-6 font-sans">
      <div className="max-w-3xl mx-auto">

        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="p-2.5 bg-slate-800/50 rounded-xl hover:bg-slate-700 transition-colors border border-slate-700/50">
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">Proventos</h1>
        </div>

        <div className="flex p-1 bg-slate-900/80 rounded-xl border border-slate-800 mb-8">
          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'agenda' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <CalIcon size={14} /> Agenda Futura
          </button>
          <button
            onClick={() => setActiveTab('extrato')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'extrato' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <History size={14} /> Extrato Real
          </button>
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-6 w-32 bg-slate-800" />
            <Skeleton className="h-20 w-full bg-slate-800" />
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {activeTab === 'agenda' ? (
              <div className="space-y-10">
                {months.map(month => {
                  const [y, m] = month.split('-');
                  const monthName = new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                  const totalMonth = groupedEvents[month].reduce((acc, curr) => acc + curr.total, 0);

                  return (
                    <div key={month}>
                      <div className="flex justify-between items-end border-b border-slate-800 pb-2 mb-4">
                        <h2 className="text-xl font-bold capitalize text-slate-300">{monthName}</h2>
                        <span className="text-blue-400 font-mono font-bold bg-blue-950/30 px-2 py-1 rounded text-sm">
                          + {formatMoney(totalMonth)}
                        </span>
                      </div>

                      <div className="grid gap-3">
                        {groupedEvents[month].map((evt, i) => (
                          <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${evt.is_estimate
                            ? 'bg-slate-900/40 border-dashed border-slate-800 opacity-70'
                            : 'bg-slate-900 border-emerald-900/30'
                            }`}>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-center justify-center min-w-[40px] py-1.5 bg-slate-950 rounded-lg border border-slate-800">
                                <span className="text-[7px] font-bold text-slate-500 leading-none mb-0.5 uppercase tracking-tighter">DIA</span>
                                <span className="text-base font-mono font-bold text-slate-200 leading-none">{evt.date.split('-')[2]}</span>
                              </div>

                              <div>
                                <span className="font-bold text-white text-lg">{evt.ticker}</span>
                                <p className="text-[11px] text-slate-500 font-medium">{formatMoney(evt.value_per_share)} p/ cota</p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className={`font-mono font-bold text-lg ${evt.is_estimate ? 'text-slate-400' : 'text-emerald-400'}`}>
                                {formatMoney(evt.total)}
                              </p>
                              <div className="text-[10px] flex items-center justify-end gap-1 font-bold text-slate-500 uppercase">
                                {evt.is_estimate ? <Clock size={10} /> : <CalendarCheck size={10} />} {evt.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-8">
                {['A RECEBER', 'PAGO'].map(statusFilter => {
                  const items = history.filter(d => d.status === statusFilter);
                  if (items.length === 0) return null;

                  return (
                    <div key={statusFilter}>
                      <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${statusFilter === 'PAGO' ? 'text-emerald-500' : 'text-amber-500'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'PAGO' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                        {statusFilter === 'PAGO' ? 'Liquidados (Em Conta)' : 'Provisionados (Aguardando)'}
                      </h3>

                      <div className="grid gap-3">
                        {items.map((div, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                <CalendarCheck size={18} />
                              </div>
                              <div>
                                <span className="font-bold text-white text-lg">{div.ticker}</span>
                                <p className="text-[10px] text-slate-500 font-mono uppercase">
                                  Data-Com: {div.date.split('-').reverse().join('/')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-mono font-bold text-lg ${statusFilter === 'PAGO' ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {formatMoney(div.total)}
                              </p>
                              <span className="text-[9px] text-slate-600 font-bold uppercase">
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
