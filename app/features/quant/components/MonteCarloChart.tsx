'use client';

import React, { useEffect, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { usePrivacy } from '@/context/PrivacyContext';
import { useChartPalette } from '@/lib/chartPalette';
import { apiCall } from '@/lib/api';
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
  if (data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center bg-surface-card border-border-subtle p-8 text-center min-h-[220px]">
        <BrainCircuit size={24} className="text-text-muted mb-2 opacity-60" />
        <p className="text-xs font-bold text-text-primary uppercase tracking-wider">Simulação de Monte Carlo indisponível</p>
        <p className="text-[11px] text-text-muted mt-1">Sem histórico suficiente de Renda Variável ou Cripto para projetar cenários.</p>
      </Card>
    );
  }

  return <MonteCarloChartBody data={data} stats={stats} isHidden={isHidden} />;
});

function MonteCarloChartBody({ data, stats, isHidden }: { data: SimulationDataPoint[]; stats: { vol: string }; isHidden: boolean }) {
  const palette = useChartPalette();
  const chartData = data.map((d) => ({ ...d, range: [d.pior, d.melhor] as [number, number] }));

  return (
    <Card className="flex flex-col bg-surface-card border-border-subtle shadow-2xl p-6 animate-in fade-in duration-300">

      {/* Cabeçalho Sincronizado */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <BrainCircuit size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-text-primary text-xs uppercase tracking-widest leading-none flex items-center gap-2">
              Simulação de Monte Carlo
              <div className="relative group/tt flex items-center cursor-pointer normal-case">
                <HelpCircle size={14} className="text-text-muted hover:text-purple-400 transition-colors" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tt:block w-64 p-2 bg-surface-elevated text-text-primary text-[10px] rounded shadow-xl border border-border-subtle z-50 font-normal">
                  Projeta matematicamente 1.000 futuros possíveis para sua carteira com base na volatilidade histórica. Mostra o cenário mais provável (tendência) e a banda P5–P95 para o próximo ano.
                </div>
              </div>
            </h3>
            <div className="flex flex-col gap-0.5 mt-2 text-text-muted">
              <div className="flex items-center gap-1.5">
                <Info size={10} />
                <p className="text-[10px] font-medium uppercase tracking-tight">
                  1.000 Cenários • Banda P5–P95 • Projeção 1 Ano
                </p>
              </div>
              <p className="text-[10px] text-text-muted">
                Base simulada: Renda Variável &amp; Cripto (exclui Reserva e Renda Fixa)
              </p>
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest leading-none">
            Volatilidade Anual
          </p>
          <p className="text-xl font-bold text-amber-400 font-mono">
            {stats.vol}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: isHidden ? 0 : -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} opacity={0.5} />

            <XAxis
              dataKey="dia"
              stroke={palette.axis}
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val % 60 === 0 ? `${val}d` : ''}
              dy={10}
            />

            <YAxis
              stroke={palette.axis}
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              width={isHidden ? 45 : 70}
              tickFormatter={(val) => {
                if (isHidden) return '••••';
                const num = Number(val);
                if (Math.abs(num) >= 1000) return `R$ ${(num / 1000).toFixed(1).replace('.', ',')}k`;
                return `R$ ${num.toFixed(0)}`;
              }}
              domain={['auto', 'auto']}
            />

            <Tooltip
              cursor={{ stroke: palette.grid, strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                borderColor: palette.tooltipBorder,
                borderRadius: '12px',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.25)'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', padding: '2px 0' }}
              labelStyle={{ color: palette.axis, marginBottom: '8px', fontSize: '10px', fontWeight: 'bold' }}
              formatter={(val) => {
                if (Array.isArray(val)) {
                  if (isHidden) return ['••••••', 'Banda P5–P95'];
                  return [`R$ ${Number(val[0]).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} – R$ ${Number(val[1]).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, 'Banda P5–P95'];
                }
                return [isHidden ? '••••••' : `R$ ${Number(val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, ''];
              }}
              labelFormatter={(label) => `Dia ${label}`}
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-[10px] font-bold text-text-muted uppercase tracking-tight">{value}</span>}
            />

            <Area
              type="monotone"
              dataKey="range"
              name="Banda P5–P95"
              stroke="none"
              fill="#3b82f6"
              fillOpacity={0.14}
            />
            <Line
              type="monotone"
              dataKey="melhor"
              name="Otimista (95%)"
              stroke="#10b981"
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="medio"
              name="Tendência"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="pior"
              name="Pessimista (5%)"
              stroke="#ef4444"
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
