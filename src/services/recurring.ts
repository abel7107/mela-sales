import { prisma } from '../lib/prisma';
import { runDate } from '../lib/recurrence';
import { createSaleSchema } from '../lib/schemas';
import { createSaleTx } from './sales';

/**
 * Generates due recurring invoices. Safe to run from several processes:
 * each run is claimed with a guarded UPDATE (runsDone must still match) inside the same
 * transaction that creates the sale, and (recurringPlanId, recurringRunNo) is UNIQUE.
 */
export async function runDuePlans(now = new Date()): Promise<number> {
  let generated = 0;
  const plans = await prisma.recurringPlan.findMany({
    where: { status: 'ACTIVE', nextRunAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  for (const { id } of plans) {
    try {
      for (let i = 0; i < 12; i++) { // catch up at most 12 missed periods per tick
        const made = await prisma.$transaction(async (tx) => {
          const plan = await tx.recurringPlan.findUnique({ where: { id } });
          if (!plan || plan.status !== 'ACTIVE' || plan.nextRunAt > now) return false;
          const runNo = plan.runsDone + 1;
          const finished = plan.totalRuns != null && runNo >= plan.totalRuns;
          const claimed = await tx.recurringPlan.updateMany({
            where: { id: plan.id, runsDone: plan.runsDone, status: 'ACTIVE' },
            data: {
              runsDone: runNo,
              nextRunAt: runDate(plan.startDate, plan.frequency, runNo),
              status: finished ? 'COMPLETED' : 'ACTIVE',
            },
          });
          if (claimed.count !== 1) return false;
          const input = createSaleSchema.parse({
            customerId: plan.customerId,
            paymentType: 'CREDIT',
            items: plan.items,
            note: `${plan.title} #${runNo}`,
          });
          await createSaleTx(tx, { businessId: plan.businessId, userId: plan.createdById }, input, {
            recurringPlanId: plan.id,
            runNo,
          });
          return true;
        });
        if (!made) break;
        generated++;
      }
    } catch (e) {
      // e.g. customer deactivated or stock too low: leave the plan as is, retry next tick
      console.error(JSON.stringify({ level: 'error', msg: 'recurring run failed', planId: id, err: String(e) }));
    }
  }
  return generated;
}

export function startScheduler(intervalSeconds: number) {
  const tick = () => runDuePlans().catch((e) => console.error('scheduler error', e));
  const h = setInterval(tick, intervalSeconds * 1000);
  h.unref();
  setTimeout(tick, 5_000).unref();
  return h;
}
