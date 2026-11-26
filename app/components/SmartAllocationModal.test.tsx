import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SmartAllocationModal } from './SmartAllocationModal';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { apiCall } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiCall: vi.fn(),
}));

describe('SmartAllocationModal (Free Cash Bridge & Wilson Badge)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads 30d free cash bridge, sums dividends + receivables toggles, and renders wilson_lb_95 badge', async () => {
    vi.mocked(apiCall).mockImplementation(async (url: string) => {
      if (url.startsWith('/api/cashflow/free-cash-bridge')) {
        return {
          status: 'Sucesso',
          components: {
            dividends_30d: 250,
            receivables_30d: 400,
            receivables_overdue_excluded: 120,
          },
          net_free_cash_30d: 650,
          reserve_gap: 0,
        };
      }
      if (url === '/api/smart-rebalance') {
        return {
          status: 'Sucesso',
          total_atual: 10000,
          aporte_mensal: 1650,
          total_apos_aporte: 11650,
          sugestoes: [
            {
              ticker: 'ITUB4',
              category: 'Ação',
              current_pct: 10,
              target_pct: 20,
              gap_value: 1650,
              action: 'COMPRAR',
              suggested_value: 1650,
              suggested_lots: 47,
              lot_size: 1,
              score: 82,
              corr_penalty: 0,
              wilson_lb_95: 0.58,
              rationale: 'Abaixo da meta + setup favorável',
            },
          ],
          sobra: 5,
        };
      }
      return {};
    });

    render(
      <PrivacyProvider>
        <SmartAllocationModal isOpen={true} onClose={vi.fn()} ativos={[]} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/api/cashflow/free-cash-bridge?window_days=30');
      expect(screen.getByText(/Proventos provisionados 30d/i)).toBeInTheDocument();
      expect(screen.getByText(/Contas a Receber 30d/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('0,00');
    fireEvent.change(input, { target: { value: '1000' } });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);

    const calcBtn = screen.getByRole('button', { name: /Gerar Recomendação/i });
    fireEvent.click(calcBtn);

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith(
        '/api/smart-rebalance',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"aporte_mensal":1650'),
        })
      );
      expect(screen.getByText('ITUB4')).toBeInTheDocument();
      expect(screen.getByText('WLB 58%')).toBeInTheDocument();
    });
  });
});
