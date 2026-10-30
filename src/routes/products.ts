import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { Decimal } from '../lib/money';
import { prisma } from '../lib/prisma';
import { idParam, money, paging, percent, quantityOrZero, signedQuantity } from '../lib/schemas';
import { ctxOf, requireRole } from '../middleware/auth';

export const productsRouter = Router();

const base = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(64).nullable(), // also use for barcode values
  price: money,
  taxRate: percent,
  isService: z.boolean(),
  trackStock: z.boolean(),
  lowStockAt: quantityOrZero.nullable(),
});
const createSchema = base.partial().required({ name: true, price: true }).extend({ stockQty: quantityOrZero.optional() });
const patchSchema = base.partial().extend({ active: z.boolean().optional() });

productsRouter.get('/', async (req, res) => {
  const q = paging.extend({ q: z.string().trim().max(100).optional(), active: z.enum(['true', 'false']).optional() }).parse(req.query);
  const where = {
    businessId: req.user!.businessId,
    ...(q.active ? { active: q.active === 'true' } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q } }, { sku: q.q }] } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.product.count({ where }),
  ]);
  res.json({ data, total, page: q.page, limit: q.limit });
});

productsRouter.get('/low-stock', requireRole('OWNER'), async (req, res) => {
  const rows = await prisma.$queryRaw`SELECT id, name, sku, stockQty, lowStockAt FROM Product
    WHERE businessId = ${req.user!.businessId} AND active = true AND trackStock = true
    AND lowStockAt IS NOT NULL AND stockQty <= lowStockAt ORDER BY name`;
  res.json({ data: rows });
});

productsRouter.post('/', requireRole('OWNER'), async (req, res) => {
  const b = createSchema.parse(req.body);
  const ctx = ctxOf(req);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...b, businessId: ctx.businessId } });
    await audit(tx, ctx, 'product.create', 'Product', created.id);
    return created;
  });
  res.status(201).json(p);
});

productsRouter.patch('/:id', requireRole('OWNER'), async (req, res) => {
  const id = idParam(req.params.id);
  const b = patchSchema.parse(req.body);
  const ctx = ctxOf(req);
  const r = await prisma.$transaction(async (tx) => {
    const n = await tx.product.updateMany({ where: { id, businessId: ctx.businessId }, data: b });
    if (n.count === 0) throw notFound();
    await audit(tx, ctx, 'product.update', 'Product', id, { fields: Object.keys(b) });
    return tx.product.findUniqueOrThrow({ where: { id } });
  });
  res.json(r);
});

// Stock corrections are explicit and audited (sales/voids adjust stock automatically).
productsRouter.post('/:id/stock', requireRole('OWNER'), async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ delta: signedQuantity, reason: z.string().trim().min(1).max(200) }).parse(req.body);
  const ctx = ctxOf(req);
  const delta = new Decimal(b.delta);
  const r = await prisma.$transaction(async (tx) => {
    const n = await tx.product.updateMany({
      where: { id, businessId: ctx.businessId, trackStock: true, ...(delta.isNeg() ? { stockQty: { gte: delta.abs().toFixed(3) } } : {}) },
      data: { stockQty: { increment: delta.toFixed(3) } },
    });
    if (n.count === 0) throw new AppError(409, 'INSUFFICIENT_STOCK');
    await audit(tx, ctx, 'product.stock_adjust', 'Product', id, { delta: b.delta, reason: b.reason });
    return tx.product.findUniqueOrThrow({ where: { id } });
  });
  res.json(r);
});
