import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { localRangeToUtc } from '../lib/buckets';
import { env } from '../config/env';
import { D } from '../lib/money';
import { prisma } from '../lib/prisma';
import { createSaleSchema, dateOnly, idParam, method, paging, positiveMoney } from '../lib/schemas';
import { ctxOf, requireRole } from '../middleware/auth';
import { applyPaymentTx, createSaleTx, voidSale } from '../services/sales';
import { Prisma } from '@prisma/client';

export const salesRouter = Router();

const listQuery = paging.extend({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  customerId: z.uuid().optional(),
  status: z.enum(['COMPLETED', 'VOIDED']).optional(),
  paymentType: z.enum(['CASH', 'CREDIT']).optional(),
});

export function salesWhere(req: { user?: { businessId: string; role: string; id: string } }, q: z.infer<typeof listQuery>): Prisma.SaleWhereInput {
  const u = req.user!;
  return {
    businessId: u.businessId,
    ...(u.role === 'CASHIER' ? { cashierId: u.id } : {}), // cashiers only see their own sales
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.paymentType ? { paymentType: q.paymentType } : {}),
    ...(q.from || q.to
      ? { createdAt: localRangeToUtc(q.from ?? q.to!, q.to ?? q.from!, env.BUSINESS_TZ_OFFSET_MINUTES) }
      : {}),
  };
}

salesRouter.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const where = salesWhere(req, q);
  const [data, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { invoice: { select: { id: true, number: true } }, customer: { select: { id: true, name: true } } },
    }),
    prisma.sale.count({ where }),
  ]);
  res.json({ data, total, page: q.page, limit: q.limit });
});

salesRouter.post('/', async (req, res) => {
  const input = createSaleSchema.parse(req.body);
  const ctx = ctxOf(req);
  const sale = await prisma.$transaction((tx) => createSaleTx(tx, ctx, input));
  res.status(201).json(sale);
});

salesRouter.get('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const u = req.user!;
  const sale = await prisma.sale.findFirst({
    where: { id, businessId: u.businessId, ...(u.role === 'CASHIER' ? { cashierId: u.id } : {}) },
    include: { items: true, invoice: true, payments: { orderBy: { receivedAt: 'asc' } }, customer: true },
  });
  if (!sale) throw notFound('SALE_NOT_FOUND');
  res.json(sale);
});

// Only harmless metadata may change after the fact. Money fields are immutable: void and re-issue instead.
salesRouter.patch('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ note: z.string().trim().max(500).nullable().optional(), dueDate: z.coerce.date().nullable().optional() }).strict().parse(req.body);
  const ctx = ctxOf(req);
  const u = req.user!;
  const sale = await prisma.$transaction(async (tx) => {
    const n = await tx.sale.updateMany({
      where: { id, businessId: ctx.businessId, status: 'COMPLETED', ...(u.role === 'CASHIER' ? { cashierId: u.id } : {}) },
      data: b,
    });
    if (n.count === 0) throw notFound('SALE_NOT_FOUND');
    await audit(tx, ctx, 'sale.update', 'Sale', id, { fields: Object.keys(b) });
    return tx.sale.findUniqueOrThrow({ where: { id } });
  });
  res.json(sale);
});

salesRouter.post('/:id/void', requireRole('OWNER'), async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
  res.json(await voidSale(ctxOf(req), id, b.reason));
});

salesRouter.post('/:id/payments', async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ amount: positiveMoney, method: method.default('CASH'), note: z.string().trim().max(300).optional() }).parse(req.body);
  const ctx = ctxOf(req);
  const p = await prisma.$transaction((tx) => applyPaymentTx(tx, ctx, id, D(b.amount), b.method, b.note));
  res.status(201).json(p);
});
