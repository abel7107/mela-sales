import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { D, Decimal, fromDb, toDb } from '../lib/money';
import { prisma } from '../lib/prisma';
import { idParam, method, paging, positiveMoney } from '../lib/schemas';
import { ctxOf } from '../middleware/auth';
import { applyPaymentTx, customerBalances } from '../services/sales';

export const customersRouter = Router();

const base = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).nullable(),
  email: z.email().max(200).nullable(),
  address: z.string().trim().max(300).nullable(),
  note: z.string().trim().max(500).nullable(),
});
const createSchema = base.partial().required({ name: true });
const patchSchema = base.partial().extend({ active: z.boolean().optional() });

customersRouter.get('/', async (req, res) => {
  const q = paging.extend({ q: z.string().trim().max(100).optional(), owing: z.enum(['true']).optional() }).parse(req.query);
  const where = {
    businessId: req.user!.businessId,
    active: true,
    ...(q.q ? { OR: [{ name: { contains: q.q } }, { phone: { contains: q.q } }] } : {}),
  };
  const all = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } });
  const bal = await customerBalances(req.user!.businessId);
  let rows = all.map((c) => ({ ...c, balance: toDb(bal.get(c.id) ?? D(0)) }));
  if (q.owing) rows = rows.filter((r) => D(r.balance).gt(0));
  res.json({ data: rows.slice((q.page - 1) * q.limit, q.page * q.limit), total: rows.length, page: q.page, limit: q.limit });
});

customersRouter.post('/', async (req, res) => {
  const b = createSchema.parse(req.body);
  const ctx = ctxOf(req);
  const c = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({ data: { ...b, businessId: ctx.businessId } });
    await audit(tx, ctx, 'customer.create', 'Customer', created.id);
    return created;
  });
  res.status(201).json(c);
});

customersRouter.get('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const businessId = req.user!.businessId;
  const c = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!c) throw notFound('CUSTOMER_NOT_FOUND');
  const [bal, payments, openSales] = await Promise.all([
    customerBalances(businessId, [id]),
    prisma.payment.findMany({ where: { customerId: id, businessId }, orderBy: { receivedAt: 'desc' }, take: 100, include: { sale: { select: { invoice: { select: { number: true } } } } } }),
    prisma.sale.findMany({ where: { customerId: id, businessId, paymentType: 'CREDIT', status: 'COMPLETED' }, orderBy: { createdAt: 'asc' }, include: { invoice: { select: { number: true } } } }),
  ]);
  res.json({
    ...c,
    balance: toDb(bal.get(id) ?? D(0)),
    payments,
    openSales: openSales.filter((s) => fromDb(s.total).gt(fromDb(s.amountPaid))),
  });
});

customersRouter.patch('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const b = patchSchema.parse(req.body);
  const ctx = ctxOf(req);
  const c = await prisma.$transaction(async (tx) => {
    const n = await tx.customer.updateMany({ where: { id, businessId: ctx.businessId }, data: b });
    if (n.count === 0) throw notFound('CUSTOMER_NOT_FOUND');
    await audit(tx, ctx, 'customer.update', 'Customer', id, { fields: Object.keys(b) });
    return tx.customer.findUniqueOrThrow({ where: { id } });
  });
  res.json(c);
});

/** Pay down a customer's debt; allocated to the oldest open credit sales first. */
customersRouter.post('/:id/payments', async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ amount: positiveMoney, method: method.default('CASH'), note: z.string().trim().max(300).optional() }).parse(req.body);
  const ctx = ctxOf(req);
  const applied = await prisma.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id, businessId: ctx.businessId } });
    if (!c) throw notFound('CUSTOMER_NOT_FOUND');
    const open = await tx.sale.findMany({
      where: { businessId: ctx.businessId, customerId: id, paymentType: 'CREDIT', status: 'COMPLETED' },
      orderBy: { createdAt: 'asc' },
    });
    let remaining = D(b.amount);
    const out: { saleId: string; amount: string }[] = [];
    for (const s of open) {
      if (remaining.lte(0)) break;
      const due = fromDb(s.total).minus(fromDb(s.amountPaid));
      if (due.lte(0)) continue;
      const pay = Decimal.min(due, remaining);
      await applyPaymentTx(tx, ctx, s.id, pay, b.method, b.note);
      remaining = remaining.minus(pay);
      out.push({ saleId: s.id, amount: toDb(pay) });
    }
    if (remaining.gt(0)) throw new AppError(409, 'OVERPAYMENT');
    return out;
  });
  res.status(201).json({ applied });
});
