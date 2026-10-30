import { z } from 'zod';
import { Decimal } from './money';

// Numbers arrive as strings (preferred) or JSON numbers, are validated by regex and kept as strings.
const toStr = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
export const money = toStr.pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'invalid amount'));
export const positiveMoney = money.refine((v) => new Decimal(v).gt(0), 'must be greater than 0');
export const quantity = toStr
  .pipe(z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, 'invalid quantity'))
  .refine((v) => new Decimal(v).gt(0), 'must be greater than 0');
export const quantityOrZero = toStr.pipe(z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, 'invalid quantity'));
export const signedQuantity = toStr
  .pipe(z.string().regex(/^-?\d{1,9}(\.\d{1,3})?$/, 'invalid quantity'))
  .refine((v) => !new Decimal(v).isZero(), 'must not be 0');
export const percent = toStr
  .pipe(z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'invalid percent'))
  .refine((v) => new Decimal(v).lte(100), 'max 100');

export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
export const method = z.enum(['CASH', 'BANK', 'MOBILE', 'OTHER']);
export const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const saleItemInput = z.object({
  productId: z.uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  quantity,
  unitPrice: money.optional(),
  discount: money.default('0'),
  taxRate: percent.optional(),
});

export const createSaleSchema = z.object({
  customerId: z.uuid().optional(),
  paymentType: z.enum(['CASH', 'CREDIT']),
  paymentMethod: method.default('CASH'),
  items: z.array(saleItemInput).min(1).max(200),
  initialPayment: money.optional(),
  dueDate: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});
export type SaleInput = z.infer<typeof createSaleSchema>;

export const idParam = (v: unknown) => z.uuid().parse(v);
