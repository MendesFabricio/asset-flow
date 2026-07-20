'use client';

import { useCallback, useState } from 'react';
import { apiCall } from '@/lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Gerencia o Fear & Greed index e a lista de relatórios gerados,
 * incluindo a geração de um novo relatório.
 */
export function useQuantReports(notify: (msg: string, type?: 'success' | 'error' | 'info') => void) {
  const [fearGreedData, setFearGreedData] = useState<any | null>(null);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);

  const fetchReportsAndFG = useCallback(() => {
    setLoadingReports(true);
    Promise.all([apiCall<any>('/api/quant/fear-greed'), apiCall<any>('/api/quant/reports')])
      .then(([fg, rep]) => {
        setFearGreedData(fg.status === 'Sucesso' ? fg.data : null);
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
    apiCall<any>('/api/quant/generate-report', { method: 'POST' })
      .then((res) => {
        if (res.status === 'Sucesso') {
          fetchReportsAndFG();
        } else {
          notify(res.msg || 'Falha ao gerar relatório.', 'error');
        }
      })
      .catch((err) => {
        console.error(err);
        notify('Erro ao se conectar ao backend.', 'error');
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
