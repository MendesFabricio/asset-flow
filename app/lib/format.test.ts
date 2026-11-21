import { describe, it, expect } from 'vitest';
import { formatMoney, getStatusBg } from './format';

describe('formatMoney', () => {
    it('should format numbers correctly to BRL currency', () => {
        // We do a regex match to handle non-breaking spaces or different spaces returned by toLocaleString in jsdom/Node
        const result = formatMoney(1234.56);
        expect(result).toMatch(/R\$.*1[.,]234[.,]56/);
    });

    it('should handle zero correctly', () => {
        const result = formatMoney(0);
        expect(result).toMatch(/R\$.*0[.,]00/);
    });

    it('should handle falsy values (undefined/null) correctly', () => {
        // @ts-expect-error Testing invalid input
        expect(formatMoney(null)).toBe('R$ 0,00');
        // @ts-expect-error Testing invalid input
        expect(formatMoney(undefined)).toBe('R$ 0,00');
    });

    it('should handle negative numbers correctly', () => {
        const result = formatMoney(-1500.75);
        expect(result).toMatch(/-.*R\$.*1[.,]500[.,]75|R\$.*-.*1[.,]500[.,]75/);
    });
});

describe('getStatusBg', () => {
    it('should return green for COMPRA_FORTE', () => {
        expect(getStatusBg('COMPRA_FORTE')).toBe('bg-green-500');
    });

    it('should return blue for COMPRAR', () => {
        expect(getStatusBg('COMPRAR')).toBe('bg-blue-500');
    });

    it('should return yellow for AGUARDAR', () => {
        expect(getStatusBg('AGUARDAR')).toBe('bg-yellow-500');
    });

    it('should return slate for unknown status', () => {
        expect(getStatusBg('UNKNOWN')).toBe('bg-slate-600');
        expect(getStatusBg('')).toBe('bg-slate-600');
    });
});
