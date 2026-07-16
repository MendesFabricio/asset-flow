'use client';

import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { usePrivacy } from '@/context/PrivacyContext';
import { Card } from '@/components/ui/Card';
import { BrainCircuit, Info } from 'lucide-react';

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

    fetch('/api/simulation', { signal: controller.signal })
      .then(res => res.json() as Promise<SimulationApiResponse>)
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

  if (loading) return <div className="animate-pulse h-[400px] bg-slate-900/50 rounded-xl border border-slate-800" />;
  if (data.length === 0) return null;

  return (
    <Card className="flex flex-col !bg-slate-950 !border-slate-900 shadow-2xl p-6 animate-in fade-in duration-500">

      {/* Cabeçalho Sincronizado */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20">
            <BrainCircuit size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-widest leading-none">
              Simulação de Monte Carlo
            </h3>
            <div className="flex items-center gap-1.5 mt-2 text-slate-500">
              <Info size={10} />
              <p className="text-[10px] font-medium uppercase tracking-tight">
                1.000 Cenários • Movimento Browniano • Projeção 1 Ano
              </p>
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">
            Volatilidade Anual
          </p>
          <p className="text-xl font-bold text-amber-400 font-mono">
            {stats.vol}
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: isHidden ? 0 : -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />

            <XAxis
              dataKey="dia"
              stroke="#475569"
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => val % 60 === 0 ? `${val}d` : ''}
              dy={10}
            />

            <YAxis
              stroke="#475569"
              fontSize={10}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
              width={isHidden ? 45 : 65}
              tickFormatter={(val) => isHidden ? '••••' : `R$ ${(val / 1000).toFixed(0)}k`}
              domain={['auto', 'auto']}
            />

            <Tooltip
              cursor={{ stroke: '#334155', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                borderRadius: '12px',
                border: '1px solid #334155',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)'
              }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', padding: '2px 0' }}
              labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '10px', fontWeight: 'bold' }}
              // ⚡ CONTRATO ESTREITO TS: Substituído o 'val: any' por tipagem estruturada estrita
              formatter={(val: any) => [isHidden ? '••••••' : `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
              labelFormatter={(label) => `Dia ${label}`}
            />

            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{value}</span>}
            />

            <Line
              type="monotone"
              dataKey="melhor"
              name="Otimista (95%)"
              stroke="#10b981"
              strokeWidth={2}
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
