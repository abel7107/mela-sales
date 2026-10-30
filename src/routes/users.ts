import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { idParam } from '../lib/schemas';
import { prisma } from '../lib/prisma';
import { ctxOf, requireRole } from '../middleware/auth';
import { emailSchema, hashPw, passwordSchema } from './auth';

export const usersRouter = Router();
usersRouter.use(requireRole('OWNER'));

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

usersRouter.get('/', async (req, res) => {
  res.json({ data: await prisma.user.findMany({ where: { businessId: req.user!.businessId }, select, orderBy: { createdAt: 'asc' } }) });
});

usersRouter.post('/', async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1).max(120),
    email: emailSchema,
    role: z.enum(['OWNER', 'CASHIER']).default('CASHIER'),
    password: passwordSchema.optional(), // omit when the user will sign in through Mela Auth
  }).parse(req.body);
  const ctx = ctxOf(req);
  const u = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { businessId: ctx.businessId, name: b.name, email: b.email, role: b.role, passwordHash: b.password ? await hashPw(b.password) : null },
      select,
    });
    await audit(tx, ctx, 'user.create', 'User', created.id, { role: b.role });
    return created;
  });
  res.status(201).json(u);
});

usersRouter.patch('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const b = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(['OWNER', 'CASHIER']).optional(),
    active: z.boolean().optional(),
  }).parse(req.body);
  const ctx = ctxOf(req);
  if (id === ctx.userId && (b.role !== undefined || b.active !== undefined)) throw new AppError(403, 'SELF_CHANGE_FORBIDDEN');
  const target = await prisma.user.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!target) throw notFound();
  const u = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: b, select });
    if (b.role && b.role !== target.role) await audit(tx, ctx, 'user.role_change', 'User', id, { from: target.role, to: b.role });
    if (b.active !== undefined && b.active !== target.active) await audit(tx, ctx, b.active ? 'user.activate' : 'user.deactivate', 'User', id);
    return updated;
  });
  res.json(u);
});
