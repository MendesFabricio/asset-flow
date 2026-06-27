import useSWR from 'swr';
import { DashboardData } from '../types';

interface HistoryDataPoint {
  date: string;
  Patrimônio: number;
  Investido: number;
}

interface SyncStatusResponse {
  status: 'idle' | 'processing' | 'success' | 'error';
  message: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erro API: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  if (data.status === 'Erro') throw new Error(data.msg || 'Erro desconhecido');
  return data;
};

export function useAssetData() {
  const {
    data,
    error: errorDashboard,
    isLoading: loadingDashboard,
    mutate: mutateDashboard
  } = useSWR<DashboardData>('/api/index', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true
  });

  const {
    data: history,
    error: errorHistory,
    isLoading: loadingHistory
  } = useSWR<HistoryDataPoint[]>('/api/history', fetcher);

  const {
    data: syncStatus,
    mutate: mutateSync
  } = useSWR<SyncStatusResponse>('/api/sync-status', fetcher, {
    refreshInterval: (data) => (data?.status === 'processing' ? 3000 : 0),
    revalidateOnFocus: false,
    onSuccess: (data) => {
      if (data?.status === 'success') {
        mutateDashboard();
      }
    }
  });

  const {
    data: fundamentalsStatus,
    mutate: mutateFundamentals
  } = useSWR<SyncStatusResponse>('/api/fundamentals-status', fetcher, {
    refreshInterval: (data) => (data?.status === 'processing' ? 3000 : 0),
    revalidateOnFocus: false,
    onSuccess: (data) => {
      if (data?.status === 'success') {
        mutateDashboard();
      }
    }
  });

  const refreshAll = async () => {
    await fetch('/api/index?force=true');
    mutateDashboard();
  };

  return {
    data,
    history: history || [],
    loading: loadingDashboard || loadingHistory,
    error: errorDashboard ? errorDashboard.message : (errorHistory ? errorHistory.message : null),
    refetch: refreshAll,
    syncStatus: syncStatus || { status: 'idle', message: '' },
    fundamentalsStatus: fundamentalsStatus || { status: 'idle', message: '' },
    mutateSync,
    mutateFundamentals
  };
}
