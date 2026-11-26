'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, History, RotateCcw } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import {
  ActivePriceAlert,
  ActivePriceAlertsResponse,
  AlertItem,
  AlertsResponse,
  HistoryResponse,
  mapTriggeredToAlert,
  PopoverTab,
  TelegramStatusResponse,
  TriggeredNotification,
} from './notifications/types';
import { ActiveAlertsAndTelegramTab } from './notifications/ActiveAlertsAndTelegramTab';
import { NotificationsHistoryTab, NotificationsListTab } from './notifications/NotificationsHistoryTab';

export function Notifications({ onFixAsset }: { onFixAsset: (assetId: number) => void }) {
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
  const [showTelegramForm, setShowTelegramForm] = useState(false);
  const [tgTokenInput, setTgTokenInput] = useState('');
  const [tgChatIdInput, setTgChatIdInput] = useState('');
  const [tgMasked, setTgMasked] = useState('');
  const [savingTelegram, setSavingTelegram] = useState(false);

  const seenTriggeredRef = useRef<Set<number>>(new Set());
  const firstPollDoneRef = useRef(false);

  useEffect(() => {
    if (!isOpen) setActiveTab('notifications');
  }, [isOpen]);

  const fetchActivePriceAlerts = useCallback(async () => {
    setLoadingSubtab(true);
    try {
      const [data, tgData] = await Promise.all([
        apiCall<ActivePriceAlertsResponse>('/api/price-alerts'),
        apiCall<TelegramStatusResponse>('/api/alerts/telegram-config'),
      ]);
      if (data.status === 'Sucesso' && Array.isArray(data.alerts)) {
        setActivePriceAlerts(data.alerts);
      }
      if (tgData?.status === 'Sucesso') {
        setTelegramConfigured(Boolean(tgData.configured));
        setTgMasked(tgData.bot_token_masked || '');
        if (tgData.chat_id) setTgChatIdInput(tgData.chat_id);
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

      rawTriggered.forEach((n) => {
        if (!seenTriggeredRef.current.has(n.id)) {
          seenTriggeredRef.current.add(n.id);
          if (firstPollDoneRef.current) {
            const item = mapTriggeredToAlert(n);
            notify(`[${n.ticker}] ${item.message}`, item.type === 'PROVENTO' ? 'success' : 'info');
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
    const timer = setTimeout(() => fetchAlerts(), 3000);
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
    if (!alert.triggered_id) setDismissedCount((c) => c + 1);
    try {
      await apiCall('/api/alerts/dismiss', { method: 'POST', body: JSON.stringify({ id: alert.id }) });
    } catch (err) {
      console.error('Erro ao dispensar notificação:', err);
    }
  };

  const handleMarkAllRead = async () => {
    const prevAlerts = alerts;
    setAlerts([]);
    try {
      await apiCall('/api/alerts/dismiss', { method: 'POST', body: JSON.stringify({ all: true }) });
      setDismissedCount((c) => c + prevAlerts.filter((a) => !a.triggered_id).length);
      notify('Notificações marcadas como lidas.', 'success');
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
      setAlerts(prevAlerts);
    }
  };

  const handleRestoreDismissed = async () => {
    try {
      await apiCall('/api/alerts/dismiss', { method: 'POST', body: JSON.stringify({ restore: true }) });
      setDismissedCount(0);
      await fetchAlerts();
      notify('Alertas silenciados restaurados.', 'info');
    } catch (err) {
      console.error('Erro ao restaurar alertas:', err);
    }
  };

  const handleDeletePriceAlert = async (alertId: number) => {
    try {
      const data = await apiCall<{ status: string }>(`/api/price-alerts/${alertId}`, { method: 'DELETE' });
      if (data.status === 'Sucesso') {
        setActivePriceAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (err) {
      console.error('Erro ao deletar alerta ativo:', err);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTelegram(true);
    try {
      const res = await apiCall<TelegramStatusResponse>('/api/alerts/telegram-config', {
        method: 'POST',
        body: JSON.stringify({ bot_token: tgTokenInput, chat_id: tgChatIdInput }),
      });
      if (res.status === 'Sucesso') {
        setTelegramConfigured(Boolean(res.configured));
        setTgMasked(res.bot_token_masked || '');
        setTgTokenInput('');
        setShowTelegramForm(false);
        notify(res.msg || 'Telegram configurado com sucesso!', 'success');
      } else {
        notify(res.msg || 'Não foi possível salvar.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao salvar configuração.', 'error');
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleClearTelegram = async () => {
    setSavingTelegram(true);
    try {
      const res = await apiCall<TelegramStatusResponse>('/api/alerts/telegram-config', {
        method: 'POST',
        body: JSON.stringify({ clear: true }),
      });
      setTelegramConfigured(Boolean(res.configured));
      setTgMasked(res.bot_token_masked || '');
      setTgTokenInput('');
      setTgChatIdInput('');
      setShowTelegramForm(false);
      notify(res.msg || 'Configuração removida.', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao remover configuração.', 'error');
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await apiCall<{ status: string; msg?: string }>('/api/alerts/test-telegram', { method: 'POST' });
      if (res.status === 'Sucesso') notify(res.msg || 'Mensagem de teste enviada ao Telegram!', 'success');
      else notify(res.msg || 'Não foi possível enviar no Telegram.', 'error');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao testar Telegram.', 'error');
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleAlertAction = (alert: AlertItem) => {
    setIsOpen(false);
    if (alert.link) {
      window.open(alert.link, '_blank', 'noopener,noreferrer');
      return;
    }
    if (alert.action === 'agenda') {
      router.push('/agenda');
      return;
    }
    if (alert.action === 'valuation') {
      if (alert.asset_id > 0) onFixAsset(alert.asset_id);
      else router.push('/avancado');
      return;
    }
    if (alert.asset_id > 0) onFixAsset(alert.asset_id);
  };

  return (
    <div className="relative select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Central de Notificações"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors border relative group ${
          isOpen
            ? 'bg-surface-elevated border-accent/50 text-text-primary'
            : 'bg-surface-card hover:bg-surface-elevated text-text-muted hover:text-text-primary border-border-subtle'
        }`}
        title="Central de Notificações"
      >
        <Bell
          size={16}
          className={`transition-all duration-300 ${
            alerts.length > 0 ? 'text-status-warning animate-[wiggle_1s_ease-in-out_infinite]' : 'text-text-muted group-hover:text-text-primary'
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
                    activeTab === 'notifications' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Novas ({alerts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('active')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                    activeTab === 'active' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Alertas Ativos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`py-1 px-2 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 ${
                    activeTab === 'history' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  <History size={11} /> Histórico
                </button>
              </div>
            </div>

            <div className="max-h-[24rem] overflow-y-auto p-2.5 space-y-2 bg-surface/40 scrollbar-thin">
              {activeTab === 'active' ? (
                <ActiveAlertsAndTelegramTab
                  telegramConfigured={telegramConfigured}
                  tgMasked={tgMasked}
                  showTelegramForm={showTelegramForm}
                  tgTokenInput={tgTokenInput}
                  tgChatIdInput={tgChatIdInput}
                  testingTelegram={testingTelegram}
                  savingTelegram={savingTelegram}
                  loadingSubtab={loadingSubtab}
                  activePriceAlerts={activePriceAlerts}
                  onToggleTelegramForm={() => setShowTelegramForm((v) => !v)}
                  onChangeTgToken={setTgTokenInput}
                  onChangeTgChatId={setTgChatIdInput}
                  onTestTelegram={handleTestTelegram}
                  onSaveTelegram={handleSaveTelegram}
                  onClearTelegram={handleClearTelegram}
                  onDeletePriceAlert={handleDeletePriceAlert}
                />
              ) : activeTab === 'history' ? (
                <NotificationsHistoryTab loadingSubtab={loadingSubtab} historyEvents={historyEvents} />
              ) : (
                <NotificationsListTab
                  hasError={hasError}
                  alerts={alerts}
                  onAction={handleAlertAction}
                  onDismissOne={handleDismissOne}
                />
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
