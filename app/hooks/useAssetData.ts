'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { DashboardData } from '../types';

interface HistoryDataPoint {
  date: string;
  Patrimônio: number;
  Investido: number;
}

interface SyncStatusResponse {
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  total: number;
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
    refreshInterval: 0,
    revalidateOnFocus: false
  });

  const {
    data: history,
    error: errorHistory,
    isLoading: loadingHistory
  } = useSWR<HistoryDataPoint[]>('/api/history', fetcher);

  // Estados locais para controle de sincronização via SSE Streaming
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse>({
    status: 'idle',
    progress: 0,
    total: 0,
    message: ''
  });

  const [fundamentalsStatus, setFundamentalsStatus] = useState<SyncStatusResponse>({
    status: 'idle',
    progress: 0,
    total: 0,
    message: ''
  });


  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: NodeJS.Timeout | null = null;
    const MAX_RETRY_DELAY = 30000;

    const connect = () => {
      eventSource = new EventSource('/api/sync/stream');

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.cvm_sync) {
            setSyncStatus((prev) => {
              const next = payload.cvm_sync;
              if (prev.status === 'processing' && next.status === 'success') {
                mutateDashboard();
              }
              return next;
            });
          }

          if (payload.yahoo_sync) {
            setFundamentalsStatus((prev) => {
              const next = payload.yahoo_sync;
              if (prev.status === 'processing' && next.status === 'success') {
                mutateDashboard();
              }
              return next;
            });
          }
        } catch (err) {
          console.error('❌ [SSE] Erro ao processar dados de stream de progresso:', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        
        const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_RETRY_DELAY);
        retryCount += 1;
        
        console.warn(`⚠️ [SSE] Conexão perdida. Reconectando em ${delay}ms (tentativa ${retryCount})...`);
        
        retryTimer = setTimeout(() => {
          connect();
        }, delay);
      };

      eventSource.onopen = () => {
        retryCount = 0;
      };
    };

    connect();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (eventSource) eventSource.close();
    };
  }, []);

  const refreshAll = async () => {
    await mutateDashboard();
  };

  // Funções stub mantidas para compatibilidade com o resto do sistema
  const mutateSync = useCallback((newData?: any) => {
    if (newData) setSyncStatus(newData);
    mutateDashboard();
  }, [mutateDashboard]);

  const mutateFundamentals = useCallback((newData?: any) => {
    if (newData) setFundamentalsStatus(newData);
    mutateDashboard();
  }, [mutateDashboard]);

  return {
    data,
    history: history || [],
    loading: loadingDashboard || loadingHistory,
    error: errorDashboard ? errorDashboard.message : (errorHistory ? errorHistory.message : null),
    refetch: refreshAll,
    syncStatus,
    fundamentalsStatus,
    mutateSync,
    mutateFundamentals
  };
}
