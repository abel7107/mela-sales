import Decimal from 'decimal.js';
import { AppError } from './errors';

// Money is ALWAYS decimal. Half-up rounding to 2 places, applied per line.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export const D = (v: Decimal.Value) => new Decimal(v);
export const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Convert a Prisma Decimal (or string) to decimal.js */
export const fromDb = (v: { toString(): string }) => new Decimal(v.toString());
/** String for Prisma Decimal(14,2) columns - never pass JS floats. */
export const toDb = (d: Decimal) => round2(d).toFixed(2);

export interface LineInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  discount: Decimal.Value;
  taxRate: Decimal.Value; // percent, e.g. 15 for 15%
}
export interface LineResult {
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
}

/** Tax-exclusive pricing: tax = round2((qty*price - discount) * rate / 100). */
export function calcLine(i: LineInput): LineResult {
  const gross = round2(D(i.quantity).mul(i.unitPrice));
  const discount = round2(D(i.discount));
  if (discount.gt(gross)) throw new AppError(400, 'DISCOUNT_EXCEEDS_LINE');
  const net = gross.minus(discount);
  const taxAmount = round2(net.mul(i.taxRate).div(100));
  return { gross, discount, net, taxAmount, lineTotal: net.plus(taxAmount) };
}

export function calcSale(lines: LineResult[]) {
  const sum = (f: (l: LineResult) => Decimal) => lines.reduce((a, l) => a.plus(f(l)), D(0));
  const subtotal = sum((l) => l.gross);
  const discountTotal = sum((l) => l.discount);
  const taxTotal = sum((l) => l.taxAmount);
  return { subtotal, discountTotal, taxTotal, total: subtotal.minus(discountTotal).plus(taxTotal) };
}

export function formatMoney(v: Decimal.Value): string {
  const [i, f] = round2(D(v)).toFixed(2).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f}`;
}
