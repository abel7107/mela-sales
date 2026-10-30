import { ErrorRequestHandler, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';
import { pickLang, t } from '../lib/i18n';

export const langMiddleware: RequestHandler = (req, _res, next) => {
  req.lang = pickLang(req.header('accept-language'), typeof req.query.lang === 'string' ? req.query.lang : undefined);
  next();
};

const limiter = (limit: number, windowMs = 15 * 60_000) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED')),
  });
export const globalLimiter = limiter(600);
export const authLimiter = limiter(10); // login / register / mela exchange
export const publicLimiter = limiter(60); // public share links

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND'));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const lang = req.lang ?? 'en';
  const send = (status: number, code: string, extra: object = {}, params = {}) => {
    res.status(status).json({ error: { code, message: t(lang, `error.${code}`, params), ...extra } });
  };
  if (err instanceof AppError) return send(err.status, err.code, {}, err.params);
  if (err instanceof ZodError) {
    return send(400, 'VALIDATION_ERROR', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return send(409, 'DUPLICATE');
  if (err instanceof multer.MulterError) return send(400, 'UPLOAD_INVALID');
  if (err?.type === 'entity.parse.failed') return send(400, 'VALIDATION_ERROR');
  console.error(JSON.stringify({ level: 'error', msg: String(err?.message ?? err), stack: err?.stack }));
  return send(500, 'INTERNAL');
};
