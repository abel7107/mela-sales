import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { idParam, saleItemInput } from '../lib/schemas';
import { ctxOf, requireRole } from '../middleware/auth';
import { runDuePlans } from '../services/recurring';

export const recurringRouter = Router();

const createSchema = z.object({
  customerId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  frequency: z.enum(['WEEKLY', 'MONTHLY']),
  startDate: z.coerce.date(),
  totalRuns: z.number().int().min(1).max(600).optional(), // omit = subscription with no end; set = installments
  items: z.array(saleItemInput).min(1).max(50),
});

recurringRouter.get('/', async (req, res) => {
  res.json({ data: await prisma.recurringPlan.findMany({ where: { businessId: req.user!.businessId }, orderBy: { createdAt: 'desc' }, include: { customer: { select: { id: true, name: true } } } }) });
});

recurringRouter.post('/', requireRole('OWNER'), async (req, res) => {
  const b = createSchema.parse(req.body);
  const ctx = ctxOf(req);
  const plan = await prisma.$transaction(async (tx) => {
    const c = await tx.customer.findFirst({ where: { id: b.customerId, businessId: ctx.businessId, active: true } });
    if (!c) throw notFound('CUSTOMER_NOT_FOUND');
    const created = await tx.recurringPlan.create({
      data: { businessId: ctx.businessId, customerId: b.customerId, title: b.title, frequency: b.frequency, startDate: b.startDate, nextRunAt: b.startDate, totalRuns: b.totalRuns ?? null, items: b.items as Prisma.InputJsonValue, createdById: ctx.userId },
    });
    await audit(tx, ctx, 'recurring.create', 'RecurringPlan', created.id);
    return created;
  });
  res.status(201).json(plan);
});

recurringRouter.get('/:id', async (req, res) => {
  const p = await prisma.recurringPlan.findFirst({
    where: { id: idParam(req.params.id), businessId: req.user!.businessId },
    include: { sales: { select: { id: true, total: true, createdAt: true, recurringRunNo: true, invoice: { select: { number: true } } }, orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!p) throw notFound('PLAN_NOT_FOUND');
  res.json(p);
});

recurringRouter.patch('/:id', requireRole('OWNER'), async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) }).parse(req.body);
  const ctx = ctxOf(req);
  const p = await prisma.$transaction(async (tx) => {
    const plan = await tx.recurringPlan.findFirst({ where: { id, businessId: ctx.businessId } });
    if (!plan) throw notFound('PLAN_NOT_FOUND');
    if (plan.status === 'CANCELLED' || plan.status === 'COMPLETED') throw new AppError(409, 'PLAN_STATE_INVALID');
    const updated = await tx.recurringPlan.update({ where: { id }, data: { status: b.status } });
    await audit(tx, ctx, 'recurring.status', 'RecurringPlan', id, { from: plan.status, to: b.status });
    return updated;
  });
  res.json(p);
});

/** Manual trigger (the scheduler does this automatically). Useful for ops and tests. */
recurringRouter.post('/run-due', requireRole('OWNER'), async (_req, res) => {
  res.json({ generated: await runDuePlans() });
});
