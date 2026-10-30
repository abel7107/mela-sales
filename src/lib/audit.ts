import { Prisma } from '@prisma/client';
import { prisma, Tx } from './prisma';

export interface Ctx {
  businessId: string;
  userId: string;
  ip?: string;
}

/** Pass the transaction client so the audit row commits or rolls back with the change. */
export async function audit(
  db: Tx | typeof prisma,
  ctx: Partial<Ctx>,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: {
      businessId: ctx.businessId ?? null,
      userId: ctx.userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      meta: meta ?? Prisma.JsonNull,
      ip: ctx.ip ?? null,
    },
  });
}
