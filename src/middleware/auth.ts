import { RequestHandler, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import type { Role } from '@prisma/client';
import { env, isProd } from '../config/env';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import type { Ctx } from '../lib/audit';

export const SESSION_COOKIE = 'mela_session';
export const CSRF_COOKIE = 'mela_csrf';

export function issueSession(res: Response, user: { id: string; businessId: string; role: Role }) {
  const maxAge = env.SESSION_TTL_HOURS * 3_600_000;
  const token = jwt.sign({ bid: user.businessId, role: user.role }, env.SESSION_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: Math.floor(maxAge / 1000),
  });
  const csrf = randomBytes(24).toString('base64url');
  const base = { secure: isProd, sameSite: 'lax' as const, maxAge, path: '/' };
  res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
  res.cookie(CSRF_COOKIE, csrf, { ...base, httpOnly: false }); // readable by the SPA, echoed in X-CSRF-Token
  return csrf;
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** Loads the user from the DB on every request so role changes and deactivation apply immediately. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw new AppError(401, 'UNAUTHENTICATED');
  let sub: string;
  try {
    const p = jwt.verify(token, env.SESSION_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    sub = String(p.sub);
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED');
  }
  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user || !user.active) throw new AppError(401, 'UNAUTHENTICATED');
  req.user = { id: user.id, businessId: user.businessId, role: user.role, name: user.name, email: user.email };
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw new AppError(403, 'FORBIDDEN');
    next();
  };

export const ctxOf = (req: Request): Ctx => ({
  businessId: req.user!.businessId,
  userId: req.user!.id,
  ip: req.ip,
});

export interface MelaClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export function verifyMelaToken(token: string): MelaClaims {
  const pub = env.MELA_AUTH_JWT_PUBLIC_KEY;
  const key = pub ?? env.MELA_AUTH_JWT_SECRET;
  if (!key) throw new AppError(503, 'MELA_AUTH_NOT_CONFIGURED');
  const opts: jwt.VerifyOptions = { algorithms: pub ? ['RS256', 'ES256'] : ['HS256'] };
  if (env.MELA_AUTH_ISSUER) opts.issuer = env.MELA_AUTH_ISSUER;
  if (env.MELA_AUTH_AUDIENCE) opts.audience = env.MELA_AUTH_AUDIENCE;
  try {
    const p = jwt.verify(token, key.replace(/\\n/g, '\n'), opts) as jwt.JwtPayload;
    if (!p.sub) throw new Error('no sub');
    return { sub: String(p.sub), email: p.email, email_verified: p.email_verified === true, name: p.name };
  } catch {
    throw new AppError(401, 'MELA_TOKEN_INVALID');
  }
}
