import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignalExplainabilityCard, SignalOpportunityV2 } from './SignalExplainabilityCard';

const SAMPLE_OPPORTUNITY: SignalOpportunityV2 = {
  ticker: 'VALE3',
  asset_class: 'ACAO_BR',
  setup_code: 'VALUE_GRAHAM_BAZIN',
  triggered: true,
  confidence_tier: 'INSUFFICIENT_SAMPLE',
  calibrated_prob: 0.61,
  wilson_lb_95: 0.44,
  sample_size_n: 12,
  oos_sample_n: 5,
  win_rate: 0.75,
  expectancy_net: 0.0325,
  profit_factor: 1.65,
  max_drawdown_mae: -0.115,
  oos_consistency_score: 0.72,
  triggers: [
    { metric: 'P/L', actual: '6.2x', rule: '<= 12x' },
    { metric: 'RSI 14d', actual: '34.1', rule: '<= 38' },
  ],
};

describe('SignalExplainabilityCard', () => {
  it('blocks strong certainty badge visually when N < 20 and shows triggers', () => {
    const onSelect = vi.fn();
    render(<SignalExplainabilityCard opportunity={SAMPLE_OPPORTUNITY} onSelectTicker={onSelect} />);

    expect(screen.getByText('VALE3')).toBeInTheDocument();
    expect(screen.getByText('EM OBSERVAÇÃO (AMOSTRA)')).toBeInTheDocument();
    expect(screen.getByText(/Selo forte bloqueado/i)).toBeInTheDocument();
    expect(screen.getByText('44.0%')).toBeInTheDocument();
    expect(screen.getByText('+3.25%')).toBeInTheDocument();
    expect(screen.getByText('-11.5%')).toBeInTheDocument();
    expect(screen.getByText(/P\/L:/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('VALE3'));
    expect(onSelect).toHaveBeenCalledWith('VALE3');
  });

  it('displays ALTA CERTEZA when statistically validated', () => {
    render(
      <SignalExplainabilityCard
        opportunity={{
          ...SAMPLE_OPPORTUNITY,
          confidence_tier: 'ALTA_CERTEZA',
          sample_size_n: 36,
          oos_sample_n: 14,
          wilson_lb_95: 0.62,
        }}
      />
    );

    expect(screen.getByText('ALTA CERTEZA')).toBeInTheDocument();
    expect(screen.queryByText(/Selo forte bloqueado/i)).not.toBeInTheDocument();
    expect(screen.getByText('62.0%')).toBeInTheDocument();
  });
});
