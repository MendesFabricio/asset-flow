'use client';

import { CalendarCheck } from 'lucide-react';
import { Evento } from './types';

interface DividendStatementViewProps {
  history: Evento[];
  isHidden: boolean;
  money: (val: number) => string;
}

export function DividendStatementView({ history, isHidden, money }: DividendStatementViewProps) {
  return (
    <div className="space-y-8">
      {['A RECEBER', 'PAGO'].map((statusFilter) => {
        const items = history
          .filter((d) => d.status === statusFilter)
          .sort((a, b) => {
            const da = a.date_payment || a.date || '';
            const db = b.date_payment || b.date || '';
            return statusFilter === 'A RECEBER' ? da.localeCompare(db) : db.localeCompare(da);
          });
        if (items.length === 0) return null;

        return (
          <div key={statusFilter} className="bg-surface-card border border-border-subtle rounded-2xl p-5 backdrop-blur-md">
            <h3
              className={`text-[10px] font-bold uppercase tracking-widest mb-4 flex items-center gap-2 ${
                statusFilter === 'PAGO' ? 'text-status-success' : 'text-status-warning'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'PAGO' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              {statusFilter === 'PAGO'
                ? `Liquidados (Em Conta) — ${items.length}`
                : `Provisionados / Anunciados (Aguardando) — ${items.length}`}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((div, i) => {
                const payFmt = (div.date_payment || div.date || '').split('-').reverse().join('/');
                const comFmt = (div.date_com || div.date || '').split('-').reverse().join('/');
                return (
                  <div key={i} className="flex items-center justify-between p-4 bg-surface-elevated border border-border-subtle rounded-xl gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          statusFilter === 'PAGO'
                            ? 'bg-emerald-500/10 text-status-success border-emerald-500/20'
                            : 'bg-amber-500/10 text-status-warning border-amber-500/20'
                        }`}
                      >
                        <CalendarCheck size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text-primary text-base">{div.ticker}</span>
                          {div.type && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-text-secondary">
                              {div.type}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-text-muted font-mono uppercase">
                          Pgto: {payFmt} · Data-Com: {comFmt}
                        </p>
                        {div.quantity ? (
                          <p className="text-[9px] text-text-muted font-mono">
                            {div.quantity} un. · {isHidden ? 'R$ •••' : `R$ ${Number(div.value_per_share || 0).toFixed(4)}/cota`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono font-bold text-base ${statusFilter === 'PAGO' ? 'text-status-success' : 'text-status-warning'}`}>
                        {money(div.total)}
                      </p>
                      <span className="text-[8px] text-text-muted font-bold uppercase block">
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
  );
}
