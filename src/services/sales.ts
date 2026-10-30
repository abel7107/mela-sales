import type { PaymentMethod } from '@prisma/client';
import { Ctx, audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { D, Decimal, calcLine, calcSale, fromDb, toDb } from '../lib/money';
import { Tx, prisma } from '../lib/prisma';
import type { SaleInput } from '../lib/schemas';

export async function createSaleTx(
  tx: Tx,
  ctx: Ctx,
  input: SaleInput,
  opts: { recurringPlanId?: string; runNo?: number } = {},
) {
  if (input.paymentType === 'CREDIT' && !input.customerId) throw new AppError(400, 'CREDIT_NEEDS_CUSTOMER');

  if (input.customerId) {
    const c = await tx.customer.findFirst({ where: { id: input.customerId, businessId: ctx.businessId, active: true } });
    if (!c) throw notFound('CUSTOMER_NOT_FOUND');
  }

  const ids = [...new Set(input.items.map((i) => i.productId).filter((x): x is string => !!x))];
  const products = await tx.product.findMany({ where: { id: { in: ids }, businessId: ctx.businessId, active: true } });
  if (products.length !== ids.length) throw new AppError(400, 'PRODUCT_NOT_FOUND');
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = input.items.map((i) => {
    const p = i.productId ? byId.get(i.productId) : undefined;
    const name = i.name ?? p?.name;
    if (!name) throw new AppError(400, 'ITEM_NAME_REQUIRED');
    const unitPrice = i.unitPrice ?? p?.price.toString();
    if (unitPrice === undefined) throw new AppError(400, 'ITEM_PRICE_REQUIRED');
    const taxRate = i.taxRate ?? p?.taxRate.toString() ?? '0';
    const calc = calcLine({ quantity: i.quantity, unitPrice, discount: i.discount, taxRate });
    return { product: p, name, quantity: i.quantity, unitPrice, discount: i.discount, taxRate, calc };
  });
  const totals = calcSale(lines.map((l) => l.calc));

  // Stock deduction (guarded so stock can never go negative, even under concurrency)
  const need = new Map<string, Decimal>();
  for (const l of lines) {
    if (l.product?.trackStock && !l.product.isService) {
      need.set(l.product.id, (need.get(l.product.id) ?? D(0)).plus(l.quantity));
    }
  }
  for (const [productId, qty] of need) {
    const r = await tx.product.updateMany({
      where: { id: productId, businessId: ctx.businessId, stockQty: { gte: qty.toFixed(3) } },
      data: { stockQty: { decrement: qty.toFixed(3) } },
    });
    if (r.count === 0) throw new AppError(409, 'INSUFFICIENT_STOCK');
  }

  const paid = input.paymentType === 'CASH' ? totals.total : D(input.initialPayment ?? 0);
  if (paid.gt(totals.total)) throw new AppError(400, 'INITIAL_PAYMENT_TOO_HIGH');

  // Atomic per-business invoice sequence (row lock held until commit => no gaps, no duplicates)
  const b = await tx.business.update({
    where: { id: ctx.businessId },
    data: { invoiceCounter: { increment: 1 } },
    select: { invoiceCounter: true, invoicePrefix: true },
  });
  const number = `${b.invoicePrefix}-${new Date().getUTCFullYear()}-${String(b.invoiceCounter).padStart(6, '0')}`;

  const sale = await tx.sale.create({
    data: {
      businessId: ctx.businessId,
      customerId: input.customerId ?? null,
      cashierId: ctx.userId,
      paymentType: input.paymentType,
      status: 'COMPLETED',
      subtotal: toDb(totals.subtotal),
      discountTotal: toDb(totals.discountTotal),
      taxTotal: toDb(totals.taxTotal),
      total: toDb(totals.total),
      amountPaid: toDb(paid),
      dueDate: input.dueDate ?? null,
      note: input.note ?? null,
      recurringPlanId: opts.recurringPlanId ?? null,
      recurringRunNo: opts.runNo ?? null,
      items: {
        create: lines.map((l) => ({
          productId: l.product?.id ?? null,
          name: l.name,
          quantity: D(l.quantity).toFixed(3),
          unitPrice: D(l.unitPrice).toFixed(2),
          discount: toDb(l.calc.discount),
          taxRate: D(l.taxRate).toFixed(2),
          taxAmount: toDb(l.calc.taxAmount),
          lineTotal: toDb(l.calc.lineTotal),
        })),
      },
    },
    include: { items: true },
  });
  const invoice = await tx.invoice.create({ data: { businessId: ctx.businessId, saleId: sale.id, number } });

  if (paid.gt(0)) {
    await tx.payment.create({
      data: {
        businessId: ctx.businessId,
        saleId: sale.id,
        customerId: input.customerId ?? null,
        amount: toDb(paid),
        method: input.paymentMethod,
        createdById: ctx.userId,
      },
    });
  }
  await audit(tx, ctx, 'sale.create', 'Sale', sale.id, {
    invoice: number,
    total: toDb(totals.total),
    paymentType: input.paymentType,
    ...(opts.recurringPlanId ? { recurringPlanId: opts.recurringPlanId, run: opts.runNo ?? null } : {}),
  });
  return { ...sale, invoice };
}

/** Append a payment to one credit sale. Guarded in SQL so concurrent requests cannot overpay. */
export async function applyPaymentTx(
  tx: Tx,
  ctx: Ctx,
  saleId: string,
  amount: Decimal,
  method: PaymentMethod,
  note?: string,
) {
  const sale = await tx.sale.findFirst({ where: { id: saleId, businessId: ctx.businessId } });
  if (!sale) throw notFound('SALE_NOT_FOUND');
  if (sale.status !== 'COMPLETED') throw new AppError(409, 'SALE_VOIDED');
  if (sale.paymentType !== 'CREDIT') throw new AppError(409, 'NOT_CREDIT_SALE');
  const amt = toDb(amount);
  // CAST keeps the arithmetic in DECIMAL (a bare string parameter would be coerced to DOUBLE).
  const n = await tx.$executeRaw`UPDATE Sale SET amountPaid = amountPaid + CAST(${amt} AS DECIMAL(14,2))
    WHERE id = ${saleId} AND businessId = ${ctx.businessId} AND status = 'COMPLETED'
    AND amountPaid + CAST(${amt} AS DECIMAL(14,2)) <= total`;
  if (n === 0) throw new AppError(409, 'OVERPAYMENT');
  const p = await tx.payment.create({
    data: {
      businessId: ctx.businessId,
      saleId,
      customerId: sale.customerId,
      amount: amt,
      method,
      note: note ?? null,
      createdById: ctx.userId,
    },
  });
  await audit(tx, ctx, 'payment.create', 'Payment', p.id, { saleId, amount: amt });
  return p;
}

/** Void = status change + reason + audit entry. Rows are never deleted. */
export async function voidSale(ctx: Ctx, saleId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.sale.updateMany({
      where: { id: saleId, businessId: ctx.businessId, status: 'COMPLETED' },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: reason, voidedById: ctx.userId },
    });
    if (r.count === 0) {
      const exists = await tx.sale.findFirst({ where: { id: saleId, businessId: ctx.businessId }, select: { id: true } });
      throw exists ? new AppError(409, 'ALREADY_VOIDED') : notFound('SALE_NOT_FOUND');
    }
    const items = await tx.saleItem.findMany({ where: { saleId }, include: { product: true } });
    for (const i of items) {
      if (i.product?.trackStock && !i.product.isService) {
        await tx.product.update({ where: { id: i.product.id }, data: { stockQty: { increment: i.quantity.toString() } } });
      }
    }
    await audit(tx, ctx, 'sale.void', 'Sale', saleId, { reason });
    return tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: true, invoice: true } });
  });
}

export async function customerBalances(businessId: string, ids?: string[]) {
  const g = await prisma.sale.groupBy({
    by: ['customerId'],
    where: {
      businessId,
      paymentType: 'CREDIT',
      status: 'COMPLETED',
      customerId: ids ? { in: ids } : { not: null },
    },
    _sum: { total: true, amountPaid: true },
  });
  const m = new Map<string, Decimal>();
  for (const r of g) {
    if (r.customerId) m.set(r.customerId, fromDb(r._sum.total ?? 0).minus(fromDb(r._sum.amountPaid ?? 0)));
  }
  return m;
}
