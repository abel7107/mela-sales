import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { GroupBy, bucketKey, localRangeToUtc } from '../lib/buckets';
import { AppError } from '../lib/errors';
import { D, Decimal, fromDb, toDb } from '../lib/money';
import { prisma } from '../lib/prisma';
import { dateOnly } from '../lib/schemas';
import { requireRole } from '../middleware/auth';

export const reportsRouter = Router();
reportsRouter.use(requireRole('OWNER'));

const rangeQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

function range(q: { from: string; to: string }) {
  const days = (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000;
  if (days < 0 || days > 366) throw new AppError(400, 'RANGE_TOO_LARGE');
  return localRangeToUtc(q.from, q.to, env.BUSINESS_TZ_OFFSET_MINUTES);
}

reportsRouter.get('/summary', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const r = range(q);
  const businessId = req.user!.businessId;
  const [sales, payments] = await Promise.all([
    prisma.sale.findMany({ where: { businessId, status: 'COMPLETED', createdAt: r }, select: { createdAt: true, paymentType: true, total: true, discountTotal: true, taxTotal: true } }),
    prisma.payment.findMany({ where: { businessId, receivedAt: r, sale: { status: 'COMPLETED' } }, select: { receivedAt: true, amount: true } }),
  ]);
  const zero = () => ({ count: 0, total: D(0), cash: D(0), credit: D(0), discount: D(0), tax: D(0), paymentsReceived: D(0) });
  const totals = zero();
  const buckets = new Map<string, ReturnType<typeof zero>>();
  const get = (k: string) => buckets.get(k) ?? (buckets.set(k, zero()), buckets.get(k)!);
  for (const s of sales) {
    for (const b of [totals, get(bucketKey(s.createdAt, q.groupBy as GroupBy, env.BUSINESS_TZ_OFFSET_MINUTES))]) {
      const t = fromDb(s.total);
      b.count++; b.total = b.total.plus(t);
      if (s.paymentType === 'CASH') b.cash = b.cash.plus(t); else b.credit = b.credit.plus(t);
      b.discount = b.discount.plus(fromDb(s.discountTotal));
      b.tax = b.tax.plus(fromDb(s.taxTotal));
    }
  }
  for (const p of payments) {
    for (const b of [totals, get(bucketKey(p.receivedAt, q.groupBy as GroupBy, env.BUSINESS_TZ_OFFSET_MINUTES))]) {
      b.paymentsReceived = b.paymentsReceived.plus(fromDb(p.amount));
    }
  }
  const out = (b: ReturnType<typeof zero>) => ({
    salesCount: b.count, total: toDb(b.total), cashTotal: toDb(b.cash), creditTotal: toDb(b.credit),
    discountTotal: toDb(b.discount), taxTotal: toDb(b.tax), paymentsReceived: toDb(b.paymentsReceived),
  });
  res.json({
    from: q.from, to: q.to, groupBy: q.groupBy, ...out(totals),
    buckets: [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, b]) => ({ period, ...out(b) })),
  });
});

reportsRouter.get('/overdue', async (req, res) => {
  const businessId = req.user!.businessId;
  const rows = await prisma.sale.findMany({
    where: { businessId, paymentType: 'CREDIT', status: 'COMPLETED', dueDate: { lt: new Date() } },
    orderBy: { dueDate: 'asc' },
    include: { customer: { select: { id: true, name: true, phone: true, email: true } }, invoice: { select: { number: true } } },
  });
  const data = rows
    .map((s) => ({ ...s, balance: toDb(fromDb(s.total).minus(fromDb(s.amountPaid))) }))
    .filter((s) => D(s.balance).gt(0));
  res.json({ data });
});

const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // block spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

reportsRouter.get('/sales.csv', async (req, res) => {
  const q = rangeQuery.pick({ from: true, to: true }).parse(req.query);
  const r = range(q);
  const rows = await prisma.sale.findMany({
    where: { businessId: req.user!.businessId, createdAt: r },
    orderBy: { createdAt: 'asc' },
    include: { invoice: true, customer: { select: { name: true } } },
  });
  const head = ['invoice', 'date', 'customer', 'type', 'status', 'subtotal', 'discount', 'tax', 'total', 'paid', 'balance'];
  const lines = rows.map((s) =>
    [s.invoice?.number, s.createdAt.toISOString(), s.customer?.name ?? '', s.paymentType, s.status, s.subtotal, s.discountTotal, s.taxTotal, s.total, s.amountPaid,
      s.status === 'COMPLETED' ? fromDb(s.total).minus(fromDb(s.amountPaid)).toFixed(2) : '0.00'].map(csvCell).join(','));
  res.type('text/csv').set('Content-Disposition', `attachment; filename="sales_${q.from}_${q.to}.csv"`).send([head.join(','), ...lines].join('\n'));
});
