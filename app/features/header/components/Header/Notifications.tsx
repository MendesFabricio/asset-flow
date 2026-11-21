'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  AlertTriangle,
  CheckCircle,
  WifiOff,
  AlertOctagon,
  Info,
  Settings,
  RefreshCw,
  ChevronRight,
  FileText,
  Trash2,
  X,
  CheckCheck,
  History,
  Zap,
  Coins,
  Send,
  RotateCcw,
} from 'lucide-react';
import { apiCall } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

interface AlertItem {
  id: string;
  triggered_id?: number;
  asset_id: number;
  ticker: string;
  type: string;
  message: string;
  field: string;
  severity: number;
  action: 'edit' | 'sync' | 'view' | 'refresh' | 'agenda' | 'valuation' | null;
}

interface TriggeredNotification {
  id: number;
  asset_id: number | null;
  event_type?: 'PRICE_ALERT' | 'SIGNAL_CHANGE' | 'DIVIDEND_ANNOUNCED' | string;
  ticker: string;
  condition: 'ABOVE' | 'BELOW' | 'SIGNAL_CHANGE' | 'DIVIDEND_ANNOUNCED' | string;
  target_price: number;
  current_price: number;
  note: string;
  is_notified?: boolean;
  triggered_at: string;
}

interface ActivePriceAlert {
  id: number;
  ticker: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  note: string;
  created_at: string;
}

interface AlertsResponse {
  items?: AlertItem[];
  total?: number;
  dismissed_count?: number;
  telegram_configured?: boolean;
}

interface ActivePriceAlertsResponse {
  status: string;
  alerts: ActivePriceAlert[];
}

interface HistoryResponse {
  status: string;
  events?: TriggeredNotification[];
}

interface NotificationsProps {
  onFixAsset: (assetId: number) => void;
}

type PopoverTab = 'notifications' | 'active' | 'history';

function mapTriggeredToAlert(n: TriggeredNotification): AlertItem {
  const evType =
    n.event_type ||
    (n.condition === 'SIGNAL_CHANGE'
      ? 'SIGNAL_CHANGE'
      : n.condition === 'DIVIDEND_ANNOUNCED'
        ? 'DIVIDEND_ANNOUNCED'
        : 'PRICE_ALERT');

  if (evType === 'SIGNAL_CHANGE') {
    return {
      id: `triggered-${n.id}`,
      triggered_id: n.id,
      asset_id: n.asset_id ?? 0,
      ticker: n.ticker,
      type: 'SINAL',
      message: n.note || `Mudança de sinal em ${n.ticker} (R$ ${n.current_price.toFixed(2)})`,
      field: 'signal',
      severity: 4,
      action: 'valuation',
    };
  }

  if (evType === 'DIVIDEND_ANNOUNCED') {
    return {
      id: `triggered-${n.id}`,
      triggered_id: n.id,
      asset_id: n.asset_id ?? 0,
      ticker: n.ticker,
      type: 'PROVENTO',
      message: n.note || `Novo provento anunciado para ${n.ticker}`,
      field: 'dividend',
      severity: 3,
      action: 'agenda',
    };
  }

  const severity = n.condition === 'BELOW' ? 4 : 5;
  const conditionText = n.condition === 'BELOW' ? 'caiu abaixo de' : 'subiu acima de';
  const noteText = n.note ? ` · ${n.note}` : '';
  return {
    id: `triggered-${n.id}`,
    triggered_id: n.id,
    asset_id: n.asset_id ?? 0,
    ticker: n.ticker,
    type: 'PREÇO',
    message: `Alvo atingido: ${conditionText} R$ ${n.target_price.toFixed(2)} (atual R$ ${n.current_price.toFixed(2)})${noteText}`,
    field: 'price',
    severity,
    action: n.asset_id ? 'view' : null,
  };
}

