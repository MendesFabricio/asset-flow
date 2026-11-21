'use client';

import { useEffect, useState } from 'react';

interface MarketStatusProps {
  minimal?: boolean;
}

export function MarketStatus({ minimal = false }: MarketStatusProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function checkB3Status() {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      const minutes = now.getMinutes();
      
      const isWeekday = day >= 1 && day <= 5;
      const currentMinutes = hour * 60 + minutes;
      const openMinutes = 10 * 60;
      const closeMinutes = 17 * 60 + 55;
      
      const isMarketHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
      setIsOpen(isWeekday && isMarketHours);
    }

    checkB3Status();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      checkB3Status();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  if (minimal) {
    return (
      <div className="flex items-center gap-1.5 select-none leading-none">
        <span className={`w-1.5 h-1.5 rounded-full ${
          isOpen 
            ? 'bg-status-success' 
            : 'bg-text-muted/50'
        }`} />
        <span className="text-2xs font-semibold text-text-muted tracking-wider uppercase leading-none">
          B3 · {isOpen ? 'Aberto' : 'Fechado'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-surface-card border border-border-subtle rounded-md px-2.5 py-1 select-none">
      <span className={`w-1.5 h-1.5 rounded-full ${
        isOpen 
          ? 'bg-status-success' 
          : 'bg-text-muted/50'
      }`} />
      <span className="text-2xs font-semibold text-text-muted tracking-wide uppercase leading-none">
        B3 · {isOpen ? 'Pregão Aberto' : 'Fechado'}
      </span>
    </div>
  );
}
