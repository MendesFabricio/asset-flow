'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { usePrivacy } from '@/context/PrivacyContext';
import { apiCall } from '@/lib/api';
import { useChartPalette } from '@/lib/chartPalette';
import { SEMANTIC_CHART_HEX } from '@/lib/colors';
import { Card } from '@/components/ui/Card';
import { BrainCircuit, Info, HelpCircle } from 'lucide-react';

// 🛡️ Interface para os pontos de dados estruturados do gráfico
interface SimulationDataPoint {
  dia: number;
  pior: number;
  medio: number;
  melhor: number;
}

// 🛡️ Interface para mapear a resposta vinda do backend em Python
interface SimulationApiResponse {
  status: string;
  volatilidade_anual: string;
  projecao: {
    pior_caso: number[];
    medio: number[];
    melhor_caso: number[];
  };
}

export const MonteCarloChart = React.memo(function MonteCarloChart() {
  const [data, setData] = useState<SimulationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ vol: '' });
  const { isHidden } = usePrivacy() as { isHidden: boolean };
  const palette = useChartPalette();

  useEffect(() => {
    // ⚡ BLINDAGEM DE MEMÓRIA: Injetado o AbortController para abortar chamadas pendentes no desmonte
    const controller = new AbortController();

    apiCall<SimulationApiResponse>('/api/simulation', { signal: controller.signal })
      .then(d => {
        // Alimenta o estado do React apenas se a requisição não tiver sido abortada
        if (!controller.signal.aborted && d.status === 'Sucesso') {
          const formattedData = d.projecao.medio.map((_: number, index: number): SimulationDataPoint => ({
            dia: index,
            pior: d.projecao.pior_caso[index],
            medio: d.projecao.medio[index],
            melhor: d.projecao.melhor_caso[index],
          }));

          setData(formattedData);
          setStats({ vol: d.volatilidade_anual });
        }
      })
      .catch(err => {
        // Descarta silenciosamente logs de cancelamento intencional do motor do Next.js
        if (err.name !== 'AbortError') {
          console.error("Erro no pipeline estatístico do Monte Carlo:", err);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    // 🧼 CLEANUP FUNCTION: Executada imediatamente se o componente for desmontado da DOM
    return () => controller.abort();
  }, []);

  if (loading) return <div className="animate-pulse h-[400px] bg-surface-card rounded-xl border border-border-subtle" />;
  if (data.length === 0) return null;

  return (
    <Card className="flex flex-col p-6">

      {/* Cabeçalho Sincronizado */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-accent-soft rounded-lg border border-accent/20">
            <BrainCircuit size={16} className="text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-xs uppercase tracking-wider leading-none flex items-center gap-2">
              Simulação de Monte Carlo
              <div className="relative group/tt flex items-center cursor-pointer normal-case">
                <HelpCircle size={14} className="text-text-muted hover:text-accent transition-colors" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-primary text-2xs rounded-lg shadow-lg border border-border-subtle z-50 font-normal">
                  Projeta matematicamente 1.000 futuros possíveis para sua carteira com base na volatilidade histórica. Mostra o cenário mais provável (tendência) e as extremidades (otimista/pessimista) para o próximo ano.
                </div>
              </div>
            </h3>
            <div className="flex flex-col gap-0.5 mt-2 text-text-muted">
              <div className="flex items-center gap-1.5">
                <Info size={10} />
                <p className="text-2xs font-medium uppercase tracking-tight">
                  1.000 Cenários • Movimento Browniano • Projeção 1 Ano
                </p>
              </div>
              <p className="text-2xs text-text-muted">
                Base simulada: Renda Variável &amp; Cripto (exclui Reserva e Renda Fixa)
              </p>
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider leading-none">
            Volatilidade Anual
          </p>
          <p className="text-xl font-semibold text-status-warning font-mono tabular-nums">
            {stats.vol}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: isHidden ? 0 : -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} opacity={0.5} />

            <XAxis
              dataKey="dia"
              stroke={palette.axis}
              fontSize={10}
              fontWeight={500}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val % 60 === 0 ? `${val}d` : ''}
              dy={10}
            />

            <YAxis
              stroke={palette.axis}
              fontSize={10}
              fontWeight={500}
              tickLine={false}
              axisLine={false}
              width={isHidden ? 45 : 65}
              tickFormatter={(val) => isHidden ? '••••' : `R$ ${(val / 1000).toFixed(0)}k`}
              domain={['auto', 'auto']}
            />

            <Tooltip
              cursor={{ stroke: palette.grid, strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                borderColor: palette.tooltipBorder,
                borderRadius: '0.75rem',
                border: `1px solid ${palette.tooltipBorder}`,
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.25)'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', padding: '2px 0' }}
              labelStyle={{ color: palette.tooltipLabel, marginBottom: '8px', fontSize: '10px', fontWeight: 600 }}
              // ⚡ CONTRATO ESTREITO TS: Substituído o 'val: any' por tipagem estruturada estrita
              formatter={(val) => [isHidden ? '••••••' : `R$ ${Number(val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
              labelFormatter={(label) => `Dia ${label}`}
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-2xs font-semibold text-text-muted uppercase tracking-tight">{value}</span>}
            />

            <Line
              type="monotone"
              dataKey="melhor"
              name="Otimista (95%)"
              stroke={SEMANTIC_CHART_HEX.emerald}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="medio"
              name="Tendência"
              stroke={SEMANTIC_CHART_HEX.blue}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="pior"
              name="Pessimista (5%)"
              stroke={SEMANTIC_CHART_HEX.rose}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});
