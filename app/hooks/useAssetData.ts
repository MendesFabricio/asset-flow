'use client';

import { useState, useEffect, useRef } from 'react';
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
    refreshInterval: 60000,
    revalidateOnFocus: true
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

  const mutateDashboardRef = useRef(mutateDashboard);
  mutateDashboardRef.current = mutateDashboard;

  useEffect(() => {
    // Estabelece canal SSE de streaming de progresso em tempo real com o backend
    const eventSource = new EventSource('/api/sync/stream');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        // Verifica se houve atualização de CVM Sync
        if (payload.cvm_sync) {
          setSyncStatus((prev) => {
            const next = payload.cvm_sync;
            // Se transitou de processando para sucesso, invalida e revalida os dados da carteira
            if (prev.status === 'processing' && next.status === 'success') {
              mutateDashboardRef.current();
            }
            return next;
          });
        }

        // Verifica se houve atualização de Yahoo Fundamentals Sync
        if (payload.yahoo_sync) {
          setFundamentalsStatus((prev) => {
            const next = payload.yahoo_sync;
            // Se transitou de processando para sucesso, invalida e revalida os dados da carteira
            if (prev.status === 'processing' && next.status === 'success') {
              mutateDashboardRef.current();
            }
            return next;
          });
        }
      } catch (err) {
        console.error('❌ [SSE] Erro ao processar dados de stream de progresso:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('⚠️ [SSE] Erro de rede ou desconexão no canal de telemetria de progresso.');
    };

    return () => {
      // 🔒 Fechamento gracioso de socket ao desmontar hook
      eventSource.close();
    };
  }, []);

  const refreshAll = async () => {
    await fetch('/api/index?force=true');
    mutateDashboard();
  };

  // Funções stub mantidas para compatibilidade com o resto do sistema
  const mutateSync = (newData?: any, options?: any) => {
    if (newData) setSyncStatus(newData);
    mutateDashboard();
  };
  const mutateFundamentals = (newData?: any, options?: any) => {
    if (newData) setFundamentalsStatus(newData);
    mutateDashboard();
  };

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
