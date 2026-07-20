'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '@/lib/api';
import {
  AlphaAttributionData,
  RebalanceBandsData,
  EfficientFrontierData,
  FrontierPoint,
} from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Carrega e mantém todos os dados quantitativos base (fronteira eficiente,
 * bandas de rebalanceamento, atribuição de alfa, Kelly, momentum, Sharpe),
 * além das alocações de otimização (Markowitz / Risk Parity / atual).
 */
export function useQuantData(riskAversion: number) {
  const [frontierData, setFrontierData] = useState<EfficientFrontierData | null>(null);
  const [rebalanceData, setRebalanceData] = useState<RebalanceBandsData | null>(null);
  const [attributionData, setAttributionData] = useState<AlphaAttributionData | null>(null);
  const [markowitz, setMarkowitz] = useState<Record<string, number>>({});
  const [riskParity, setRiskParity] = useState<Record<string, number>>({});
  const [currentAlloc, setCurrentAlloc] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiCall<EfficientFrontierData>('/api/quant/efficient-frontier'),
      apiCall<RebalanceBandsData>('/api/quant/rebalance-bands'),
      apiCall<AlphaAttributionData>('/api/quant/attribution-analysis'),
    ])
      .then(([frontier, rebalance, attribution]) => {
        setFrontierData(frontier.status === 'Sucesso' ? frontier : null);
        setRebalanceData(rebalance.status === 'Sucesso' ? rebalance : null);
        setAttributionData(attribution.status === 'Sucesso' ? attribution : null);
      })
      .catch((err) => {
        console.error(err);
        setError('Erro ao carregar os dados quantitativos. Verifique a conexão com o servidor.');
        setFrontierData(null);
        setRebalanceData(null);
        setAttributionData(null);
      })
      .finally(() => setLoading(false));

    apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/optimize')
      .then((res) => setMarkowitz(res.status === 'Sucesso' ? res.weights : {}))
      .catch(() => setMarkowitz({}));

    apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/risk-parity')
      .then((res) => setRiskParity(res.status === 'Sucesso' ? res.weights : {}))
      .catch(() => setRiskParity({}));

    apiCall<any[]>('/api/assets')
      .then((res) => {
        const assetsList = Array.isArray(res) ? res : [];
        if (assetsList.length > 0) {
          const totalVal = assetsList.reduce((acc: number, curr: any) => {
            const val = parseFloat(curr.total_atual || 0);
            return acc + (isNaN(val) ? 0 : val);
          }, 0);
          const mapping: Record<string, number> = {};
          assetsList.forEach((a: any) => {
            const val = parseFloat(a.total_atual || 0);
            const pct = totalVal > 0 ? ((isNaN(val) ? 0 : val) / totalVal) * 100 : 0;
            if (a.ticker) mapping[a.ticker.toUpperCase()] = pct;
          });
          setCurrentAlloc(mapping);
        }
      })
      .catch(() => {});
  }, []);

  const selectedOptimalPt = useMemo<FrontierPoint | null>(() => {
    if (!frontierData || frontierData.frontier.length === 0) return null;

    let bestPt: FrontierPoint | null = null;
    let maxUtility = -Infinity;

    frontierData.frontier.forEach((pt) => {
      const r = pt.retorno / 100.0;
      const v = pt.volatilidade / 100.0;
      const utility = r - 0.5 * riskAversion * v ** 2;
      if (utility > maxUtility) {
        maxUtility = utility;
        bestPt = pt;
      }
    });

    return bestPt;
  }, [riskAversion, frontierData]);

  return {
    frontierData,
    rebalanceData,
    attributionData,
    markowitz,
    riskParity,
    currentAlloc,
    selectedOptimalPt,
    loading,
    error,
  };
}
