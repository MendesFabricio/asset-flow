'use client';

import React from 'react';
import { CreditCard, DollarSign, Clock } from 'lucide-react';
import { formatMoney } from '../../lib/format';

interface CreditCardKpiCardsProps {
  displayLimitLabel: string;
  displayLimit: number;
  displaySpentLabel: string;
  displaySpent: number;
  displayPendingLabel: string;
  displayPending: number;
}

export function CreditCardKpiCards({
  displayLimitLabel,
  displayLimit,
  displaySpentLabel,
  displaySpent,
  displayPendingLabel,
  displayPending,
}: CreditCardKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displayLimitLabel}</p>
            <h3 className="text-2xl font-bold text-white mt-1">{formatMoney(displayLimit)}</h3>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <CreditCard size={18} />
          </div>
        </div>
      </div>

      <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displaySpentLabel}</p>
            <h3 className="text-2xl font-bold text-rose-400 mt-1">{formatMoney(displaySpent)}</h3>
          </div>
          <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
            <DollarSign size={18} />
          </div>
        </div>
      </div>

      <div className="bg-surface-card border border-slate-800 rounded-xl p-5 relative overflow-hidden shadow-lg">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">{displayPendingLabel}</p>
            <h3 className="text-2xl font-bold text-amber-400 mt-1">{formatMoney(displayPending)}</h3>
          </div>
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
            <Clock size={18} />
          </div>
        </div>
      </div>
    </div>
  );
}
