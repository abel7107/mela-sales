import { describe, expect, it } from 'vitest';
import { D, calcLine, calcSale, formatMoney } from '../src/lib/money';

describe('money', () => {
  it('never uses floating point (0.1 + 0.2)', () => {
    const l = calcLine({ quantity: 3, unitPrice: '0.10', discount: 0, taxRate: 0 });
    expect(l.lineTotal.toFixed(2)).toBe('0.30');
    expect(D('0.1').plus('0.2').toString()).toBe('0.3');
  });
  it('rounds tax half-up per line', () => {
    // 1.05 * 15% = 0.1575 -> 0.16 ; 0.10 * 5% = 0.005 -> 0.01
    expect(calcLine({ quantity: 1, unitPrice: '1.05', discount: 0, taxRate: 15 }).taxAmount.toFixed(2)).toBe('0.16');
    expect(calcLine({ quantity: 1, unitPrice: '0.10', discount: 0, taxRate: 5 }).taxAmount.toFixed(2)).toBe('0.01');
  });
  it('applies discount before tax', () => {
    const l = calcLine({ quantity: 2, unitPrice: '100.00', discount: '20.00', taxRate: 15 });
    expect(l.net.toFixed(2)).toBe('180.00');
    expect(l.taxAmount.toFixed(2)).toBe('27.00');
    expect(l.lineTotal.toFixed(2)).toBe('207.00');
  });
  it('supports fractional quantities', () => {
    expect(calcLine({ quantity: '2.5', unitPrice: '33.33', discount: 0, taxRate: 0 }).lineTotal.toFixed(2)).toBe('83.33'); // 83.325 half-up
  });
  it('rejects a discount larger than the line', () => {
    expect(() => calcLine({ quantity: 1, unitPrice: '10', discount: '10.01', taxRate: 0 })).toThrow();
  });
  it('sums totals from rounded lines (invoice always adds up)', () => {
    const a = calcLine({ quantity: 1, unitPrice: '1.05', discount: 0, taxRate: 15 });
    const b = calcLine({ quantity: 1, unitPrice: '1.05', discount: 0, taxRate: 15 });
    const t = calcSale([a, b]);
    expect(t.taxTotal.toFixed(2)).toBe('0.32');
    expect(t.total.toFixed(2)).toBe('2.42');
  });
  it('formats with thousands separators', () => {
    expect(formatMoney('1234567.5')).toBe('1,234,567.50');
  });
});
