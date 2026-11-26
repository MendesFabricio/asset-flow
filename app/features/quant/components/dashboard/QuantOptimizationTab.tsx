'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Sliders, Target, Compass, HelpCircle, Info } from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { MetricsGridSkeleton } from '@/components/ui/Skeletons';
import { useChartPalette } from '@/lib/chartPalette';
import { Asset, EfficientFrontierData, FrontierPoint, RebalanceBandsData } from '@/types';

const TaxSellSimulatorCard = dynamic(() => import('../TaxSellSimulatorCard'), { ssr: false });

interface QuantOptimizationTabProps {
  ativos?: Asset[];
  optLoading: boolean;
  frontierData: EfficientFrontierData | null;
  rebalanceData: RebalanceBandsData | null;
  selectedOptimalPt: FrontierPoint | null;
  riskAversion: number;
  onChangeRiskAversion: (v: number) => void;
  markowitz: Record<string, number>;
  riskParity: Record<string, number>;
  currentAlloc: Record<string, number>;
}

const scatterTooltipFormatter = (value: string | number | undefined, name: string | number | undefined) => {
  if (name === 'Retorno Esperado') return [`${value ?? 0}% a.a.`, String(name)];
  if (name === 'Volatilidade') return [`${value ?? 0}% a.a.`, String(name)];
  return [value ?? '', String(name ?? '')];
};

