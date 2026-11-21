'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiCall } from '@/lib/api';
import {
  AlphaAttributionData,
  Asset,
  RebalanceBandsData,
  EfficientFrontierData,
  FrontierPoint,
} from '@/types';

export interface KellyCriterionItem {
  ticker: string;
  win_rate: number;
  win_loss_ratio: number;
  kelly_full: number;
  kelly_half_limit: number;
  kelly_quarter_limit: number;
}

export interface MomentumRankingItem {
  rank: number;
  ticker: string;
  momentum_score_pct: number;
}

export interface SharpeRollingData {
  status: string;
  dates?: string[];
  series?: Record<string, number[]>;
}

export type SectorExposureData = Record<string, Record<string, number>>;

/* eslint-disable @typescript-eslint/no-explicit-any */

function computeAllocMapping(assetsList: { ticker?: string; total_atual?: number | string }[]): Record<string, number> {
  if (assetsList.length === 0) return {};
  const totalVal = assetsList.reduce((acc, curr) => {
    const val = parseFloat(String(curr.total_atual || 0));
    return acc + (isNaN(val) ? 0 : val);
  }, 0);
  const mapping: Record<string, number> = {};
  assetsList.forEach((a) => {
    const val = parseFloat(String(a.total_atual || 0));
    const pct = totalVal > 0 ? ((isNaN(val) ? 0 : val) / totalVal) * 100 : 0;
    if (a.ticker) mapping[a.ticker.toUpperCase()] = pct;
  });
  return mapping;
}

/**
 * Carrega e mantém todos os dados quantitativos base (fronteira eficiente,
 * bandas de rebalanceamento, atribuição de alfa, Kelly, momentum, Sharpe),
 * além das alocações de otimização (Markowitz / Risk Parity / atual).
 */
export function useQuantData(riskAversion: number, ativos?: Asset[], activeTab: string = 'performance') {
  const [frontierData, setFrontierData] = useState<EfficientFrontierData | null>(null);
  const [rebalanceData, setRebalanceData] = useState<RebalanceBandsData | null>(null);
  const [attributionData, setAttributionData] = useState<AlphaAttributionData | null>(null);
  const [kellyData, setKellyData] = useState<KellyCriterionItem[]>([]);
  const [momentumData, setMomentumData] = useState<MomentumRankingItem[]>([]);
  const [sharpeRollingData, setSharpeRollingData] = useState<SharpeRollingData | null>(null);
  const [exposureData, setExposureData] = useState<SectorExposureData | null>(null);
  const [markowitz, setMarkowitz] = useState<Record<string, number>>({});
  const [riskParity, setRiskParity] = useState<Record<string, number>>({});
  const [fetchedAlloc, setFetchedAlloc] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [optLoading, setOptLoading] = useState(false);
  const [optLoaded, setOptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExternalAtivos = ativos !== undefined;

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiCall<RebalanceBandsData>('/api/quant/rebalance-bands'),
      apiCall<AlphaAttributionData>('/api/quant/attribution-analysis'),
      apiCall<{ status: string; data?: KellyCriterionItem[] }>('/api/quant/kelly-criterion').catch(() => ({ status: 'Erro', data: [] })),
      apiCall<{ status: string; data?: MomentumRankingItem[] }>('/api/quant/momentum-ranking').catch(() => ({ status: 'Erro', data: [] })),
      apiCall<SharpeRollingData>('/api/quant/sharpe-rolling').catch(() => ({ status: 'Erro' })),
      apiCall<SectorExposureData>('/api/simulation/exposure').catch(() => null),
    ])
      .then(([rebalance, attribution, kelly, momentum, sharpeRolling, exposure]) => {
        setRebalanceData(rebalance.status === 'Sucesso' ? rebalance : null);
        setAttributionData(attribution.status === 'Sucesso' ? attribution : null);
        setKellyData(kelly.status === 'Sucesso' && Array.isArray(kelly.data) ? kelly.data : []);
        setMomentumData(momentum.status === 'Sucesso' && Array.isArray(momentum.data) ? momentum.data : []);
        setSharpeRollingData(sharpeRolling.status === 'Sucesso' ? sharpeRolling : null);
        setExposureData(exposure && typeof exposure === 'object' && !('status' in exposure) ? exposure : null);
      })
      .catch((err) => {
        console.error(err);
        setError('Erro ao carregar os dados quantitativos. Verifique a conexão com o servidor.');
        setRebalanceData(null);
        setAttributionData(null);
        setKellyData([]);
        setMomentumData([]);
        setSharpeRollingData(null);
        setExposureData(null);
      })
      .finally(() => setLoading(false));

    if (!hasExternalAtivos) {
      apiCall<any[]>('/api/assets')
        .then((res) => {
          const assetsList = Array.isArray(res) ? res : [];
          setFetchedAlloc(computeAllocMapping(assetsList));
        })
        .catch(() => {});
    }
  }, [hasExternalAtivos]);

  // Lazy-load heavy optimization endpoints only when the optimization tab is opened
  useEffect(() => {
    if (activeTab !== 'optimization' || optLoaded) return;
    let active = true;
    setOptLoading(true);
    Promise.all([
      apiCall<EfficientFrontierData>('/api/quant/efficient-frontier'),
      apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/optimize').catch(() => ({ status: 'Erro', weights: {} })),
      apiCall<{ status: string; weights: Record<string, number> }>('/api/simulation/risk-parity').catch(() => ({ status: 'Erro', weights: {} })),
    ])
      .then(([frontier, mk, rp]) => {
        if (!active) return;
        setFrontierData(frontier.status === 'Sucesso' ? frontier : null);
        setMarkowitz(mk.status === 'Sucesso' ? mk.weights : {});
        setRiskParity(rp.status === 'Sucesso' ? rp.weights : {});
        setOptLoaded(true);
      })
      .catch(() => {
        if (active) setFrontierData(null);
      })
      .finally(() => {
        if (active) setOptLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeTab, optLoaded]);

  const currentAlloc = useMemo(() => {
    if (ativos !== undefined) return computeAllocMapping(ativos);
    return fetchedAlloc;
  }, [ativos, fetchedAlloc]);

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
    kellyData,
    momentumData,
    sharpeRollingData,
    exposureData,
    markowitz,
    riskParity,
    currentAlloc,
    selectedOptimalPt,
    loading,
    optLoading,
    error,
  };
}
