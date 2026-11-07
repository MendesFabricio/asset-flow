import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CreditCardCategoryChart } from './CreditCardCategoryChart';

// Mock recharts to avoid canvas rendering limitations in JSDOM
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div data-testid="pie-cell" />,
  Tooltip: () => null,
  Legend: () => <div data-testid="pie-legend">Legenda</div>,
}));

describe('CreditCardCategoryChart', () => {
  it('renders null when chartData is empty', () => {
    const { container } = render(<CreditCardCategoryChart chartData={[]} colors={['#3b82f6']} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders chart title and legend when chartData is provided', () => {
    const mockData = [
      { name: 'Alimentação', value: 350.0 },
      { name: 'Transporte', value: 120.0 },
    ];

    render(<CreditCardCategoryChart chartData={mockData} colors={['#3b82f6', '#10b981']} />);
    expect(screen.getByText(/Gastos por Categoria/i)).toBeInTheDocument();
    expect(screen.getByTestId('pie-legend')).toBeInTheDocument();
  });
});
