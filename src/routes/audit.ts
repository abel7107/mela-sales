import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { paging } from '../lib/schemas';
import { requireRole } from '../middleware/auth';

export const auditRouter = Router();
auditRouter.use(requireRole('OWNER'));

auditRouter.get('/', async (req, res) => {
  const q = paging.extend({ entity: z.string().max(40).optional(), entityId: z.string().max(64).optional(), action: z.string().max(60).optional() }).parse(req.query);
  const where = { businessId: req.user!.businessId, ...(q.entity ? { entity: q.entity } : {}), ...(q.entityId ? { entityId: q.entityId } : {}), ...(q.action ? { action: q.action } : {}) };
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ data, total, page: q.page, limit: q.limit });
});
