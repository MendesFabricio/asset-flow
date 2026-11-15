import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PerformanceAttributionChart from './PerformanceAttributionChart';

vi.mock('swr', () => ({
  default: () => ({
    data: {
      status: 'Sucesso',
      ipca_source: 'bcb_sgs_433',
      series: [
        {
          year: 2026,
          month: 1,
          period: '01/2026',
          patrimonio_inicio: 10000,
          patrimonio_fim: 11200,
          aportes_liquidos: 1000,
          crescimento_custodia: 1200,
          variacao_mercado: 200,
          dividendos: 50,
          retorno_total: 250,
          ipca_mes_pct: 0.5,
          erosao_ipca: 50,
          variacao_mercado_real: 150,
          retorno_total_real: 200,
        },
      ],
      summary: {
        patrimonio_atual: 11200,
        total_aportes_liquidos: 1000,
        total_aporte_do_bolso: 950,
        total_variacao_mercado: 200,
        total_dividendos: 50,
        retorno_total_acumulado: 250,
        retorno_sobre_bolso_pct: 26.32,
        variacao_mercado_real_acumulada: 150,
        retorno_total_real_acumulado: 200,
        ipca_acumulado_pct: 0.5,
        ipca_fallback_months: 0,
      },
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock('@/context/PrivacyContext', () => ({
  usePrivacy: () => ({ isHidden: true }),
}));

vi.mock('@/lib/chartPalette', () => ({
  useChartPalette: () => ({
    grid: '#334155',
    axis: '#94a3b8',
    tooltipBg: '#0f172a',
    tooltipBorder: '#334155',
    tooltipLabel: '#e2e8f0',
    tooltipLabelBorder: '#334155',
    activeDotFill: '#ffffff',
  }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Area: () => null,
  Bar: () => null,
  Line: () => null,
  ReferenceLine: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

describe('PerformanceAttributionChart (Unified)', () => {
  const history = [
    { date: '01/01/26', Patrimônio: 10000, Investido: 9000, 'Ação': 6000, FII: 4000 },
    { date: '01/02/26', Patrimônio: 11200, Investido: 10000, 'Ação': 6800, FII: 4400 },
  ];

  it('renders unified tabs, masks KPIs under privacy mode, and switches to attribution', () => {
    render(<PerformanceAttributionChart history={history} />);

    expect(screen.getByText(/Evolução & Atribuição Patrimonial/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Total/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Classes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atribuição/i })).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getAllByText('R$ •••••').length).toBeGreaterThanOrEqual(3);

    fireEvent.click(screen.getByRole('button', { name: /Atribuição/i }));
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Real \(IPCA\)/i })).toBeInTheDocument();
  });
});
