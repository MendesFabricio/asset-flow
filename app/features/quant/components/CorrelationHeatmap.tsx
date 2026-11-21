'use client';

import React, { useEffect, useState } from 'react';
import { apiCall } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { AlertTriangle } from 'lucide-react';

interface CorrelationResponse {
  status: string;
  tickers: string[];
  categories: string[];
  matrix: number[][];
}

export const CorrelationHeatmap = React.memo(function CorrelationHeatmap() {
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiCall<CorrelationResponse>('/api/simulation/correlation')
      .then((res) => {
        if (res.status === 'Sucesso') {
          setData(res);
        } else {
          setError('Não foi possível calcular a correlação setorial.');
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Falha de comunicação com a API quantitativa.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Helper to resolve color gradient based on correlation coefficient (-1.0 to 1.0)
  const getCellColor = (val: number) => {
    if (val === 1.0) return 'bg-surface-input border-border-subtle text-text-muted font-semibold'; // Auto-correlação diagonal
    
    // Positiva: verde
    if (val > 0) {
      if (val > 0.7) return 'bg-status-success/80 text-white font-semibold';
      if (val > 0.4) return 'bg-status-success/50 text-white';
      return 'bg-status-success/20 text-status-success';
    }
    
    // Negativa: vermelha
    if (val < 0) {
      const abs = Math.abs(val);
      if (abs > 0.7) return 'bg-status-error/80 text-white font-semibold';
      if (abs > 0.4) return 'bg-status-error/50 text-white';
      return 'bg-status-error/20 text-status-error';
    }

    return 'bg-surface-input/40 text-text-muted';
  };

  if (loading) {
    return (
      <div className="animate-pulse h-[450px] bg-surface-card rounded-xl border border-border-subtle" />
    );
  }

  if (error || !data || data.tickers.length < 2) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <AlertTriangle className="text-status-warning mb-3" size={32} />
        <p className="text-text-primary text-sm font-semibold">
          {error || 'Dados Insuficientes para Correlação'}
        </p>
        <p className="text-text-muted text-xs mt-2 max-w-sm">
          A matriz de correlação de Pearson requer um histórico consolidado de pelo menos 2 ativos de renda variável para cruzar as informações.
        </p>
      </Card>
    );
  }

  const { tickers, categories, matrix } = data;

  return (
    <Card className="flex flex-col p-6 mt-2">
      {/* O cabeçalho explicativo foi movido para o Accordion pai no QuantDashboard */}

      {/* Grid de Correlação */}
      <div className="overflow-x-auto w-full">
        <div className="w-full min-w-max p-2">
          {/* Header Row */}
          <div className="flex mb-1">
            {/* Célula em branco superior esquerda */}
            <div className="w-20 shrink-0" />
            {tickers.map((t, idx) => (
              <div
                key={`hdr-${t}`}
                className="flex-1 text-center text-2xs font-semibold text-text-muted uppercase tracking-tight py-1 truncate"
                title={`${t} (${categories[idx]})`}
              >
                {t}
              </div>
            ))}
          </div>

          {/* Matriz Rows */}
          {tickers.map((tRow, rIdx) => (
            <div key={`row-${tRow}`} className="flex items-center mb-1">
              {/* Rótulo da Linha */}
              <div
                className="w-20 shrink-0 text-left text-2xs font-semibold text-text-muted uppercase tracking-tight pr-2 truncate"
                title={`${tRow} (${categories[rIdx]})`}
              >
                {tRow}
              </div>

              {/* Colunas */}
              {tickers.map((tCol, cIdx) => {
                const val = matrix[rIdx][cIdx];
                return (
                  <div
                    key={`cell-${tRow}-${tCol}`}
                    className={`flex-1 text-center py-2.5 mx-0.5 rounded-md text-2xs font-mono tabular-nums border border-border-subtle/50 transition-colors cursor-pointer ${getCellColor(
                      val
                    )}`}
                    title={`${tRow} vs ${tCol}: ${val.toFixed(4)} (${categories[rIdx]} / ${categories[cIdx]})`}
                  >
                    {val === 1.0 ? '1.0' : val.toFixed(2)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border-subtle text-2xs font-medium text-text-muted uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-status-success/80 rounded-md" />
          <span>Forte Correlação (+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-surface-input rounded-md border border-border-subtle" />
          <span>Diagonal (Mesmo Ativo)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-status-error/80 rounded-md" />
          <span>Forte Correlação (-)</span>
        </div>
      </div>
    </Card>
  );
});
