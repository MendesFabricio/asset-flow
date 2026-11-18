import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PassiveIncomeTab } from './PassiveIncomeTab';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { apiCall } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiCall: vi.fn(),
}));

describe('PassiveIncomeTab', () => {
  it('renders simulation results when API succeeds', async () => {
    vi.mocked(apiCall).mockResolvedValue({
      status: 'Sucesso',
      data: {
        months_to_goal: 72,
        years_to_goal: 6.0,
        required_patrimony: 750000,
        initial_monthly_income: 500,
        final_patrimony: 1200000,
        final_monthly_income: 8500,
        total_contributed: 500000,
        total_dividends_generated: 400000,
        yield_on_cost_pct: 12.4,
        annual_series: [
          {
            year: 0,
            patrimony: 100000,
            total_contributed: 100000,
            monthly_income: 500,
            annual_dividends: 0,
            progress_pct: 10,
          },
          {
            year: 6,
            patrimony: 750000,
            total_contributed: 300000,
            monthly_income: 5000,
            annual_dividends: 55000,
            progress_pct: 100,
          },
        ],
      },
    });

    render(
      <PrivacyProvider>
        <PassiveIncomeTab currentPortfolioTotal={100000} currentMonthlyIncome={500} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('6.0 anos (72 meses)')).toBeInTheDocument();
      expect(screen.getByText('12.4% a.a.')).toBeInTheDocument();
    });
  });
});
