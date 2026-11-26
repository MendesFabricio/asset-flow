'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coffee, RefreshCw, AlertCircle, Calendar, Wallet, BellRing, TrendingUp } from 'lucide-react';
import { apiCall } from '@/lib/api';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatMoney } from '@/lib/format';

interface IndexQuote {
  price?: number;
  change?: number;
  pct?: number;
}

interface IndicesResponse {
  ibov?: IndexQuote;
  ifix?: IndexQuote;
  dolar?: IndexQuote;
  selic?: number;
  cdi?: number;
}

interface CalendarEvent {
  ticker?: string;
  date_com?: string;
  date_payment?: string;
  total?: number;
  total_value?: number;
  value_per_share?: number;
  type?: string;
}

interface CashBridgeResponse {
  status: string;
  net_free_cash_30d?: number;
  components?: {
    dividends_30d?: number;
    receivables_30d?: number;
  };
}

interface TriggeredNotification {
  id: number;
  ticker: string;
  note?: string;
  event_type?: string;
}

export function MorningBriefing() {
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const [indices, setIndices] = useState<IndicesResponse | null>(null);
  const [upcomingDataCom, setUpcomingDataCom] = useState<CalendarEvent[]>([]);
  const [cashBridge, setCashBridge] = useState<CashBridgeResponse | null>(null);
  const [alerts, setAlerts] = useState<TriggeredNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const money = (v: number) => (isHidden ? 'R$ •••••' : formatMoney(v));

  const loadBrief = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [idxRes, calRes, cashRes, notifRes] = await Promise.allSettled([
        apiCall<IndicesResponse>('/api/market/indices', { signal }),
        apiCall<CalendarEvent[] | { agenda?: CalendarEvent[]; calendar?: CalendarEvent[] }>('/api/calendar', { signal }),
        apiCall<CashBridgeResponse>('/api/cashflow/free-cash-bridge?window_days=30', { signal }),
        apiCall<{ notifications?: TriggeredNotification[] }>('/api/price-alerts/notifications', { signal }),
      ]);

      if (signal?.aborted) return;

      if (idxRes.status === 'fulfilled') setIndices(idxRes.value);
      if (calRes.status === 'fulfilled') {
        const raw = calRes.value;
        const list = Array.isArray(raw) ? raw : raw?.agenda || raw?.calendar || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in7d = new Date(today.getTime() + 7 * 86400000);
        const filtered = list
          .filter((ev) => {
            if (!ev.date_com) return false;
            const d = new Date(`${ev.date_com}T00:00:00`);
            return d >= today && d <= in7d;
          })
          .sort((a, b) => String(a.date_com || '').localeCompare(String(b.date_com || '')))
          .slice(0, 8);
        setUpcomingDataCom(filtered);
      }
      if (cashRes.status === 'fulfilled') setCashBridge(cashRes.value);
      if (notifRes.status === 'fulfilled') setAlerts((notifRes.value.notifications || []).slice(0, 4));
      if (idxRes.status === 'rejected' && calRes.status === 'rejected') {
        setError('Não foi possível carregar o resumo diário determinístico.');
      }
    } catch (e: unknown) {
      if (signal?.aborted || (e instanceof Error && (e.name === 'AbortError' || e.message.includes('AbortError')))) return;
      setError('Falha ao carregar o resumo diário.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadBrief(controller.signal);
    return () => controller.abort();
  }, [loadBrief]);

  if (loading) {
    return (
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 animate-pulse h-[420px]">
        <div className="h-5 bg-surface-elevated rounded w-44 mb-4" />
        <div className="space-y-3">
          <div className="h-16 bg-surface-elevated rounded-xl" />
          <div className="h-24 bg-surface-elevated rounded-xl" />
          <div className="h-24 bg-surface-elevated rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-card border border-red-500/30 rounded-2xl p-4 flex justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-xs font-medium">{error}</span>
        </div>
        <button
          onClick={() => loadBrief()}
          className="text-text-secondary hover:text-text-primary min-h-9 min-w-9 flex items-center justify-center rounded-lg hover:bg-surface-elevated transition-colors active:scale-[0.97]"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-xl h-[650px] overflow-y-auto flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20 text-blue-400">
            <Coffee size={16} />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-primary">
              Briefing Determinístico
            </h3>
            <p className="text-[10px] text-text-muted">Macro, Data-Com 7d, Fatos & Caixa Livre</p>
          </div>
        </div>
        <button
          onClick={() => loadBrief()}
          title="Atualizar dados"
          className="min-h-9 min-w-9 flex items-center justify-center rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors active:scale-[0.97]"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Macro Strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2.5">
          <div className="text-[10px] text-text-muted uppercase">IBOV</div>
          <div className="text-xs font-mono font-bold text-text-primary">
            {indices?.ibov?.price ? indices.ibov.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
          </div>
        </div>
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2.5">
          <div className="text-[10px] text-text-muted uppercase">IFIX</div>
          <div className="text-xs font-mono font-bold text-text-primary">
            {indices?.ifix?.price ? indices.ifix.price.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
          </div>
        </div>
        <div className="bg-surface-elevated border border-border-subtle rounded-xl p-2.5">
          <div className="text-[10px] text-text-muted uppercase">Dólar / Selic</div>
          <div className="text-xs font-mono font-bold text-emerald-400">
            {indices?.dolar?.price ? `R$ ${Number(indices.dolar.price).toFixed(2)}` : '—'}
            {typeof indices?.selic === 'number' ? ` · ${indices.selic.toFixed(2)}%` : ''}
          </div>
        </div>
      </div>

      {/* Caixa Livre 30d */}
      <div className="bg-surface-elevated border border-border-subtle rounded-xl p-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
            <Wallet size={13} className="text-emerald-400" />
            Caixa Livre Projetado (30d)
          </span>
          <span className="text-sm font-mono font-extrabold text-emerald-400">
            {money(cashBridge?.net_free_cash_30d || 0)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span>Proventos provisionados: {money(cashBridge?.components?.dividends_30d || 0)}</span>
          <span>Recebíveis: {money(cashBridge?.components?.receivables_30d || 0)}</span>
        </div>
      </div>

      {/* Data-Com Próximos 7 Dias */}
      <div className="bg-surface-elevated border border-border-subtle rounded-xl p-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Calendar size={13} className="text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            Data-Com nos Próximos 7 Dias
          </span>
        </div>
        {upcomingDataCom.length === 0 ? (
          <p className="text-xs text-text-muted">Nenhuma Data-Com prevista nos próximos 7 dias.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcomingDataCom.map((ev, i) => (
              <li key={`${ev.ticker}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-text-primary">{ev.ticker}</span>
                  <span className="text-text-muted text-[11px]">{ev.date_com}</span>
                </div>
                <div className="text-right font-mono shrink-0">
                  <span className="text-emerald-400 font-semibold">{money(ev.total ?? ev.total_value ?? 0)}</span>
                  {ev.value_per_share != null && ev.value_per_share > 0 && (
                    <span className="text-[10px] text-text-muted ml-1.5">
                      ({isHidden ? '••••' : `R$ ${ev.value_per_share.toFixed(4).replace('.', ',')}/un.`})
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Fatos & Alertas Recentes */}
      <div className="bg-surface-elevated border border-border-subtle rounded-xl p-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <BellRing size={13} className="text-amber-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            Alertas & Fatos Recentes
          </span>
        </div>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <TrendingUp size={13} className="text-text-muted" />
            <span>Nenhum alerta pendente no momento.</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((al) => (
              <li key={al.id} className="text-xs text-text-secondary flex items-start gap-2">
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                  {al.ticker}
                </span>
                <span className="line-clamp-2">{al.note || al.event_type || 'Evento disparado'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
