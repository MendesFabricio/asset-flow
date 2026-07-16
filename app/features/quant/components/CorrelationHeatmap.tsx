'use client';

import React, { useEffect, useState } from 'react';
import { apiCall } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { BrainCircuit, Info, AlertTriangle } from 'lucide-react';

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
    if (val === 1.0) return 'bg-slate-800 border-slate-700 text-slate-400 font-bold'; // Auto-correlação diagonal
    
    // Positiva: verde
    if (val > 0) {
      if (val > 0.7) return 'bg-emerald-500/80 text-white font-bold';
      if (val > 0.4) return 'bg-emerald-500/50 text-emerald-100';
      return 'bg-emerald-500/20 text-emerald-300';
    }
    
    // Negativa: vermelha
    if (val < 0) {
      const abs = Math.abs(val);
      if (abs > 0.7) return 'bg-red-500/80 text-white font-bold';
      if (abs > 0.4) return 'bg-red-500/50 text-red-100';
      return 'bg-red-500/20 text-red-300';
    }

    return 'bg-slate-900/50 text-slate-500';
  };

  if (loading) {
    return (
      <div className="animate-pulse h-[450px] bg-slate-900/40 rounded-2xl border border-slate-800/80" />
    );
  }

  if (error || !data || data.tickers.length < 2) {
    return (
      <Card className="flex flex-col items-center justify-center p-8 text-center !bg-[#0f172a] !border-slate-800 min-h-[300px]">
        <AlertTriangle className="text-amber-500 mb-3" size={32} />
        <p className="text-slate-300 text-sm font-semibold">
          {error || 'Dados Insuficientes para Correlação'}
        </p>
        <p className="text-slate-500 text-xs mt-2 max-w-sm">
          A matriz de correlação de Pearson requer um histórico consolidado de pelo menos 2 ativos de renda variável para cruzar as informações.
        </p>
      </Card>
    );
  }

  const { tickers, categories, matrix } = data;

  return (
    <Card className="flex flex-col !bg-[#0f172a] !border-slate-800 shadow-2xl p-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <BrainCircuit size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest leading-none">
              Correlação Setorial de Pearson
            </h3>
            <div className="flex items-center gap-1.5 mt-2 text-slate-500">
              <Info size={10} />
              <p className="text-[10px] font-medium uppercase tracking-tight">
                Matriz diária de retornos anualizados • Agrupado por categoria
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Correlação */}
      <div className="overflow-x-auto w-full">
        <div className="min-w-[600px] p-2">
          {/* Header Row */}
          <div className="flex mb-1">
            {/* Célula em branco superior esquerda */}
            <div className="w-20 shrink-0" />
            {tickers.map((t, idx) => (
              <div
                key={`hdr-${t}`}
                className="flex-1 text-center text-[9px] font-bold text-slate-400 uppercase tracking-tight py-1 truncate"
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
                className="w-20 shrink-0 text-left text-[9px] font-bold text-slate-400 uppercase tracking-tight pr-2 truncate"
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
                    className={`flex-1 text-center py-2.5 mx-0.5 rounded text-[10px] font-mono border transition-all hover:scale-105 cursor-pointer ${getCellColor(
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
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-800/80 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-emerald-500/80 rounded" />
          <span>Forte Correlação (+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-slate-800 rounded border border-slate-700" />
          <span>Diagonal (Mesmo Ativo)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-red-500/80 rounded" />
          <span>Forte Correlação (-)</span>
        </div>
      </div>
    </Card>
  );
});
