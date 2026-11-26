import { ValuationAssetData } from '@/types';

export type StrategyMode = 'quality' | 'dividends' | 'bargain' | 'magic' | 'fiis' | 'watchlist' | 'signals';

export interface RadarResponse {
  status: string;
  total_cached: number;
  sectors: string[];
  sync_state: { status: string; message: string };
  items: ValuationAssetData[];
}

export const STRATEGIES: Array<{ id: StrategyMode; label: string; hint: string }> = [
  { id: 'quality', label: 'Melhor Qualidade', hint: 'Checklist & saúde' },
  { id: 'dividends', label: 'Radar Dividendos', hint: 'Bazin & DY' },
  { id: 'bargain', label: 'Barganha / Graham', hint: 'Maior desconto' },
  { id: 'magic', label: 'Fórmula Mágica', hint: 'EV/EBITDA + ROIC' },
  { id: 'fiis', label: 'Radar FIIs', hint: 'P/VP & DY' },
  { id: 'watchlist', label: 'Minha Watchlist', hint: 'Alvos salvos' },
  { id: 'signals', label: 'Livro de Sinais', hint: 'Backtest & alertas' },
];
