'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { formatMoney } from '../../lib/format';

interface ChartDataItem {
  name: string;
  value: number;
  [key: string]: any;
}

interface CreditCardCategoryChartProps {
  chartData: ChartDataItem[];
  colors: string[];
}

export function CreditCardCategoryChart({ chartData, colors }: CreditCardCategoryChartProps) {
  if (!chartData || chartData.length === 0) return null;

  return (
    <div className="bg-surface-card border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gastos por Categoria</h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: number | string | undefined) => [
                formatMoney(typeof val === 'number' ? val : Number(val || 0)),
                'Gasto',
              ]}
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
