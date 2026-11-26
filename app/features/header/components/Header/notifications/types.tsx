import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Coins,
  FileText,
  Info,
  RefreshCw,
  Settings,
  Zap,
} from 'lucide-react';

export interface AlertItem {
  id: string;
  triggered_id?: number;
  asset_id: number;
  ticker: string;
  type: string;
  message: string;
  field: string;
  severity: number;
  action: 'edit' | 'sync' | 'view' | 'refresh' | 'agenda' | 'valuation' | null;
  link?: string | null;
}

export interface TriggeredNotification {
  id: number;
  asset_id: number | null;
  event_type?: 'PRICE_ALERT' | 'SIGNAL_CHANGE' | 'DIVIDEND_ANNOUNCED' | string;
  ticker: string;
  condition: 'ABOVE' | 'BELOW' | 'SIGNAL_CHANGE' | 'DIVIDEND_ANNOUNCED' | string;
  target_price: number;
  current_price: number;
  note: string;
  link?: string | null;
  is_notified?: boolean;
  triggered_at: string;
}

export interface ActivePriceAlert {
  id: number;
  ticker: string;
  target_price: number;
  condition: 'ABOVE' | 'BELOW';
  note: string;
  created_at: string;
}

export interface AlertsResponse {
  items?: AlertItem[];
  total?: number;
  dismissed_count?: number;
  telegram_configured?: boolean;
}

export interface ActivePriceAlertsResponse {
  status: string;
  alerts: ActivePriceAlert[];
}

export interface HistoryResponse {
  status: string;
  events?: TriggeredNotification[];
}

export interface TelegramStatusResponse {
  status: string;
  configured: boolean;
  bot_token_masked?: string;
  chat_id?: string;
  source?: string;
  msg?: string;
}

export type PopoverTab = 'notifications' | 'active' | 'history';

export function mapTriggeredToAlert(n: TriggeredNotification): AlertItem {
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

  if (evType === 'CORPORATE_EVENT' || n.condition === 'EMISSION_ANNOUNCED' || n.condition === 'CORP_EVENT_ANNOUNCED') {
    return {
      id: `triggered-${n.id}`,
      triggered_id: n.id,
      asset_id: n.asset_id ?? 0,
      ticker: n.ticker,
      type: n.condition === 'EMISSION_ANNOUNCED' ? 'EMISSÃO' : 'EVENTO',
      message: n.note || `Novo evento corporativo anunciado para ${n.ticker}`,
      field: 'corporate_event',
      severity: 4,
      action: 'view',
      link: n.link ?? null,
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

export function getSeverityStyles(severity: number, type: string): {
  icon: React.ReactNode;
  borderClass: string;
  hoverClass: string;
} {
  if (type === 'SINAL') {
    return { icon: <Zap size={17} className="text-purple-400" />, borderClass: 'border-purple-500/40 bg-purple-500/5', hoverClass: 'hover:bg-purple-500/10' };
  }
  if (type === 'PROVENTO') {
    return { icon: <Coins size={17} className="text-status-success" />, borderClass: 'border-emerald-500/40 bg-emerald-500/5', hoverClass: 'hover:bg-emerald-500/10' };
  }
  if (type === 'EMISSÃO' || type === 'EVENTO') {
    return { icon: <FileText size={17} className="text-accent" />, borderClass: 'border-blue-500/40 bg-blue-500/5', hoverClass: 'hover:bg-blue-500/10' };
  }
  if (severity === 5) {
    return { icon: <AlertOctagon size={17} className="text-status-error" />, borderClass: 'border-red-500/50 bg-red-500/5', hoverClass: 'hover:bg-red-500/10' };
  }
  if (severity === 4) {
    return { icon: <AlertTriangle size={17} className="text-status-warning" />, borderClass: 'border-amber-500/40 bg-amber-500/5', hoverClass: 'hover:bg-amber-500/10' };
  }
  if (type === 'CONFIG') {
    return { icon: <Settings size={17} className="text-accent" />, borderClass: 'border-blue-400/40 bg-blue-500/5', hoverClass: 'hover:bg-blue-500/10' };
  }
  if (type === 'OPORTUNIDADE') {
    return { icon: <RefreshCw size={17} className="text-status-success" />, borderClass: 'border-emerald-400/40 bg-emerald-500/5', hoverClass: 'hover:bg-emerald-500/10' };
  }
  if (type === 'NOVIDADE') {
    return { icon: <FileText size={17} className="text-purple-400" />, borderClass: 'border-purple-400/40 bg-purple-500/5', hoverClass: 'hover:bg-purple-500/10' };
  }
  return { icon: <Info size={17} className="text-text-muted" />, borderClass: 'border-border-subtle bg-surface', hoverClass: 'hover:bg-surface-elevated' };
}