export function Notifications({ onFixAsset }: NotificationsProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const [activeTab, setActiveTab] = useState<PopoverTab>('notifications');
  const [activePriceAlerts, setActivePriceAlerts] = useState<ActivePriceAlert[]>([]);
  const [historyEvents, setHistoryEvents] = useState<TriggeredNotification[]>([]);
  const [loadingSubtab, setLoadingSubtab] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  const seenTriggeredRef = useRef<Set<number>>(new Set());
  const firstPollDoneRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('notifications');
    }
  }, [isOpen]);

  const fetchActivePriceAlerts = useCallback(async () => {
    setLoadingSubtab(true);
    try {
      const data = await apiCall<ActivePriceAlertsResponse>('/api/price-alerts');
      if (data.status === 'Sucesso' && Array.isArray(data.alerts)) {
        setActivePriceAlerts(data.alerts);
      }
    } catch (err) {
      console.error('Erro ao buscar alertas ativos:', err);
    } finally {
      setLoadingSubtab(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingSubtab(true);
    try {
      const data = await apiCall<HistoryResponse>('/api/price-alerts/history');
      if (data.status === 'Sucesso' && Array.isArray(data.events)) {
        setHistoryEvents(data.events);
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de alertas:', err);
    } finally {
      setLoadingSubtab(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'active') fetchActivePriceAlerts();
    if (activeTab === 'history') fetchHistory();
  }, [isOpen, activeTab, fetchActivePriceAlerts, fetchHistory]);

  const fetchAlerts = useCallback(async () => {
    try {
      const [alertsData, triggeredRes] = await Promise.all([
        apiCall<AlertItem[] | AlertsResponse>('/api/alerts'),
        apiCall<{ status: string; notifications: TriggeredNotification[] }>('/api/price-alerts/notifications'),
      ]);

      const alertItems = Array.isArray(alertsData) ? alertsData : (alertsData?.items ?? []);
      if (!Array.isArray(alertsData)) {
        setDismissedCount(alertsData?.dismissed_count ?? 0);
        setTelegramConfigured(Boolean(alertsData?.telegram_configured));
      }

      const rawTriggered =
        triggeredRes?.status === 'Sucesso' && Array.isArray(triggeredRes.notifications)
          ? triggeredRes.notifications
          : [];

      const mappedTriggered = rawTriggered.map(mapTriggeredToAlert);

      // Dispara Toast em tempo real apenas quando um TriggeredAlert novo surge durante a sessão
      rawTriggered.forEach((n) => {
        if (!seenTriggeredRef.current.has(n.id)) {
          seenTriggeredRef.current.add(n.id);
          if (firstPollDoneRef.current) {
            const item = mapTriggeredToAlert(n);
            const toastType = item.type === 'PROVENTO' ? 'success' : 'info';
            notify(`[${n.ticker}] ${item.message}`, toastType);
          }
        }
      });
      firstPollDoneRef.current = true;

      const combined = [...mappedTriggered, ...alertItems];
      combined.sort((a, b) => b.severity - a.severity);
      setAlerts(combined);
      setHasError(false);
    } catch (error) {
      console.error('Falha ao buscar alertas:', error);
      setHasError(true);
    }
  }, [notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAlerts();
    }, 3000);

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchAlerts();
    }, 120000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchAlerts]);

  const handleDismissOne = async (alert: AlertItem) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    if (!alert.triggered_id) {
      setDismissedCount((c) => c + 1);
    }
    try {
      await apiCall('/api/alerts/dismiss', {
        method: 'POST',
        body: JSON.stringify({ id: alert.id }),
      });
    } catch (err) {
      console.error('Erro ao dispensar notificação:', err);
    }
  };

  const handleMarkAllRead = async () => {
    const prevAlerts = alerts;
    setAlerts([]);
    try {
      await apiCall('/api/alerts/dismiss', {
        method: 'POST',
        body: JSON.stringify({ all: true }),
      });
      setDismissedCount((c) => c + prevAlerts.filter((a) => !a.triggered_id).length);
      notify('Notificações marcadas como lidas.', 'success');
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
      setAlerts(prevAlerts);
    }
  };

  const handleRestoreDismissed = async () => {
    try {
      await apiCall('/api/alerts/dismiss', {
        method: 'POST',
        body: JSON.stringify({ restore: true }),
      });
      setDismissedCount(0);
      await fetchAlerts();
      notify('Alertas silenciados restaurados.', 'info');
    } catch (err) {
      console.error('Erro ao restaurar alertas:', err);
    }
  };

  const handleDeletePriceAlert = async (alertId: number) => {
    try {
      const data = await apiCall<{ status: string }>('/api/price-alerts/' + alertId, {
        method: 'DELETE',
      });
      if (data.status === 'Sucesso') {
        setActivePriceAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
      }
    } catch (err) {
      console.error('Erro ao deletar alerta ativo:', err);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await apiCall<{ status: string; msg?: string }>('/api/alerts/test-telegram', {
        method: 'POST',
      });
      if (res.status === 'Sucesso') {
        notify(res.msg || 'Mensagem de teste enviada ao Telegram!', 'success');
      } else {
        notify(res.msg || 'Não foi possível enviar no Telegram.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao testar Telegram.', 'error');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleAlertAction = (alert: AlertItem) => {
    setIsOpen(false);
    if (alert.action === 'agenda') {
      router.push('/agenda');
      return;
    }
    if (alert.action === 'valuation') {
      router.push('/valuation');
      return;
    }
    if (alert.asset_id > 0) {
      onFixAsset(alert.asset_id);
    }
  };

  const getSeverityStyles = (severity: number, type: string) => {
    if (type === 'SINAL') {
      return {
        icon: <Zap size={17} className="text-purple-400" />,
        borderClass: 'border-purple-500/40 bg-purple-500/5',
        hoverClass: 'hover:bg-purple-500/10',
      };
    }
    if (type === 'PROVENTO') {
      return {
        icon: <Coins size={17} className="text-status-success" />,
        borderClass: 'border-emerald-500/40 bg-emerald-500/5',
        hoverClass: 'hover:bg-emerald-500/10',
      };
    }
    if (severity === 5) {
      return {
        icon: <AlertOctagon size={17} className="text-status-error" />,
        borderClass: 'border-red-500/50 bg-red-500/5',
        hoverClass: 'hover:bg-red-500/10',
      };
    }
    if (severity === 4) {
      return {
        icon: <AlertTriangle size={17} className="text-status-warning" />,
        borderClass: 'border-amber-500/40 bg-amber-500/5',
        hoverClass: 'hover:bg-amber-500/10',
      };
    }
    if (type === 'CONFIG') {
      return {
        icon: <Settings size={17} className="text-accent" />,
        borderClass: 'border-blue-400/40 bg-blue-500/5',
        hoverClass: 'hover:bg-blue-500/10',
      };
    }
    if (type === 'OPORTUNIDADE') {
      return {
        icon: <RefreshCw size={17} className="text-status-success" />,
        borderClass: 'border-emerald-400/40 bg-emerald-500/5',
        hoverClass: 'hover:bg-emerald-500/10',
      };
    }
    if (type === 'NOVIDADE') {
      return {
        icon: <FileText size={17} className="text-purple-400" />,
        borderClass: 'border-purple-400/40 bg-purple-500/5',
        hoverClass: 'hover:bg-purple-500/10',
      };
    }
    return {
      icon: <Info size={17} className="text-text-muted" />,
      borderClass: 'border-border-subtle bg-surface',
      hoverClass: 'hover:bg-surface-elevated',
    };
  };

  return (
    <div className="relative select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Central de Notificações"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`p-2 rounded-lg transition-all border relative group ${
          isOpen
            ? 'bg-surface-elevated border-accent/50 text-text-primary shadow-[0_0_15px_rgba(59,130,246,0.15)]'
            : 'bg-surface-card hover:bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle'
        }`}
        title="Central de Notificações"
      >
        <Bell
          size={16}
          className={`transition-all duration-300 ${
            alerts.length > 0
              ? 'text-status-warning animate-[wiggle_1s_ease-in-out_infinite]'
              : 'text-text-muted group-hover:text-text-primary'
          }`}
        />

        {alerts.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-status-error border border-surface text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.6)]">
            {alerts.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[0.5px]" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-3 w-96 max-w-[92vw] origin-top-right bg-surface-card border border-border-subtle rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.65)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header + Tabs */}
            <div className="px-3.5 pt-3 pb-2 border-b border-border-subtle bg-surface-elevated/70 space-y-2.5">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Bell size={13} className="text-accent" />
                  Central de Notificações
                </h3>
                <div className="flex items-center gap-1.5">
                  {activeTab === 'notifications' && alerts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-status-success bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                      title="Marcar todas como lidas"
                    >
                      <CheckCheck size={12} /> Ler todas
                    </button>
                  )}
                  {activeTab === 'notifications' && dismissedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRestoreDismissed}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text-primary bg-surface border border-border-subtle transition-colors"
                      title={`Reexibir ${dismissedCount} silenciada(s)`}
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-surface p-1 rounded-xl border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setActiveTab('notifications')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                    activeTab === 'notifications'
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Novas ({alerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('active')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                    activeTab === 'active'
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Alertas Ativos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'history'
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <History size={11} /> Histórico
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[24rem] overflow-y-auto p-2.5 space-y-2 bg-surface/40 scrollbar-thin">
              {activeTab === 'active' ? (
                <div className="space-y-3">
                  {/* Status do Canal Telegram */}
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface border border-border-subtle">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-primary block">
                        Telegram Bot
                      </span>
                      <span className="text-[10px] text-text-muted block truncate">
                        {telegramConfigured
                          ? 'Conectado via .env (preço, sinal e proventos)'
                          : 'Desativado — configure TELEGRAM_BOT_TOKEN e CHAT_ID'}
                      </span>
                    </div>
                    {telegramConfigured && (
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={testingTelegram}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-accent-soft text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50 transition-colors"
                      >
                        <Send size={11} /> {testingTelegram ? 'Enviando...' : 'Testar'}
                      </button>
                    )}
                  </div>

                  {loadingSubtab ? (
                    <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-accent" />
                      <p className="text-[10px]">Carregando alertas ativos...</p>
                    </div>
                  ) : activePriceAlerts.length === 0 ? (
                    <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
                      <Bell size={18} className="opacity-30" />
                      <p className="text-[10px]">Nenhum alerta de preço configurado.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activePriceAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className="flex items-center justify-between p-2.5 bg-surface rounded-xl border border-border-subtle hover:border-accent/40 transition-all gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-text-primary text-xs">{alert.ticker}</span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  alert.condition === 'ABOVE'
                                    ? 'bg-emerald-500/10 text-status-success border-emerald-500/20'
                                    : 'bg-red-500/10 text-status-error border-red-500/20'
                                }`}
                              >
                                {alert.condition === 'ABOVE' ? 'Acima ▲' : 'Abaixo ▼'}
                              </span>
                              <span className="text-xs font-mono font-bold text-accent">
                                R$ {Number(alert.target_price).toFixed(2)}
                              </span>
                            </div>
                            {alert.note && (
                              <p className="text-[10px] text-text-muted truncate mt-0.5">{alert.note}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeletePriceAlert(alert.id)}
                            className="p-1.5 bg-surface-elevated hover:bg-red-500/15 text-text-muted hover:text-status-error rounded-md border border-border-subtle transition-all shrink-0"
                            title="Excluir Alerta"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === 'history' ? (
                loadingSubtab ? (
                  <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
                    <RefreshCw size={18} className="animate-spin text-accent" />
                    <p className="text-[10px]">Carregando histórico...</p>
                  </div>
                ) : historyEvents.length === 0 ? (
                  <div className="text-center py-8 text-text-muted flex flex-col items-center gap-2">
                    <History size={18} className="opacity-30" />
                    <p className="text-[10px]">Nenhum alerta disparado no histórico ainda.</p>
                  </div>
                ) : (
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
                        <div
                          key={ev.id}
                          className="p-2.5 rounded-xl bg-surface border border-border-subtle space-y-1"
                        >
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
                )
              ) : hasError ? (
                <div className="text-center py-10 text-text-muted flex flex-col items-center justify-center gap-2">
                  <WifiOff size={20} className="opacity-50 text-status-error" />
                  <p className="text-[10px] font-medium">Falha na rede ou servidor instável.</p>
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-10 text-text-muted flex flex-col items-center justify-center gap-3">
                  <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                    <CheckCircle size={22} className="text-status-success" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-text-primary">Tudo em dia</p>
                    <p className="text-[10px] mt-0.5 text-text-muted">
                      Nenhuma notificação pendente no momento.
                    </p>
                  </div>
                </div>
              ) : (
                alerts.map((alert) => {
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
                        {alert.action && (
                          <button
                            type="button"
                            onClick={() => handleAlertAction(alert)}
                            className="p-1 rounded-md text-accent hover:bg-accent-soft transition-colors"
                            title="Abrir detalhes"
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissOne(alert)}
                          className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
                          title="Marcar como lida"
                          aria-label={`Dispensar alerta de ${alert.ticker}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes wiggle {
          0% { transform: rotate(0); }
          15% { transform: rotate(8deg); }
          30% { transform: rotate(-8deg); }
          45% { transform: rotate(4deg); }
          60% { transform: rotate(-4deg); }
          75% { transform: rotate(2deg); }
          90% { transform: rotate(-2deg); }
          100% { transform: rotate(0); }
        }
      `}</style>
    </div>
  );
}
