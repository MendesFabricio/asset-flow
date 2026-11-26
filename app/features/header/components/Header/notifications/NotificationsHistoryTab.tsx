'use client';

import { CheckCircle, ChevronRight, History, RefreshCw, WifiOff, X } from 'lucide-react';
import {
  AlertItem,
  getSeverityStyles,
  mapTriggeredToAlert,
  TriggeredNotification,
} from './types';

export function NotificationsHistoryTab({
  loadingSubtab,
  historyEvents,
}: {
  loadingSubtab: boolean;
  historyEvents: TriggeredNotification[];
}) {
  if (loadingSubtab) {
    return (
      <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
        <RefreshCw size={18} className="animate-spin text-accent" />
        <p className="text-[10px]">Carregando histórico...</p>
      </div>
    );
  }
  if (historyEvents.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
        <History size={18} className="opacity-30" />
        <p className="text-[10px]">Nenhum alerta disparado no histórico ainda.</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {historyEvents.map((ev) => {
        const mapped = mapTriggeredToAlert(ev);
        const dtFmt = ev.triggered_at
          ? new Date(ev.triggered_at).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        return (
          <div key={ev.id} className="p-2.5 rounded-xl bg-surface border border-border-subtle space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-text-primary text-xs">{ev.ticker}</span>
                <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-elevated border border-border-subtle text-text-muted">
                  {mapped.type}
                </span>
              </div>
              <span className="text-[9px] font-mono text-text-muted">{dtFmt}</span>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">{mapped.message}</p>
          </div>
        );
      })}
    </div>
  );
}

export function NotificationsListTab({
  hasError,
  alerts,
  onAction,
  onDismissOne,
}: {
  hasError: boolean;
  alerts: AlertItem[];
  onAction: (alert: AlertItem) => void;
  onDismissOne: (alert: AlertItem) => void;
}) {
  if (hasError) {
    return (
      <div className="text-center py-10 text-text-muted flex flex-col items-center justify-center gap-2">
        <WifiOff size={20} className="opacity-50 text-status-error" />
        <p className="text-[10px] font-medium">Falha na rede ou servidor instável.</p>
      </div>
    );
  }
  if (alerts.length === 0) {
    return (
      <div className="text-center py-10 text-text-muted flex flex-col items-center justify-center gap-3">
        <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20">
          <CheckCircle size={22} className="text-status-success" />
        </div>
        <div>
          <p className="text-xs font-bold text-text-primary">Tudo em dia</p>
          <p className="text-[10px] mt-0.5 text-text-muted">Nenhuma notificação pendente no momento.</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {alerts.map((alert) => {
        const { icon, borderClass, hoverClass } = getSeverityStyles(alert.severity, alert.type);
        return (
          <div
            key={alert.id}
            className={`relative flex gap-2.5 p-3 rounded-xl border transition-all duration-200 group ${borderClass} ${hoverClass}`}
          >
            <div className="mt-0.5 shrink-0">{icon}</div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-text-primary text-xs">{alert.ticker}</span>
                <span className="text-[8px] font-bold text-text-muted uppercase bg-surface px-1.5 py-0.5 rounded border border-border-subtle">
                  {alert.type}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-snug">{alert.message}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0 self-center">
              {(alert.action || alert.link) && (
                <button
                  type="button"
                  onClick={() => onAction(alert)}
                  className="p-1 rounded-md text-accent hover:bg-accent-soft transition-colors"
                  title={
                    alert.link
                      ? 'Abrir informe oficial'
                      : alert.action === 'agenda'
                        ? 'Abrir agenda de proventos'
                        : 'Abrir ativo'
                  }
                >
                  <ChevronRight size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismissOne(alert)}
                className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
                title="Marcar como lida"
                aria-label={`Dispensar alerta de ${alert.ticker}`}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
