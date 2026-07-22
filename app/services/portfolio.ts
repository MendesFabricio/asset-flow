import { apiCall } from '@/lib/api';

export interface MonthlyEvolutionData {
  year: number;
  month: number;
  period: string;
  total_invested_cost: number;
  total_market_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  month_variation?: number;
  asset_performance?: {
    gainers: { ticker: string; variation: number }[];
    losers: { ticker: string; variation: number }[];
  } | null;
}

export interface SyncStatus {
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  total: number;
  message: string;
}

export const portfolioService = {
  getMonthlyEvolution: async (): Promise<MonthlyEvolutionData[]> => {
    return apiCall<MonthlyEvolutionData[]>('/api/portfolio/monthly-evolution');
  },
  
  recalculateHistory: async (): Promise<{message: string}> => {
    return apiCall<{message: string}>('/api/portfolio/recalculate-history', {
      method: 'POST'
    });
  },
  
  getHistorySyncStatus: async (): Promise<SyncStatus> => {
    return apiCall<SyncStatus>('/api/portfolio/history-sync-status');
  }
};
