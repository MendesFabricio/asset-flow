'use client';

import React from 'react';
import { Bell, RefreshCw, Send, Trash2 } from 'lucide-react';
import { ActivePriceAlert } from './types';

interface ActiveAlertsAndTelegramTabProps {
  telegramConfigured: boolean;
  tgMasked: string;
  showTelegramForm: boolean;
  tgTokenInput: string;
  tgChatIdInput: string;
  testingTelegram: boolean;
  savingTelegram: boolean;
  loadingSubtab: boolean;
  activePriceAlerts: ActivePriceAlert[];
  onToggleTelegramForm: () => void;
  onChangeTgToken: (val: string) => void;
  onChangeTgChatId: (val: string) => void;
  onTestTelegram: () => void;
  onSaveTelegram: (e: React.FormEvent) => void;
  onClearTelegram: () => void;
  onDeletePriceAlert: (id: number) => void;
}

export function ActiveAlertsAndTelegramTab({
  telegramConfigured,
  tgMasked,
  showTelegramForm,
  tgTokenInput,
  tgChatIdInput,
  testingTelegram,
  savingTelegram,
  loadingSubtab,
  activePriceAlerts,
  onToggleTelegramForm,
  onChangeTgToken,
  onChangeTgChatId,
  onTestTelegram,
  onSaveTelegram,
  onClearTelegram,
  onDeletePriceAlert,
}: ActiveAlertsAndTelegramTabProps) {
  return (
    <div className="space-y-3">
      <div className="p-2.5 rounded-xl bg-surface border border-border-subtle space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-primary block">Telegram Bot</span>
            <span className="text-[10px] text-text-muted block truncate">
              {telegramConfigured
                ? `Conectado (${tgMasked || 'ativo'})`
                : 'Desativado — configure aqui para receber no celular'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTelegramForm}
              className="px-2 py-1 rounded-lg text-[10px] font-bold bg-surface-elevated text-text-primary border border-border-subtle hover:border-accent/50 transition-colors"
            >
              {showTelegramForm ? 'Fechar' : 'Configurar'}
            </button>
            {telegramConfigured && (
              <button
                type="button"
                onClick={onTestTelegram}
                disabled={testingTelegram}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-accent-soft text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50 transition-colors"
              >
                <Send size={11} /> {testingTelegram ? '...' : 'Testar'}
              </button>
            )}
          </div>
        </div>

        {showTelegramForm && (
          <form onSubmit={onSaveTelegram} className="space-y-2 pt-2 border-t border-border-subtle">
            <p className="text-[10px] text-text-muted leading-snug">
              Crie um bot no <span className="font-mono text-text-primary">@BotFather</span> e pegue seu ID no{' '}
              <span className="font-mono text-text-primary">@userinfobot</span>.
            </p>
            <input
              type="password"
              placeholder={tgMasked ? `Bot Token atual: ${tgMasked}` : 'Bot Token (ex: 123456:ABC...)'}
              value={tgTokenInput}
              onChange={(e) => onChangeTgToken(e.target.value)}
              required
              className="w-full bg-surface-input border border-border-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              placeholder="Chat ID (ex: 123456789)"
              value={tgChatIdInput}
              onChange={(e) => onChangeTgChatId(e.target.value)}
              required
              className="w-full bg-surface-input border border-border-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            <div className="flex items-center justify-between gap-2">
              {telegramConfigured ? (
                <button
                  type="button"
                  onClick={onClearTelegram}
                  disabled={savingTelegram}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold text-status-error hover:bg-red-500/10 transition-colors"
                >
                  Remover
                </button>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={savingTelegram}
                className="px-3 py-1 rounded-lg text-[10px] font-bold bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingTelegram ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
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
                {alert.note && <p className="text-[10px] text-text-muted truncate mt-0.5">{alert.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDeletePriceAlert(alert.id)}
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
  );
}