export function QuantOptimizationTab({
  ativos,
  optLoading,
  frontierData,
  rebalanceData,
  selectedOptimalPt,
  riskAversion,
  onChangeRiskAversion,
  markowitz,
  riskParity,
  currentAlloc,
}: QuantOptimizationTabProps) {
  const palette = useChartPalette();

  const renderScatterChart = useMemo(() => {
    if (!frontierData) return null;
    return (
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
          <XAxis
            type="number"
            dataKey="volatilidade"
            name="Volatilidade"
            unit="%"
            domain={['dataMin - 1', 'dataMax + 1']}
            stroke={palette.axis}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey="retorno"
            name="Retorno Esperado"
            unit="%"
            domain={['dataMin - 1', 'dataMax + 1']}
            stroke={palette.axis}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#3b82f6' }}
            contentStyle={{ backgroundColor: palette.tooltipBg, borderColor: palette.tooltipBorder }}
            formatter={scatterTooltipFormatter}
          />
          <Scatter name="Portfólios Simulados" data={frontierData.cloud} fill="#64748b" opacity={0.3} shape="circle" />
          <Scatter
            name="Fronteira Eficiente"
            data={frontierData.frontier}
            fill="#3b82f6"
            line={{ stroke: '#3b82f6', strokeWidth: 2 }}
            shape="circle"
          />
          <Scatter name="Sharpe Máximo" data={[frontierData.max_sharpe]} fill="#10b981" shape="cross" />
          <Scatter name="Mínima Volatilidade" data={[frontierData.min_vol]} fill="#f59e0b" shape="cross" />
          {selectedOptimalPt && <Scatter name="Seu Nível de Risco" data={[selectedOptimalPt]} fill="#ec4899" shape="circle" />}
          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }, [frontierData, selectedOptimalPt, palette]);

  if (optLoading) return <MetricsGridSkeleton />;

  if (!frontierData || !rebalanceData) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center bg-surface-card border-border-subtle min-h-[350px]">
        <Info className="text-indigo-400 mb-4 animate-pulse" size={32} />
        <h3 className="font-bold text-text-primary text-sm">Dados Quantitativos Insuficientes</h3>
        <p className="text-text-muted text-xs mt-2 max-w-sm leading-relaxed">
          É necessário ter ao menos 2 ativos de renda variável cadastrados em sua carteira com histórico mínimo de cotações para computar os modelos de Markowitz, Paridade de Risco, Critério de Kelly e correlação.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col gap-4 bg-surface-card border-border-subtle p-6 min-h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sliders className="text-accent" size={18} />
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                Fronteira Eficiente de Markowitz Interativa
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                  <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                    Mostra as melhores combinações possíveis de ativos (pontos no gráfico) para maximizar o retorno em diferentes níveis de risco.
                  </div>
                </div>
              </h3>
            </div>
            <div className="text-xs text-text-muted bg-surface-elevated border border-border-subtle rounded-lg px-2.5 py-1">
              Calculado em background com 5.000 simulações
            </div>
          </div>

          <div className="h-[320px] w-full relative">{renderScatterChart}</div>

          <div className="flex flex-col gap-2 bg-surface-elevated/60 p-4 rounded-xl border border-border-subtle">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-text-muted">Aversão ao Risco (A)</span>
              <span className="text-pink-400 px-2 py-0.5 bg-pink-500/10 border border-pink-500/20 rounded">
                A = {riskAversion.toFixed(1)} {riskAversion < 2 ? '(Agressivo)' : riskAversion > 6 ? '(Conservador)' : '(Moderado)'}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={riskAversion}
              onChange={(e) => onChangeRiskAversion(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-surface rounded-lg appearance-none cursor-pointer accent-pink-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>0.5 (Foco em Retorno)</span>
              <span>5.0 (Moderado)</span>
              <span>10.0 (Foco em Menor Risco)</span>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 bg-surface-card border-border-subtle p-6">
          <div>
            <div className="flex items-center gap-2">
              <Target className="text-status-success" size={18} />
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                Alocação do Portfólio Sugerido
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                  <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                    Pesos de cada ativo que resultam no ponto ótimo escolhido na Fronteira Eficiente. Use isso como meta para o seu rebalanceamento.
                  </div>
                </div>
              </h3>
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              Pesos ótimos calculados em tempo real de acordo com seu perfil selecionado.
            </p>
          </div>

          {selectedOptimalPt ? (
            <div className="flex flex-col gap-4 mt-2">
              <div className="grid grid-cols-2 gap-3 bg-surface-elevated/60 p-3 rounded-xl border border-border-subtle text-center">
                <div>
                  <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Retorno Esperado</div>
                  <div className="text-lg font-bold text-status-success">{selectedOptimalPt.retorno}% a.a.</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Volatilidade</div>
                  <div className="text-lg font-bold text-status-warning">{selectedOptimalPt.volatilidade}% a.a.</div>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs border-b border-border-subtle pb-2">
                <span className="text-text-muted">Sharpe Ratio</span>
                <span className="font-bold text-text-primary">{selectedOptimalPt.sharpe}</span>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Distribuição de Pesos</div>
                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {Object.entries(selectedOptimalPt.weights)
                    .filter(([, w]) => w > 0.1)
                    .sort(([, wa], [, wb]) => wb - wa)
                    .map(([ticker, weight]) => (
                      <div key={ticker} className="flex flex-col gap-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-text-secondary">{ticker}</span>
                          <span className="text-accent font-bold">{weight.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-surface-elevated rounded-full h-1.5 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${weight}%` }} />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-text-muted h-full">
              <Sliders size={24} className="mb-2" />
              <span className="text-xs">Mova o slider para gerar a sugestão.</span>
            </div>
          )}
        </Card>
      </div>

      <div className="w-full animate-in fade-in">
        <Card className="flex flex-col gap-4 bg-surface-card border-border-subtle p-6 h-full">
          <div>
            <div className="flex items-center gap-2">
              <Target className="text-teal-400" size={18} />
              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                Desvios de Peso e Banda de Tolerância (±2%)
                <div className="relative group/tt flex items-center cursor-pointer normal-case">
                  <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                  <div className="absolute bottom-full mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                    As bandas de tolerância indicam quando um ativo subiu ou caiu tanto que sua carteira ficou desbalanceada em relação à sua alocação ideal estipulada.
                  </div>
                </div>
              </h3>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Identifique ativos que saíram da faixa de tolerância em relação à meta declarada.
            </p>
          </div>

          {rebalanceData.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-muted bg-surface-elevated/40 rounded-xl border border-dashed border-border-subtle">
              <Target size={32} className="mb-3 opacity-50" />
              <p className="text-sm font-semibold text-text-secondary">Nenhum desvio significativo.</p>
              <p className="text-xs text-text-muted mt-1 text-center max-w-sm">
                Sua carteira está dentro das bandas de tolerância de ±2% em relação à alocação alvo ideal.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Ativo</th>
                    <th className="pb-3 text-right">Peso Atual</th>
                    <th className="pb-3 text-right">Meta</th>
                    <th className="pb-3 text-right">Desvio</th>
                    <th className="pb-3 text-center">Status</th>
                    <th className="pb-3 text-right pr-2">Recomendação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs">
                  {rebalanceData.data.map((item) => {
                    const isNormal = item.status === 'NORMAL';
                    const isExcedente = item.status === 'EXCEDENTE';
                    return (
                      <tr key={item.ticker} className="hover:bg-surface-elevated/50 transition">
                        <td className="py-3 pl-2 font-bold text-text-primary">{item.ticker}</td>
                        <td className="py-3 text-right">{item.weight_pct}%</td>
                        <td className="py-3 text-right">{item.target_pct}%</td>
                        <td className={`py-3 text-right font-semibold ${isNormal ? 'text-text-muted' : isExcedente ? 'text-status-error' : 'text-status-success'}`}>
                          {item.deviation_pct > 0 ? `+${item.deviation_pct}` : item.deviation_pct}%
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              isNormal
                                ? 'bg-surface-elevated border border-border-subtle text-text-muted'
                                : isExcedente
                                  ? 'bg-red-500/10 border border-red-500/20 text-status-error'
                                  : 'bg-emerald-500/10 border border-emerald-500/20 text-status-success'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className={`py-3 text-right pr-2 font-medium ${isNormal ? 'text-text-muted' : isExcedente ? 'text-status-error' : 'text-status-success'}`}>
                          {item.action_note}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {Object.keys(markowitz).length > 0 && (
          <Card className="flex flex-col gap-4 bg-surface-card border-border-subtle p-6 mt-6">
            <div>
              <div className="flex items-center gap-2">
                <Compass className="text-indigo-400" size={18} />
                <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                  Sugestão de Rebalanceamento Quantitativo
                  <div className="relative group/tt flex items-center cursor-pointer normal-case">
                    <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-secondary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                      <strong>Markowitz:</strong> Busca o maior retorno possível pelo risco aceito.<br /><strong>Paridade de Risco:</strong> Divide o risco igualmente entre os ativos.
                    </div>
                  </div>
                </h3>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Distribuição de pesos ideal segundo os modelos de Markowitz (Sharpe Máximo) e Paridade de Risco.
              </p>
            </div>

            <div className="overflow-x-auto w-full mt-2">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2">Ativo</th>
                    <th className="pb-3 text-right">Alocação Atual</th>
                    <th className="pb-3 text-right text-accent">Sharpe Máximo (Markowitz)</th>
                    <th className="pb-3 text-right text-indigo-400 pr-2">Paridade de Risco</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-xs">
                  {Object.keys({ ...markowitz, ...riskParity }).map((ticker) => {
                    const cleanTicker = ticker.toUpperCase();
                    return (
                      <tr key={ticker} className="hover:bg-surface-elevated/50 transition">
                        <td className="py-3 pl-2 font-bold text-text-primary">{cleanTicker}</td>
                        <td className="py-3 text-right">{(currentAlloc[cleanTicker] || 0).toFixed(1)}%</td>
                        <td className="py-3 text-right font-bold text-accent">{(markowitz[ticker] || 0).toFixed(1)}%</td>
                        <td className="py-3 text-right font-bold text-indigo-400 pr-2">{(riskParity[ticker] || 0).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <TaxSellSimulatorCard ativos={ativos} />
    </div>
  );
}
