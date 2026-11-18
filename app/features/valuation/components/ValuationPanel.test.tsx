import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ValuationPanel } from './ValuationPanel';
import { ToastProvider } from '@/context/ToastContext';
import { apiCall } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiCall: vi.fn(),
}));

describe('ValuationPanel', () => {
  it('renders Bazin, Graham, DCF, 5y dividend history, and checklist', async () => {
    vi.mocked(apiCall).mockResolvedValue({
      status: 'Sucesso',
      data: {
        ticker: 'BBSE3',
        name: 'BB Seguridade',
        asset_type: 'Ação',
        sector: 'Financeiro & Bancos',
        price: 35.0,
        change_percent: 1.1,
        dy_12m: 9.5,
        dy_avg_5y: 8.8,
        dividend_per_share: 3.3,
        lpa: 4.5,
        vpa: 7.0,
        pl: 7.8,
        pvp: 5.0,
        roe: 65.0,
        roic: null,
        net_margin: 85.0,
        ebitda_margin: 90.0,
        ev_ebitda: null,
        debt_to_ebitda: null,
        payout: 75.0,
        fcf_per_share: 3.1,
        bazin_price: 55.0,
        graham_price: 26.6,
        gordon_price: 49.5,
        dcf_price: 42.0,
        margin_bazin_pct: 57.1,
        margin_graham_pct: -24.0,
        margin_dcf_pct: 20.0,
        quality_score: 92,
        magic_score: null,
        dividend_history_5y: [
          { year: 2023, total: 2.8 },
          { year: 2024, total: 3.1 },
          { year: 2025, total: 3.3 },
        ],
        checklist: [
          {
            key: 'roe',
            label: 'Rentabilidade (ROE)',
            value: 65.0,
            formatted: '65.0%',
            rule: 'Ideal >= 15%',
            status: 'pass',
          },
        ],
      },
    });

    render(
      <ToastProvider>
        <ValuationPanel ticker="BBSE3" assetType="Ação" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('92')).toBeInTheDocument();
      expect(screen.getByText('Rentabilidade (ROE)')).toBeInTheDocument();
      expect(screen.getByText('2025')).toBeInTheDocument();
      expect(screen.getByText('Alerta')).toBeInTheDocument();
    });
  });
});
