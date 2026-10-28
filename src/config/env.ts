import 'dotenv/config';
import { z } from 'zod';

const bool = (def: string) => z.string().default(def).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().default(8),
  AUTH_MODE: z.enum(['local', 'mela', 'both']).default('local'),
  ALLOW_REGISTRATION: bool('true'),
  MELA_AUTH_JWT_SECRET: z.string().optional(),
  MELA_AUTH_JWT_PUBLIC_KEY: z.string().optional(),
  MELA_AUTH_ISSUER: z.string().optional(),
  MELA_AUTH_AUDIENCE: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  TRUST_PROXY: bool('false'),
  UPLOAD_DIR: z.string().default('./uploads'),
  INVOICE_FONT_PATH: z.string().optional(),
  BUSINESS_TZ_OFFSET_MINUTES: z.coerce.number().default(180),
  ENABLE_SCHEDULER: bool('true'),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.issues);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
