import { describe, it, expect } from 'vitest';
import { getTransactionDisplayMeta, computeReservaUpdate } from './EditModal';

describe('getTransactionDisplayMeta', () => {
  it('formats BUY and SELL transactions with localized labels', () => {
    const buy = getTransactionDisplayMeta({
      id: 1,
      type: 'BUY',
      quantity: 30,
      unit_price: 27.78,
      total_value: 833.4,
      date: '2023-05-19T00:00:00',
    });
    expect(buy.label).toBe('COMPRA');
    expect(buy.quantityDisplay).toBe(30);
    expect(buy.badgeClass).toContain('text-status-success');

    const sell = getTransactionDisplayMeta({
      id: 2,
      type: 'SELL',
      quantity: 10,
      unit_price: 30,
      total_value: 300,
      date: '2023-06-01T00:00:00',
    });
    expect(sell.label).toBe('VENDA');
    expect(sell.badgeClass).toContain('text-status-error');
  });

  it('shows delta and post-event balance for BONUS and SPLIT/INPLIT events', () => {
    const bonus = getTransactionDisplayMeta({
      id: 3,
      type: 'BONUS',
      quantity: 33,
      delta_quantity: 3,
      unit_price: 0,
      total_value: 0,
      date: '2022-04-06T00:00:00',
    });
    expect(bonus.label).toBe('BONIFICAÇÃO');
    expect(bonus.quantityDisplay).toBe('+3');
    expect(bonus.quantitySubtext).toBe('total 33');
    expect(bonus.badgeClass).toContain('text-accent');

    const split = getTransactionDisplayMeta({
      id: 4,
      type: 'SPLIT',
      quantity: 100,
      delta_quantity: 90,
      unit_price: 10,
      total_value: 0,
      date: '2023-01-05T00:00:00',
    });
    expect(split.label).toBe('DESDOBRAMENTO');
    expect(split.quantityDisplay).toBe('→ 100');

    const tickerIn = getTransactionDisplayMeta({
      id: 5,
      type: 'TICKER_CHANGE_IN',
      quantity: 15,
      unit_price: 39.9684,
      total_value: 599.53,
      date: '2025-06-10T00:00:00',
    });
    expect(tickerIn.label).toBe('CONVERSÃO (ENTRADA)');
  });
});

describe('computeReservaUpdate', () => {
  it('updates balance while preserving invested amount', () => {
    const res = computeReservaUpdate({
      currentBalance: 9384.41,
      currentInvested: 9259.75,
      mode: 'BALANCE',
      amount: 9500,
    });
    expect(res.error).toBeNull();
    expect(res.nextBalance).toBe(9500);
    expect(res.nextInvested).toBe(9259.75);
    expect(res.profit).toBe(240.25);
  });

  it('adds deposit to both balance and invested', () => {
    const res = computeReservaUpdate({
      currentBalance: 1245.48,
      currentInvested: 1000,
      mode: 'DEPOSIT',
      amount: 500,
    });
    expect(res.error).toBeNull();
    expect(res.nextBalance).toBe(1745.48);
    expect(res.nextInvested).toBe(1500);
    expect(res.profit).toBe(245.48);
  });

  it('withdraws proportionally and rejects amounts exceeding balance', () => {
    const partial = computeReservaUpdate({
      currentBalance: 2000,
      currentInvested: 1000,
      mode: 'WITHDRAW',
      amount: 500,
    });
    expect(partial.error).toBeNull();
    expect(partial.nextBalance).toBe(1500);
    expect(partial.nextInvested).toBe(750);

    const invalid = computeReservaUpdate({
      currentBalance: 1000,
      currentInvested: 800,
      mode: 'WITHDRAW',
      amount: 1200,
    });
    expect(invalid.error).toBeTruthy();
  });
});
