import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignalsBookView } from './SignalsBookView';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { apiCall } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiCall: vi.fn(),
}));

const MOCK_RESPONSE = {
  status: 'Sucesso',
  items: [
    {
      ticker: 'BBDC4',
      date: '2026-10-01',
      score: 84,
      status: 'COMPRA_FORTE',
      recomendacao: '🟢 APORTAR FORTE',
      preco: 15.0,
      mg_graham: 90.0,
      mg_bazin: 45.0,
      p_vp: 0.85,
      quality_score: 88,
      forward_return_30d: 10.5,
      forward_return_90d: 18.2,
      forward_return_180d: 26.4,
    },
  ],
  summary: {
    total: 1,
    by_status: { COMPRA_FORTE: 1 },
    backtest: {
      COMPRA_FORTE: {
        count: 1,
        avg_score: 84,
        avg_return_30d: 10.5,
        avg_return_90d: 18.2,
        avg_return_180d: 26.4,
      },
    },
    recent_changes: [
      {
        ticker: 'BBDC4',
        date: '2026-10-01',
        from_status: 'NEUTRO',
        to_status: 'COMPRA_FORTE',
        recomendacao: '🟢 APORTAR FORTE',
        score: 84,
      },
    ],
  },
};

describe('SignalsBookView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders backtest summary, recent changes, and signal table', async () => {
    vi.mocked(apiCall).mockResolvedValue(MOCK_RESPONSE);
    const onSelectTicker = vi.fn();

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={onSelectTicker} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Mudanças Recentes de Sinal')).toBeInTheDocument();
      expect(screen.getByText(/\+10\.5%/)).toBeInTheDocument();
      expect(screen.getByText(/\+18\.2%/)).toBeInTheDocument();
      expect(screen.getByText(/\+26\.4%/)).toBeInTheDocument();
    });

    const tickerNodes = screen.getAllByText('BBDC4');
    fireEvent.click(tickerNodes[tickerNodes.length - 1]);
    expect(onSelectTicker).toHaveBeenCalledWith('BBDC4');
  });

  it('queries filtered ticker when filter input changes and handles empty state', async () => {
    vi.mocked(apiCall)
      .mockResolvedValueOnce(MOCK_RESPONSE)
      .mockResolvedValueOnce({
        status: 'Sucesso',
        items: [],
        summary: { total: 0, by_status: {}, backtest: {}, recent_changes: [] },
      });

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={vi.fn()} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/api/valuation/signals/history?limit=300');
    });

    const input = screen.getByLabelText('Filtrar ticker no Livro de Sinais');
    fireEvent.change(input, { target: { value: 'petr4' } });

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/api/valuation/signals/history?ticker=PETR4&limit=300');
      expect(screen.getByText(/Nenhum snapshot/i)).toBeInTheDocument();
    });
  });

  it('toggles between latest per asset and full daily history without duplicating tickers in latest mode', async () => {
    vi.mocked(apiCall).mockResolvedValue({
      ...MOCK_RESPONSE,
      items: [
        ...MOCK_RESPONSE.items,
        {
          ...MOCK_RESPONSE.items[0],
          date: '2026-09-30',
          score: 79,
        },
      ],
    });

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={vi.fn()} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('2026-10-01').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('2026-09-30')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Último por ativo/i }));
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
  });
});
