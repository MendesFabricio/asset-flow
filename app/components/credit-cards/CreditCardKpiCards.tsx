'use client';

import React from 'react';
import { CreditCard, DollarSign, Clock } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import { usePrivacy } from '../../context/PrivacyContext';

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
  const { isHidden } = usePrivacy();
  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 relative overflow-hidden shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">{displayLimitLabel}</p>
            <h3 className="text-2xl font-semibold text-text-primary mt-1 tabular-nums">{money(displayLimit)}</h3>
          </div>
          <div className="p-2 bg-accent-soft text-accent rounded-lg">
            <CreditCard size={18} />
          </div>
        </div>
      </div>

      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 relative overflow-hidden shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">{displaySpentLabel}</p>
            <h3 className="text-2xl font-semibold text-status-error mt-1 tabular-nums">{money(displaySpent)}</h3>
          </div>
          <div className="p-2 bg-status-error/10 text-status-error rounded-lg">
            <DollarSign size={18} />
          </div>
        </div>
      </div>

      <div className="bg-surface-card border border-border-subtle rounded-xl p-5 relative overflow-hidden shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-text-muted font-semibold tracking-wider uppercase">{displayPendingLabel}</p>
            <h3 className="text-2xl font-semibold text-status-warning mt-1 tabular-nums">{money(displayPending)}</h3>
          </div>
          <div className="p-2 bg-status-warning/10 text-status-warning rounded-lg">
            <Clock size={18} />
          </div>
        </div>
      </div>
    </div>
  );
}
