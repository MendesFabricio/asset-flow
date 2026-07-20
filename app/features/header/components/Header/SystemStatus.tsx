'use client';

import React, { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Activity, Database, TrendingUp, Brain, CheckCircle2, 
  XCircle, AlertTriangle 
} from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ServiceStatus {
  status: 'online' | 'offline';
  message: string;
}

interface HealthResponse {
  status: 'online' | 'offline' | 'warning';
  timestamp: string;
  services: {
    database: ServiceStatus;
    yahoo_finance: ServiceStatus;
    gemini: ServiceStatus;
  };
  metrics?: {
    cpu_percent: number;
    mem_percent: number;
    mem_total_gb: number;
    mem_used_gb: number;
    error?: string;
  };
}

export function SystemStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, error, isLoading } = useSWR<HealthResponse>(
    '/api/health',
    fetcher,
    { refreshInterval: 120000, revalidateOnFocus: false }
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusConfig = () => {
    if (isLoading) {
      return {
        dotClass: 'bg-slate-400 animate-pulse shadow-[0_0_8px_rgba(148,163,184,0.3)]',
        text: 'Conectando...',
        color: 'text-slate-400',
        borderColor: 'border-slate-800',
      };
    }

    if (error || !data) {
      return {
        dotClass: 'bg-rose-500 animate-ping shadow-[0_0_10px_rgba(244,63,94,0.6)]',
        text: 'Instável',
        color: 'text-rose-500 border-rose-900/50',
        borderColor: 'border-rose-900/50',
      };
    }

    switch (data.status) {
      case 'online':
        return {
          dotClass: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]',
          text: 'Sistemas Operacionais',
          color: 'text-emerald-400 border-emerald-900/30',
          borderColor: 'border-emerald-900/30',
        };
      case 'warning':
        return {
          dotClass: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-pulse',
          text: 'Serviço sob Alerta',
          color: 'text-amber-400 border-amber-900/30',
          borderColor: 'border-amber-900/30',
        };
      case 'offline':
      default:
        return {
          dotClass: 'bg-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.7)] animate-bounce',
          text: 'Instável',
          color: 'text-rose-400 border-rose-900/40',
          borderColor: 'border-rose-900/40',
        };
    }
  };

  const config = getStatusConfig();

  const renderServiceRow = (
    name: string, 
    status: 'online' | 'offline' | undefined, 
    msg: string, 
    Icon: any
  ) => {
    const isOnline = status === 'online';
    return (
      <div className="flex items-start gap-3 p-2 rounded-lg bg-slate-950/60 border border-slate-900">
        <div className={`p-1.5 rounded bg-slate-900 border shrink-0 ${isOnline ? 'border-emerald-500/20 text-emerald-400' : 'border-rose-500/20 text-rose-400'}`}>
          <Icon size={13} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">{name}</span>
            {isOnline ? (
              <span className="text-[8px] font-extrabold uppercase text-emerald-400 bg-emerald-500/10 px-1 py-0.25 rounded">ONLINE</span>
            ) : (
              <span className="text-[8px] font-extrabold uppercase text-rose-400 bg-rose-500/10 px-1 py-0.25 rounded">OFFLINE</span>
            )}
          </div>
          <p className="text-[9px] text-slate-400 mt-0.5 leading-snug break-words pr-1">{msg}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative select-none" ref={containerRef}>
      {/* Indicador em pílula premium */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Status do sistema"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border bg-slate-900/40 backdrop-blur-md cursor-pointer transition-all duration-300 hover:bg-slate-900/80 ${config.borderColor}`}
      >
        <span className="relative flex h-2 w-2">
          {(!data || data.status !== 'online') && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dotClass.split(' ')[0]}`}></span>
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotClass}`}></span>
        </span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
          {config.text}
        </span>
      </button>

      {/* Tooltip Rico Expandido */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-72 rounded-xl border border-slate-800 bg-[#0b0f19] p-3 shadow-2xl shadow-black/80 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-900 mb-2.5">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Diagnóstico Pro</span>
            </div>
            {data && (
              <span className="text-[8px] font-mono text-slate-500">
                {new Date(data.timestamp).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>

          {/* Sub-serviços */}
          <div className="space-y-2">
            {renderServiceRow(
              'API Financeira', 
              data?.services?.yahoo_finance?.status, 
              data?.services?.yahoo_finance?.message || 'Verificando rate limit e conectividade...',
              TrendingUp
            )}
            {renderServiceRow(
              'Banco de Dados SQLite', 
              data?.services?.database?.status, 
              data?.services?.database?.message || 'Checando integridade das tabelas e do WAL...',
              Database
            )}
            {renderServiceRow(
              'IA Jarvis (Gemini)', 
              data?.services?.gemini?.status, 
              data?.services?.gemini?.message || 'Validando API Key...',
              Brain
            )}
          </div>

          {/* Hardware Metrics */}
          {data?.metrics && data.metrics.mem_total_gb > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-900 grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-950/60 border border-slate-900">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">CPU (VM)</span>
                <span className={`text-[10px] font-mono font-bold ${data.metrics.cpu_percent > 85 ? 'text-rose-400' : data.metrics.cpu_percent > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {data.metrics.cpu_percent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-950/60 border border-slate-900">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">RAM</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-mono font-bold ${data.metrics.mem_percent > 85 ? 'text-rose-400' : data.metrics.mem_percent > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {data.metrics.mem_percent.toFixed(1)}%
                  </span>
                  <span className="text-[7px] text-slate-500 font-mono tracking-tight">
                    {data.metrics.mem_used_gb.toFixed(1)}/{data.metrics.mem_total_gb.toFixed(1)}G
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Informativo */}
          <div className="mt-3 pt-2 border-t border-slate-900 flex items-center gap-1.5 justify-center">
            {error || (data && data.status === 'offline') ? (
              <XCircle size={10} className="text-rose-500" />
            ) : data && data.status === 'warning' ? (
              <AlertTriangle size={10} className="text-amber-500" />
            ) : (
              <CheckCircle2 size={10} className="text-emerald-500" />
            )}
            <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">
              {error || (data && data.status === 'offline') 
                ? 'Operação Crítica Interrompida' 
                : data && data.status === 'warning'
                ? 'IA Inativa - Funcionalidades Online'
                : 'Todos os sistemas em harmonia'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
