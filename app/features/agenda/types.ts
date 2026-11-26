export interface Evento {
  ticker: string;
  date: string;
  date_com?: string;
  date_payment?: string;
  type?: string;
  quantity?: number;
  total: number;
  status: string;
  value_per_share: number;
  is_estimate: boolean;
}

export type CalendarEvento = Evento & { sourceType: 'past' | 'future' };

export interface AnalyticsItem {
  ticker: string;
  dy_forward: number;
  payout_historico: number | null;
  regularidade_score: number;
  num_quarters: number;
}

export interface YocDividendEvent {
  ticker?: string;
  date: string;
  date_com?: string;
  type?: string;
  dpa: number;
  total: number;
  quantity: number;
  pm_at_moment: number;
  market_price: number;
  yoc_at_moment: number;
  dy_at_moment: number;
}

export interface YocQuality {
  barColor: string;
  label: 'Ótimo' | 'Bom' | 'Moderado' | 'Fraco';
  badgeClass: string;
  spread: number;
  spreadClass: string;
  spreadLabel: string;
}

export interface YocHistoryItem {
  year: number;
  dpa: number;
  total_received?: number;
  yoc: number;
  dy_market?: number;
  pm_at_moment?: number;
  pm_avg_year?: number;
  market_price?: number;
  payments_count?: number;
  events?: YocDividendEvent[];
}

export interface SeasonalityRow {
  year: number;
  [key: string]: number;
}

export type AgendaTab = 'calendar' | 'analytics' | 'yoc' | 'seasonality' | 'extrato' | 'passive';

export function getYocQuality(yoc: number, dy: number): YocQuality {
  const spread = yoc - dy;
  const beatMarket = spread >= -0.05;
  const sign = spread >= 0 ? '+' : '';
  const spreadLabel = beatMarket
    ? `▲ ${sign}${spread.toFixed(2)} p.p. vs DY`
    : `▼ ${spread.toFixed(2)} p.p. vs DY`;
  const spreadClass = beatMarket ? 'text-status-success' : 'text-status-warning';

  if (yoc >= 6 && beatMarket) {
    return {
      barColor: '#10b981',
      label: 'Ótimo',
      badgeClass: 'bg-emerald-500/15 text-status-success border-emerald-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  if (yoc >= 6) {
    return {
      barColor: '#14b8a6',
      label: 'Bom',
      badgeClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  if (yoc >= 4) {
    return {
      barColor: '#f59e0b',
      label: 'Moderado',
      badgeClass: 'bg-amber-500/15 text-status-warning border-amber-500/30',
      spread,
      spreadClass,
      spreadLabel,
    };
  }
  return {
    barColor: '#ef4444',
    label: 'Fraco',
    badgeClass: 'bg-red-500/15 text-status-error border-red-500/30',
    spread,
    spreadClass,
    spreadLabel,
  };
}
