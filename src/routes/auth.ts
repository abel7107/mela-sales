import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { env } from '../config/env';
import { audit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ctxOf, clearSession, issueSession, requireAuth, verifyMelaToken } from '../middleware/auth';
import { authLimiter } from '../middleware/misc';

export const authRouter = Router();

const password = z.string().min(10).max(128);
const email = z.string().trim().toLowerCase().max(200).pipe(z.email());
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

let dummyHash: Promise<string> | undefined;
const getDummy = () => (dummyHash ??= argon2.hash('timing-equalizer-password', { type: argon2.argon2id }));
const hashPw = (p: string) => argon2.hash(p, { type: argon2.argon2id });

const publicUser = (u: { id: string; name: string; email: string; role: string; businessId: string }) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, businessId: u.businessId,
});

authRouter.post('/register', authLimiter, async (req, res) => {
  if (env.AUTH_MODE === 'mela') throw new AppError(403, 'AUTH_MODE_DISABLED');
  if (!env.ALLOW_REGISTRATION) throw new AppError(403, 'REGISTRATION_DISABLED');
  const b = z.object({ businessName: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(120), email, password }).parse(req.body);
  const passwordHash = await hashPw(b.password);
  const user = await prisma.$transaction(async (tx) => {
    const biz = await tx.business.create({ data: { name: b.businessName } });
    const u = await tx.user.create({ data: { businessId: biz.id, name: b.name, email: b.email, passwordHash, role: 'OWNER' } });
    await audit(tx, { businessId: biz.id, userId: u.id, ip: req.ip }, 'auth.register', 'User', u.id);
    return u;
  });
  const csrfToken = issueSession(res, user);
  res.status(201).json({ user: publicUser(user), csrfToken });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  if (env.AUTH_MODE === 'mela') throw new AppError(403, 'AUTH_MODE_DISABLED');
  const b = z.object({ email, password: z.string().min(1).max(128) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: b.email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new AppError(429, 'ACCOUNT_LOCKED');

  let ok = false;
  if (user?.passwordHash && user.active) ok = await argon2.verify(user.passwordHash, b.password);
  else await argon2.verify(await getDummy(), b.password); // equalize timing

  if (!ok || !user) {
    if (user) {
      const fails = user.failedLogins + 1;
      const lock = fails >= MAX_FAILS;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: lock ? 0 : fails, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : null },
      });
      await audit(prisma, { businessId: user.businessId, userId: user.id, ip: req.ip }, lock ? 'auth.locked' : 'auth.login_failed', 'User', user.id);
    }
    throw new AppError(401, 'INVALID_CREDENTIALS');
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await audit(prisma, { businessId: user.businessId, userId: user.id, ip: req.ip }, 'auth.login', 'User', user.id);
  const csrfToken = issueSession(res, user);
  res.json({ user: publicUser(user), csrfToken });
});

/** Exchange a Mela Auth token for a Mela Sales session. */
authRouter.post('/mela', authLimiter, async (req, res) => {
  if (env.AUTH_MODE === 'local') throw new AppError(403, 'AUTH_MODE_DISABLED');
  const b = z.object({ token: z.string().min(10).max(4000), businessName: z.string().trim().min(1).max(200).optional() }).parse(req.body);
  const claims = verifyMelaToken(b.token);
  const claimEmail = claims.email?.trim().toLowerCase();

  let user = await prisma.user.findUnique({ where: { melaAuthId: claims.sub } });
  if (!user && claimEmail && claims.email_verified) {
    // Link an account an owner pre-created, only when Mela Auth vouches for the email.
    const pre = await prisma.user.findUnique({ where: { email: claimEmail } });
    if (pre && !pre.melaAuthId) user = await prisma.user.update({ where: { id: pre.id }, data: { melaAuthId: claims.sub } });
  }
  if (!user) {
    if (!b.businessName) throw new AppError(400, 'BUSINESS_NAME_REQUIRED');
    if (!claimEmail) throw new AppError(401, 'MELA_TOKEN_INVALID');
    user = await prisma.$transaction(async (tx) => {
      const biz = await tx.business.create({ data: { name: b.businessName! } });
      const u = await tx.user.create({
        data: { businessId: biz.id, name: claims.name ?? claimEmail, email: claimEmail, melaAuthId: claims.sub, role: 'OWNER' },
      });
      await audit(tx, { businessId: biz.id, userId: u.id, ip: req.ip }, 'auth.register', 'User', u.id, { via: 'mela' });
      return u;
    });
  }
  if (!user.active) throw new AppError(401, 'INVALID_CREDENTIALS');
  await audit(prisma, { businessId: user.businessId, userId: user.id, ip: req.ip }, 'auth.login', 'User', user.id, { via: 'mela' });
  const csrfToken = issueSession(res, user);
  res.json({ user: publicUser(user), csrfToken });
});

authRouter.post('/logout', async (req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export { hashPw, password as passwordSchema, email as emailSchema };
