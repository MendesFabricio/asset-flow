'use client';

import { useCallback, useState } from 'react';
import { apiCall } from '@/lib/api';

export interface FearGreedData {
  score?: number;
  label?: string;
  avg_rsi?: number;
  above_sma_pct?: number;
  drawdown_score?: number;
}

export interface QuantReportItem {
  filename: string;
  created_at?: string;
  size_bytes?: number;
}

interface FearGreedApiResponse {
  status: string;
  data?: FearGreedData | null;
}

interface QuantReportsApiResponse {
  status: string;
  reports?: QuantReportItem[];
}

interface GenerateReportApiResponse {
  status: string;
  msg?: string;
}

/**
 * Gerencia o Fear & Greed index e a lista de relatórios gerados,
 * incluindo a geração de um novo relatório.
 */
export function useQuantReports(notify: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const [fearGreedData, setFearGreedData] = useState<FearGreedData | null>(null);
  const [reportsList, setReportsList] = useState<QuantReportItem[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const fetchReportsAndFG = useCallback(() => {
    setLoadingReports(true);
    Promise.all([
      apiCall<FearGreedApiResponse>('/api/quant/fear-greed'),
      apiCall<QuantReportsApiResponse>('/api/quant/reports'),
    ])
      .then(([fg, rep]) => {
        setFearGreedData(fg.status === 'Sucesso' ? fg.data ?? null : null);
        setReportsList(rep.status === 'Sucesso' ? rep.reports || [] : []);
      })
      .catch((err) => {
        console.error(err);
        setFearGreedData(null);
        setReportsList([]);
      })
      .finally(() => setLoadingReports(false));
  }, []);

  const handleGenerateReport = useCallback(() => {
    setGeneratingReport(true);
    apiCall<GenerateReportApiResponse>('/api/quant/generate-report', { method: 'POST' })
      .then((res) => {
        if (res.status === 'Sucesso') {
          fetchReportsAndFG();
        } else {
          notify(res.msg || 'Falha ao gerar relatório.', 'error');
        }
      })
      .catch((err: unknown) => {
        console.error(err);
        notify(err instanceof Error ? err.message : 'Erro ao se conectar ao backend.', 'error');
      })
      .finally(() => setGeneratingReport(false));
  }, [fetchReportsAndFG, notify]);

  return {
    fearGreedData,
    reportsList,
    loadingReports,
    generatingReport,
    fetchReportsAndFG,
    handleGenerateReport,
  };
}
