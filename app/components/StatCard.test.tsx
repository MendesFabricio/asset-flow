import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DollarSign } from 'lucide-react';
import { StatCard } from './StatCard';

const mockUsePrivacy = vi.fn(() => ({ isHidden: false, togglePrivacy: vi.fn() }));

vi.mock('../context/PrivacyContext', () => ({
  usePrivacy: () => mockUsePrivacy(),
}));

describe('StatCard', () => {
  it('displays dailyResult when privacy mode is off and masks it when privacy mode is on', () => {
    mockUsePrivacy.mockReturnValue({ isHidden: false, togglePrivacy: vi.fn() });
    const { rerender } = render(
      <StatCard
        title="Patrimônio"
        value="R$ 10.000,00"
        icon={DollarSign}
        colorClass="text-emerald-400"
        subtext="Total atual"
        dailyResult={250.5}
      />
    );

    expect(screen.getByText(/250,50/)).toBeInTheDocument();
    expect(screen.queryByText('R$ •••••')).not.toBeInTheDocument();

    mockUsePrivacy.mockReturnValue({ isHidden: true, togglePrivacy: vi.fn() });
    rerender(
      <StatCard
        title="Patrimônio"
        value="R$ •••••"
        icon={DollarSign}
        colorClass="text-emerald-400"
        subtext="Total atual"
        dailyResult={250.5}
      />
    );

    expect(screen.queryByText(/250,50/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/R\$ •••••/)).toHaveLength(2);
  });
});
