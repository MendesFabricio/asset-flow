'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@/lib/api';
import { DCASimulationData } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Encapsula o simulador de DCA vs. Aporte Único (Lump Sum).
 * `defaultTicker` permite semear o ticker inicial quando os dados de
 * rebalanceamento chegam.
 */
export function useDcaSimulation(defaultTicker?: string) {
  const [ticker, setTicker] = useState('PETR4');
  const [initialAmount, setInitialAmount] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(1000);
  const [result, setResult] = useState<DCASimulationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = useCallback(() => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);

    apiCall<DCASimulationData>(
      `/api/quant/dca-lump-sum?ticker=${encodeURIComponent(ticker)}&initial_amount=${initialAmount}&monthly_contribution=${monthlyContribution}`
    )
      .then((res) => {
        if (res.status === 'Sucesso') {
          setResult(res);
        } else {
          setError((res as any).msg || 'Falha ao processar simulação.');
        }
      })
      .catch((err: any) => {
        console.error(err);
        setError(err?.message || 'Erro ao comunicar com a API do simulador.');
      })
      .finally(() => setLoading(false));
  }, [ticker, initialAmount, monthlyContribution]);

  // Semeia o ticker padrão quando disponível
  useEffect(() => {
    if (defaultTicker) setTicker(defaultTicker);
  }, [defaultTicker]);


  return {
    ticker,
    setTicker,
    initialAmount,
    setInitialAmount,
    monthlyContribution,
    setMonthlyContribution,
    result,
    loading,
    error,
    runSimulation,
  };
}
