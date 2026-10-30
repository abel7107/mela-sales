import { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/errors';
import { CSRF_COOKIE, SESSION_COOKIE } from './auth';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT = new Set(['/auth/login', '/auth/register', '/auth/mela']);

/** Double-submit cookie. Only enforced when a session cookie is present (no cookie = no CSRF risk). */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method) || EXEMPT.has(req.path) || !req.cookies?.[SESSION_COOKIE]) return next();
  const header = req.header('x-csrf-token');
  const cookie = req.cookies[CSRF_COOKIE];
  if (!header || !cookie || header.length !== cookie.length ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))) {
    throw new AppError(403, 'CSRF_INVALID');
  }
  next();
};
