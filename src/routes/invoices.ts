import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { t } from '../lib/i18n';
import { prisma } from '../lib/prisma';
import { idParam, paging } from '../lib/schemas';
import { ctxOf } from '../middleware/auth';
import { loadInvoice, renderInvoicePdf } from '../services/invoicePdf';

export const invoicesRouter = Router();
export const publicRouter = Router();

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

invoicesRouter.get('/', async (req, res) => {
  const q = paging.extend({ q: z.string().trim().max(40).optional() }).parse(req.query);
  const u = req.user!;
  const where = {
    businessId: u.businessId,
    ...(u.role === 'CASHIER' ? { sale: { cashierId: u.id } } : {}),
    ...(q.q ? { number: { contains: q.q } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: { issuedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit,
      include: { sale: { select: { id: true, total: true, amountPaid: true, status: true, paymentType: true, customer: { select: { id: true, name: true } } } } } }),
    prisma.invoice.count({ where }),
  ]);
  res.json({ data, total, page: q.page, limit: q.limit });
});

async function ownInvoice(req: Express.Request, id: string) {
  const u = req.user!;
  const inv = await loadInvoice({ id, businessId: u.businessId });
  if (!inv || (u.role === 'CASHIER' && inv.sale.cashierId !== u.id)) throw notFound('INVOICE_NOT_FOUND');
  return inv;
}

invoicesRouter.get('/:id', async (req, res) => {
  res.json(await ownInvoice(req, idParam(req.params.id)));
});

invoicesRouter.get('/:id/pdf', async (req, res) => {
  const inv = await ownInvoice(req, idParam(req.params.id));
  const pdf = await renderInvoicePdf(inv, req.lang);
  res.type('application/pdf')
    .set('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${inv.number}.pdf"`)
    .set('Cache-Control', 'private, no-store')
    .send(pdf);
});

/** Create an unguessable, expiring link plus ready-made Telegram / WhatsApp / email links. */
invoicesRouter.post('/:id/share', async (req, res) => {
  const inv = await ownInvoice(req, idParam(req.params.id));
  const b = z.object({ expiresInDays: z.number().int().min(1).max(90).default(14) }).parse(req.body ?? {});
  const token = randomBytes(32).toString('base64url');
  const ctx = ctxOf(req);
  const expiresAt = new Date(Date.now() + b.expiresInDays * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.invoiceShare.create({ data: { invoiceId: inv.id, tokenHash: sha256(token), expiresAt } });
    await audit(tx, ctx, 'invoice.share', 'Invoice', inv.id, { expiresAt: expiresAt.toISOString() });
  });
  const url = `${env.PUBLIC_BASE_URL}/api/v1/public/invoices/${token}`;
  const text = t(req.lang, 'invoice.shareText', { number: inv.number, business: inv.business.name });
  const enc = encodeURIComponent;
  res.status(201).json({
    url,
    expiresAt,
    links: {
      whatsapp: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
      telegram: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
      email: `mailto:${inv.sale.customer?.email ?? ''}?subject=${enc(text)}&body=${enc(url)}`,
    },
  });
});

invoicesRouter.delete('/:id/shares', async (req, res) => {
  const inv = await ownInvoice(req, idParam(req.params.id));
  const ctx = ctxOf(req);
  await prisma.$transaction(async (tx) => {
    await tx.invoiceShare.updateMany({ where: { invoiceId: inv.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, ctx, 'invoice.unshare', 'Invoice', inv.id);
  });
  res.status(204).end();
});

// ---- public (no session): access is by the random token only ----
publicRouter.get('/invoices/:token', async (req, res) => {
  const token = z.string().min(20).max(100).parse(req.params.token);
  const share = await prisma.invoiceShare.findUnique({ where: { tokenHash: sha256(token) } });
  if (!share || share.revokedAt || share.expiresAt < new Date()) throw new AppError(404, 'SHARE_LINK_INVALID');
  const inv = await loadInvoice({ id: share.invoiceId });
  if (!inv) throw new AppError(404, 'SHARE_LINK_INVALID');
  const pdf = await renderInvoicePdf(inv, req.lang);
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${inv.number}.pdf"`).set('Cache-Control', 'no-store').send(pdf);
});
