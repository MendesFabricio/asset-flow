'use client';

import { useTheme } from '@/context/ThemeContext';

export interface ChartPalette {
  grid: string;
  axis: string;
  axisLine: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipLabel: string;
  tooltipLabelBorder: string;
  activeDotFill: string;
}

export const useChartPalette = (): ChartPalette => {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  if (isLight) {
    return {
      grid: '#e2e8f0',
      axis: '#64748b',
      axisLine: '#cbd5e1',
      tooltipBg: 'rgba(255, 255, 255, 0.98)',
      tooltipBorder: '#e2e8f0',
      tooltipLabel: '#334155',
      tooltipLabelBorder: '#e2e8f0',
      activeDotFill: '#0f172a',
    };
  }

  return {
    grid: '#1e293b',
    axis: '#475569',
    axisLine: '#334155',
    tooltipBg: 'rgba(15, 23, 42, 0.95)',
    tooltipBorder: '#334155',
    tooltipLabel: '#94a3b8',
    tooltipLabelBorder: '#334155',
    activeDotFill: '#ffffff',
  };
};

export const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#64748b'];
