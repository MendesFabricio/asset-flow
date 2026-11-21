'use client';

import React, { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Activity, Database, TrendingUp, Brain, CheckCircle2, 
  XCircle, AlertTriangle 
} from 'lucide-react';
import { apiCall } from '@/lib/api';

const fetcher = (url: string) => apiCall<HealthResponse>(url);

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
        dotClass: 'bg-text-muted animate-pulse',
        text: 'Conectando...',
        color: 'text-text-muted',
        borderColor: 'border-border-subtle',
      };
    }

    if (error || !data) {
      return {
        dotClass: 'bg-status-error',
        text: 'Instável',
        color: 'text-status-error border-status-error/40',
        borderColor: 'border-status-error/40',
      };
    }

    switch (data.status) {
      case 'online':
        return {
          dotClass: 'bg-status-success',
          text: 'Sistemas Operacionais',
          color: 'text-status-success border-status-success/30',
          borderColor: 'border-status-success/30',
        };
      case 'warning':
        return {
          dotClass: 'bg-status-warning',
          text: 'Serviço sob Alerta',
          color: 'text-status-warning border-status-warning/30',
          borderColor: 'border-status-warning/30',
        };
      case 'offline':
      default:
        return {
          dotClass: 'bg-status-error',
          text: 'Instável',
          color: 'text-status-error border-status-error/40',
          borderColor: 'border-status-error/40',
        };
    }
  };

  const config = getStatusConfig();

  const renderServiceRow = (
    name: string, 
    status: 'online' | 'offline' | undefined,
    msg: string,
    Icon: React.ComponentType<{ size?: number; className?: string }>
  ) => {
    const isOnline = status === 'online';
    return (
      <div className="flex items-start gap-3 p-2 rounded-lg bg-surface-elevated border border-border-subtle">
        <div className={`p-1.5 rounded-md bg-surface-card border shrink-0 ${isOnline ? 'border-status-success/20 text-status-success' : 'border-status-error/20 text-status-error'}`}>
          <Icon size={13} />
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-2xs font-medium text-text-primary uppercase tracking-wider">{name}</span>
            {isOnline ? (
              <span className="text-2xs font-medium uppercase text-status-success bg-status-success/10 px-1 rounded-md">ONLINE</span>
            ) : (
              <span className="text-2xs font-medium uppercase text-status-error bg-status-error/10 px-1 rounded-md">OFFLINE</span>
            )}
          </div>
          <p className="text-2xs text-text-muted mt-0.5 leading-snug break-words pr-1">{msg}</p>
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
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border bg-surface-card cursor-pointer transition-colors duration-150 hover:bg-surface-elevated ${config.borderColor}`}
      >
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dotClass}`}></span>
        </span>
        <span className={`text-2xs font-medium uppercase tracking-wider ${config.color}`}>
          {config.text}
        </span>
      </button>

      {/* Tooltip Rico Expandido */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-72 rounded-xl border border-border-subtle bg-surface-card p-3 shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-2.5">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-text-muted" />
              <span className="text-2xs font-medium uppercase tracking-wider text-text-muted">Diagnóstico Pro</span>
            </div>
            {data && (
              <span className="text-2xs font-mono tabular-nums text-text-muted">
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
              data?.services?.gemini?.message?.includes('Ollama') ? 'IA Jarvis (Local)' : 'IA Jarvis (Gemini)', 
              data?.services?.gemini?.status, 
              data?.services?.gemini?.message || 'Validando IA...',
              Brain
            )}
          </div>

          {/* Hardware Metrics */}
          {data?.metrics && data.metrics.mem_total_gb > 0 && (
            <div className="mt-2.5 pt-2 border-t border-border-subtle grid grid-cols-2 gap-1.5">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-surface-elevated border border-border-subtle">
                <span className="text-2xs font-medium text-text-muted uppercase tracking-wider">CPU (VM)</span>
                <span className={`text-2xs font-semibold tabular-nums ${data.metrics.cpu_percent > 85 ? 'text-status-error' : data.metrics.cpu_percent > 60 ? 'text-status-warning' : 'text-status-success'}`}>
                  {data.metrics.cpu_percent.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-surface-elevated border border-border-subtle">
                <span className="text-2xs font-medium text-text-muted uppercase tracking-wider">RAM</span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-2xs font-semibold tabular-nums ${data.metrics.mem_percent > 85 ? 'text-status-error' : data.metrics.mem_percent > 60 ? 'text-status-warning' : 'text-status-success'}`}>
                    {data.metrics.mem_percent.toFixed(1)}%
                  </span>
                  <span className="text-2xs text-text-muted tracking-tight tabular-nums">
                    {data.metrics.mem_used_gb.toFixed(1)}/{data.metrics.mem_total_gb.toFixed(1)}G
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Informativo */}
          <div className="mt-3 pt-2 border-t border-border-subtle flex items-center gap-1.5 justify-center">
            {error || (data && data.status === 'offline') ? (
              <XCircle size={10} className="text-status-error" />
            ) : data && data.status === 'warning' ? (
              <AlertTriangle size={10} className="text-status-warning" />
            ) : (
              <CheckCircle2 size={10} className="text-status-success" />
            )}
            <span className="text-2xs text-text-muted uppercase tracking-wider font-normal">
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
