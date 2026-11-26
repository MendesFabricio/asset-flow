import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SignalsBookView } from './SignalsBookView';
import { PrivacyProvider } from '@/context/PrivacyContext';
import { apiCall } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiCall: vi.fn(),
}));

const MOCK_HISTORY_RESPONSE = {
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

const MOCK_V2_RESPONSE = {
  status: 'Sucesso',
  regime: {
    composite_regime: 'BULL_FLAT_NORMAL',
    label: 'Alta + Juros Estáveis',
    selic_annual: 11.25,
  },
  calibration_summary: {
    total_audited: 12,
    brier_score: 0.142,
    observed_hit_rate: 0.75,
  },
  opportunities: [
    {
      ticker: 'BBDC4',
      asset_class: 'ACAO_BR',
      setup_code: 'VALUE_GRAHAM_BAZIN',
      triggered: true,
      confidence_tier: 'ALTA_CERTEZA',
      calibrated_prob: 0.68,
      wilson_lb_95: 0.58,
      sample_size_n: 32,
      oos_sample_n: 12,
      win_rate: 0.75,
      expectancy_net: 0.042,
      profit_factor: 1.85,
      max_drawdown_mae: -0.09,
      oos_consistency_score: 0.82,
      triggers: [{ metric: 'P/VP', actual: '0.85x', rule: '<= 1.2x' }],
    },
  ],
};

describe('SignalsBookView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders v2 statistical engine cards, regime, backtest summary, and signal table', async () => {
    vi.mocked(apiCall).mockImplementation(async (url: string) => {
      if (url.startsWith('/api/signals/v2/opportunities')) return MOCK_V2_RESPONSE;
      return MOCK_HISTORY_RESPONSE;
    });
    const onSelectTicker = vi.fn();

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={onSelectTicker} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/ALTA CERTEZA/i)).toBeInTheDocument();
      expect(screen.getByText(/BULL_FLAT_NORMAL|Alta \+ Juros Estáveis/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ver Auditoria & Histórico Completo/i }));

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
    vi.mocked(apiCall).mockImplementation(async (url: string) => {
      if (url.startsWith('/api/signals/v2/opportunities')) {
        return { ...MOCK_V2_RESPONSE, opportunities: [] };
      }
      if (url.includes('ticker=PETR4')) {
        return {
          status: 'Sucesso',
          items: [],
          summary: { total: 0, by_status: {}, backtest: {}, recent_changes: [] },
        };
      }
      return MOCK_HISTORY_RESPONSE;
    });

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={vi.fn()} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/api/valuation/signals/history?limit=300');
    });

    fireEvent.click(screen.getByRole('button', { name: /Ver Auditoria & Histórico Completo/i }));

    const input = screen.getByLabelText('Filtrar ticker no Livro de Sinais');
    fireEvent.change(input, { target: { value: 'petr4' } });

    await waitFor(() => {
      expect(apiCall).toHaveBeenCalledWith('/api/valuation/signals/history?ticker=PETR4&limit=300');
      expect(screen.getByText(/Nenhum snapshot/i)).toBeInTheDocument();
    });
  });

  it('toggles between latest per asset and full daily history without duplicating tickers in latest mode', async () => {
    vi.mocked(apiCall).mockImplementation(async (url: string) => {
      if (url.startsWith('/api/signals/v2/opportunities')) return MOCK_V2_RESPONSE;
      return {
        ...MOCK_HISTORY_RESPONSE,
        items: [
          ...MOCK_HISTORY_RESPONSE.items,
          {
            ...MOCK_HISTORY_RESPONSE.items[0],
            date: '2026-09-30',
            score: 79,
          },
        ],
      };
    });

    render(
      <PrivacyProvider>
        <SignalsBookView onSelectTicker={vi.fn()} />
      </PrivacyProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ver Auditoria & Histórico Completo/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Ver Auditoria & Histórico Completo/i }));

    await waitFor(() => {
      expect(screen.getAllByText('2026-10-01').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('2026-09-30')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Último por ativo/i }));
    expect(screen.getByText('2026-09-30')).toBeInTheDocument();
  });
});
