'use client';

import React, { useState } from 'react';
import { Info } from 'lucide-react';

export function MetricCard({
  label,
  value,
  unit = '',
  icon: Icon,
  color,
  tooltip,
  subtext,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  tooltip?: string;
  subtext?: string;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative bg-surface-elevated/60 border border-border-subtle rounded-xl p-4 flex flex-col gap-1 hover:border-accent/40 transition-all group">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={color} />
          {tooltip && (
            <button
              type="button"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <Info size={11} />
            </button>
          )}
        </div>
      </div>
      <div className={`text-2xl font-bold font-mono tracking-tight ${color}`}>
        {value}
        <span className="text-sm font-normal text-text-muted ml-0.5">{unit}</span>
      </div>
      {subtext && <p className="text-[10px] text-text-muted leading-tight mt-0.5">{subtext}</p>}

      {showTip && tooltip && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-56 bg-surface-card border border-border-subtle rounded-lg p-2.5 shadow-2xl text-[10px] text-text-secondary leading-relaxed pointer-events-none">
          {tooltip}
        </div>
      )}
    </div>
  );
}

export const DrawdownTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-text-muted mb-1">{label}</p>
      <p className={`font-bold font-mono ${v < 0 ? 'text-status-error' : 'text-status-success'}`}>{v.toFixed(2)}%</p>
    </div>
  );
};
