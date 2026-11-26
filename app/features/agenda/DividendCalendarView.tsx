'use client';

import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { CalendarEvento, Evento } from './types';

interface DividendCalendarViewProps {
  monthName: string;
  currentYear: number;
  currentMonth: number;
  calendarCells: (number | null)[];
  events: Evento[];
  isHidden: boolean;
  money: (val: number) => string;
  getEventsForDay: (day: number) => CalendarEvento[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function DividendCalendarView({
  monthName,
  currentYear,
  currentMonth,
  calendarCells,
  events,
  isHidden,
  money,
  getEventsForDay,
  onPrevMonth,
  onNextMonth,
}: DividendCalendarViewProps) {
  const monthEvents = events.filter((e) => {
    const eff = e.date_payment || e.date;
    const [y, m] = eff.split('-');
    return parseInt(y, 10) === currentYear && parseInt(m, 10) === currentMonth + 1;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-surface-card border border-border-subtle rounded-2xl p-5 backdrop-blur-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-bold text-text-primary capitalize">{monthName}</h2>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onPrevMonth}
              className="p-1.5 bg-surface-elevated hover:bg-surface-input text-text-muted hover:text-text-primary rounded-lg border border-border-subtle"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={onNextMonth}
              className="p-1.5 bg-surface-elevated hover:bg-surface-input text-text-muted hover:text-text-primary rounded-lg border border-border-subtle"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
          <span>Dom</span>
          <span>Seg</span>
          <span>Ter</span>
          <span>Qua</span>
          <span>Qui</span>
          <span>Sex</span>
          <span>Sáb</span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="h-20 bg-surface-elevated/20 rounded-lg border border-transparent" />;
            }

            const dayEvents = getEventsForDay(day);
            const hasEvents = dayEvents.length > 0;

            return (
              <div
                key={`day-${day}`}
                className={`h-20 p-1.5 bg-surface-elevated/40 border rounded-xl flex flex-col justify-between transition-colors hover:bg-surface-elevated ${
                  hasEvents ? 'border-border-subtle shadow-sm' : 'border-border-subtle/40'
                }`}
              >
                <span className="text-xs font-mono font-bold text-text-muted">{day}</span>

                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((evt, i) => (
                    <div
                      key={i}
                      title={isHidden ? evt.ticker : `${evt.ticker}: R$ ${evt.value_per_share.toFixed(4)}`}
                      className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded truncate ${
                        evt.status === 'PAGO'
                          ? 'bg-emerald-500/10 text-status-success border border-emerald-500/15'
                          : 'bg-blue-500/10 text-accent border border-blue-500/15'
                      }`}
                    >
                      {evt.ticker}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[7px] font-bold text-text-muted text-right">+{dayEvents.length - 2} mais</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 backdrop-blur-md">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-1.5">
            <Clock size={12} className="text-accent" />
            Proventos de {monthName}
          </h3>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {monthEvents.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-8">Nenhum provento provisionado para este mês.</p>
            ) : (
              monthEvents.map((evt, idx) => {
                const payFmt = (evt.date_payment || evt.date).split('-').reverse().join('/');
                const comFmt = (evt.date_com || evt.date).split('-').reverse().join('/');
                const isPaid = evt.status === 'PAGO';
                return (
                  <div key={idx} className="p-3 bg-surface-elevated border border-border-subtle rounded-xl flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary">{evt.ticker}</span>
                        {evt.type && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary">
                            {evt.type}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-text-muted font-mono block mt-0.5">
                        Pgto: {payFmt} · Com: {comFmt}
                      </span>
                      {evt.quantity ? (
                        <span className="text-[9px] text-text-muted font-mono block">
                          {evt.quantity} un. × {isHidden ? 'R$ •••' : `R$ ${Number(evt.value_per_share || 0).toFixed(4)}`}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs font-mono font-bold block ${isPaid ? 'text-status-success' : 'text-status-warning'}`}>
                        {money(evt.total)}
                      </span>
                      <span className={`text-[8px] font-black uppercase tracking-wide block ${isPaid ? 'text-status-success' : 'text-status-warning'}`}>
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
  );
}
