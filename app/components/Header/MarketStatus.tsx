'use client';

import { useEffect, useState } from 'react';

export function MarketStatus() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function checkB3Status() {
      const now = new Date();
      const day = now.getDay(); // 0: Sunday, 6: Saturday
      const hour = now.getHours();
      const minutes = now.getMinutes();
      
      const isWeekday = day >= 1 && day <= 5;
      const currentMinutes = hour * 60 + minutes;
      const openMinutes = 10 * 60; // 10:00
      const closeMinutes = 17 * 60 + 55; // 17:55
      
      const isMarketHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
      setIsOpen(isWeekday && isMarketHours);
    }

    checkB3Status();
    const interval = setInterval(checkB3Status, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800/60 rounded-full px-2.5 py-1 select-none">
      <span className={`w-1.5 h-1.5 rounded-full ${
        isOpen 
          ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse' 
          : 'bg-slate-600'
      }`} />
      <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase leading-none">
        B3 • {isOpen ? 'Pregão Aberto' : 'Fechado'}
      </span>
    </div>
  );
}
