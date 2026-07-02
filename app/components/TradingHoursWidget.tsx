'use client';
import { useState, useEffect, useRef } from 'react';
import { Clock, ChevronDown, Globe } from 'lucide-react';

export function TradingHoursWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [timeSP, setTimeSP] = useState('');
  const [timeNY, setTimeNY] = useState('');
  const [timeUTC, setTimeUTC] = useState('');
  
  const [b3Open, setB3Open] = useState(false);
  const [nyseOpen, setNyseOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Time updater & status checker
  useEffect(() => {
    const updateTimes = () => {
      const spTz = "America/Sao_Paulo";
      const nyTz = "America/New_York";

      // Time strings
      const spStr = new Date().toLocaleTimeString("pt-BR", { timeZone: spTz, hour: '2-digit', minute: '2-digit' });
      const nyStr = new Date().toLocaleTimeString("pt-BR", { timeZone: nyTz, hour: '2-digit', minute: '2-digit' });
      const utcStr = new Date().toLocaleTimeString("pt-BR", { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
      
      setTimeSP(spStr);
      setTimeNY(nyStr);
      setTimeUTC(utcStr);

      // B3 status
      const spDate = new Date(new Date().toLocaleString("en-US", { timeZone: spTz }));
      const spDay = spDate.getDay();
      const spHour = spDate.getHours();
      const spMin = spDate.getMinutes();
      const spTimeVal = spHour * 60 + spMin;
      const isB3Open = spDay !== 0 && spDay !== 6 && spTimeVal >= 600 && spTimeVal <= 1075;
      setB3Open(isB3Open);

      // NYSE status
      const nyDate = new Date(new Date().toLocaleString("en-US", { timeZone: nyTz }));
      const nyDay = nyDate.getDay();
      const nyHour = nyDate.getHours();
      const nyMin = nyDate.getMinutes();
      const nyTimeVal = nyHour * 60 + nyMin;
      const isNyseOpen = nyDay !== 0 && nyDay !== 6 && nyTimeVal >= 570 && nyTimeVal <= 960;
      setNyseOpen(isNyseOpen);
    };

    updateTimes();
    const interval = setInterval(updateTimes, 10000); // update every 10s
    return () => clearInterval(interval);
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const anyMarketOpen = b3Open || nyseOpen;

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 hover:bg-slate-700/80 rounded-full border border-slate-700/50 hover:border-slate-600 transition text-xs font-bold text-slate-300"
      >
        <Clock size={12} className="text-slate-400" />
        <span className="hidden md:inline">Bolsas:</span>
        <span className="flex items-center gap-1">
          {/* Pulser dot */}
          <span className={`w-1.5 h-1.5 rounded-full ${anyMarketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {anyMarketOpen ? 'Pregão Ativo' : 'Pregão Fechado'}
          </span>
        </span>
        <ChevronDown size={11} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-950/95 backdrop-blur-md rounded-xl border border-slate-800 shadow-2xl p-4 z-50 flex flex-col gap-3.5 animate-in fade-in slide-in-from-top-2 duration-200">
          
          <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
            <Globe size={13} className="text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status das Bolsas</span>
          </div>

          <div className="flex flex-col gap-3">
            {/* B3 Bolsa */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">B3 (São Paulo)</span>
                <span className="text-[10px] text-slate-500">Horário: 10:00 às 17:55</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold font-mono text-slate-300">{timeSP}</span>
                <span className="flex items-center gap-1 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${b3Open ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${b3Open ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {b3Open ? 'Aberta' : 'Fechada'}
                  </span>
                </span>
              </div>
            </div>

            {/* NYSE Bolsa */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">NYSE (New York)</span>
                <span className="text-[10px] text-slate-500">Horário: 09:30 às 16:00 EST</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold font-mono text-slate-300">{timeNY}</span>
                <span className="flex items-center gap-1 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${nyseOpen ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${nyseOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {nyseOpen ? 'Aberta' : 'Fechada'}
                  </span>
                </span>
              </div>
            </div>

            {/* Crypto Market */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-200">Cripto (Global)</span>
                <span className="text-[10px] text-slate-500">Horário: 24/7 (Sempre)</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold font-mono text-slate-300">{timeUTC} UTC</span>
                <span className="flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                    Aberta
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
