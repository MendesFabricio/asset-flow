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
    grid: 'rgba(148, 163, 184, 0.12)',
    axis: '#94a3b8',
    axisLine: '#334155',
    tooltipBg: 'rgba(15, 23, 42, 0.95)',
    tooltipBorder: '#334155',
    tooltipLabel: '#94a3b8',
    tooltipLabelBorder: '#334155',
    activeDotFill: '#ffffff',
  };
};
