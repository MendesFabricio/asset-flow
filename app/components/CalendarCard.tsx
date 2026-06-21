'use client';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { Calendar, Clock, CalendarClock } from 'lucide-react';
import { formatMoney } from '../utils';
import { Badge } from './ui/Badge';
import { Skeleton } from './ui/Skeleton';

interface Evento {
  ticker: string;
  date: string;
  type: string;
  total: number;
  status: string;
  value_per_share: number;
}

export const CalendarCard = () => {
  const [events, setEvents] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/calendar`)
      .then(res => res.json())
      .then(data => {
        // Ordena por data (mais próximos primeiro)
        const sorted = data.sort((a: Evento, b: Evento) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setEvents(sorted);
        setLoading(false);
      })
      .catch(e => setLoading(false));
  }, []);

  // Função para pegar o nome do mês abreviado
  const getMonthAbbr = (dateStr: string) => {
    const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const monthIndex = parseInt(dateStr.split('-')[1]) - 1;
    return months[monthIndex] || '---';
  };

  const getDay = (dateStr: string) => dateStr.split('-')[2];

  return (
    <div className="bg-[#0b0f19] backdrop-blur-md rounded-2xl border border-slate-800 p-6 h-full flex flex-col overflow-hidden shadow-xl">
      
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
             <CalendarClock className="text-emerald-400" size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Agenda</h2>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Proventos</p>
          </div>
        </div>
        <Badge label="Futuro" variant="emerald" />
      </div>

      {/* Lista com Scroll Interno */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar min-h-0">
        {loading ? (
          // Skeletons para o carregamento
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-slate-800/50 rounded-xl">
              <div className="flex items-center gap-3">
                <Skeleton className="w-11 h-11" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 py-10">
            <Calendar size={32} className="opacity-20 text-slate-400" />
            <div className="text-center">
                <p className="text-sm font-bold text-slate-400">Nenhum agendamento</p>
                <p className="text-xs text-slate-600">As empresas ainda não anunciaram.</p>
            </div>
          </div>
        ) : (
          events.map((evt, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-xl border transition-all bg-slate-900/40 border-slate-800/60 hover:border-emerald-500/30 hover:bg-slate-800/40 group">
              
              <div className="flex items-center gap-3">
                {/* Data Box - Design Mais Refinado */}
                <div className="w-11 h-11 rounded-lg flex flex-col items-center justify-center border bg-slate-950 text-slate-400 border-slate-800 group-hover:border-emerald-500/40 transition-colors">
                    <span className="text-[8px] uppercase font-black tracking-tighter text-slate-500">
                      {getMonthAbbr(evt.date)}
                    </span>
                    <span className="text-lg font-black leading-none text-slate-200 group-hover:text-emerald-400">
                      {getDay(evt.date)}
                    </span>
                </div>
                
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-sm tracking-tight">{evt.ticker}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded border font-black uppercase tracking-tight ${
                        evt.type === 'DATA_COM' 
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                          {evt.type === 'DATA_COM' ? 'Data Com' : 'Pagamento'}
                      </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                      <Clock size={10} className="text-slate-600" />
                      {evt.status}
                  </div>
                </div>
              </div>

              <div className="text-right">
                  <p className="font-mono font-bold text-emerald-400 text-sm">
                    {evt.total > 0 ? formatMoney(evt.total) : '---'}
                  </p>
                  <p className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">
                    {evt.value_per_share > 0 ? `${formatMoney(evt.value_per_share)}/ct` : 'A definir'}
                  </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
