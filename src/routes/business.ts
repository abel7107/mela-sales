import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../lib/audit';
import { AppError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { sniffImage, storage } from '../lib/storage';
import { ctxOf, requireRole } from '../middleware/auth';

export const businessRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1_000_000, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, ['image/png', 'image/jpeg'].includes(f.mimetype)),
});

const publicBiz = { id: true, name: true, phone: true, email: true, address: true, tin: true, currency: true, invoicePrefix: true, logoFile: true } as const;

businessRouter.get('/', async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.user!.businessId }, select: publicBiz });
  if (!b) throw notFound();
  const { logoFile, ...rest } = b;
  res.json({ ...rest, hasLogo: !!logoFile });
});

businessRouter.patch('/', requireRole('OWNER'), async (req, res) => {
  const b = z.object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).nullable(),
    email: z.email().max(200).nullable(),
    address: z.string().trim().max(300).nullable(),
    tin: z.string().trim().max(50).nullable(),
    invoicePrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/),
  }).partial().parse(req.body);
  const ctx = ctxOf(req);
  await prisma.$transaction(async (tx) => {
    await tx.business.update({ where: { id: ctx.businessId }, data: b });
    await audit(tx, ctx, 'business.update', 'Business', ctx.businessId, { fields: Object.keys(b) });
  });
  res.json({ ok: true });
});

businessRouter.post('/logo', requireRole('OWNER'), upload.single('logo'), async (req, res) => {
  const f = req.file;
  const ext = f ? sniffImage(f.buffer) : null;
  if (!f || !ext) throw new AppError(400, 'UPLOAD_INVALID');
  const ctx = ctxOf(req);
  const old = await prisma.business.findUnique({ where: { id: ctx.businessId }, select: { logoFile: true } });
  const name = await storage.save(f.buffer, ext);
  await prisma.business.update({ where: { id: ctx.businessId }, data: { logoFile: name } });
  if (old?.logoFile) await storage.remove(old.logoFile).catch(() => undefined);
  await audit(prisma, ctx, 'business.logo', 'Business', ctx.businessId);
  res.status(204).end();
});

// Files are only served after the permission check (must be signed in, own business only).
businessRouter.get('/logo', async (req, res) => {
  const b = await prisma.business.findUnique({ where: { id: req.user!.businessId }, select: { logoFile: true } });
  if (!b?.logoFile) throw notFound();
  res.type(b.logoFile.endsWith('.png') ? 'image/png' : 'image/jpeg').set('Cache-Control', 'private, max-age=300').send(await storage.read(b.logoFile));
});
