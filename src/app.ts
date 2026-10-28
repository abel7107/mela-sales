import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { requireAuth } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { authLimiter, errorHandler, globalLimiter, langMiddleware, notFoundHandler, publicLimiter } from './middleware/misc';
import { auditRouter } from './routes/audit';
import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { customersRouter } from './routes/customers';
import { invoicesRouter, publicRouter } from './routes/invoices';
import { productsRouter } from './routes/products';
import { recurringRouter } from './routes/recurring';
import { reportsRouter } from './routes/reports';
import { salesRouter } from './routes/sales';
import { usersRouter } from './routes/users';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1); // behind the Docker/nginx reverse proxy (HTTPS terminates there)

  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
  }));
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(langMiddleware);
  app.use(globalLimiter);

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/public', publicLimiter, publicRouter);

  const api = express.Router();
  api.use(csrfProtection);
  api.use('/auth', authRouter);
  api.use(requireAuth); // everything below needs a session
  api.use('/users', usersRouter);
  api.use('/business', businessRouter);
  api.use('/products', productsRouter);
  api.use('/customers', customersRouter);
  api.use('/sales', salesRouter);
  api.use('/invoices', invoicesRouter);
  api.use('/reports', reportsRouter);
  api.use('/recurring', recurringRouter);
  api.use('/audit-logs', auditRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
