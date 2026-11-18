import { describe, expect, it } from 'vitest';
import { DASHBOARD_CONTENT_TABS, PORTFOLIO_ASSET_TABS } from './useDashboardState';

describe('dashboard tab constants', () => {
  it('keeps Renda Fixa in both content and portfolio asset tabs so fixed-income ETFs render below titles', () => {
    expect(DASHBOARD_CONTENT_TABS).toContain('Renda Fixa');
    expect(PORTFOLIO_ASSET_TABS).toContain('Renda Fixa');
  });
});
