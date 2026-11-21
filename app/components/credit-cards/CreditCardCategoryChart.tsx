'use client';

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { formatMoney } from '../../lib/format';
import { usePrivacy } from '../../context/PrivacyContext';
import { useChartPalette } from '../../lib/chartPalette';

interface ChartDataItem {
  name: string;
  value: number;
  [key: string]: unknown;
}

interface CreditCardCategoryChartProps {
  chartData: ChartDataItem[];
  colors: string[];
}

export function CreditCardCategoryChart({ chartData, colors }: CreditCardCategoryChartProps) {
  const { isHidden } = usePrivacy();
  const palette = useChartPalette();
  if (!chartData || chartData.length === 0) return null;

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Gastos por Categoria</h4>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                isHidden ? 'R$ •••••' : formatMoney(typeof val === 'number' ? val : Number(val || 0)),
                'Gasto',
              ]}
              contentStyle={{
                backgroundColor: palette.tooltipBg,
                borderColor: palette.tooltipBorder,
                borderRadius: '8px',
                color: palette.tooltipLabel,
                fontSize: '12px',
              }}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
