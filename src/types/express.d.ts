import type { Role } from '@prisma/client';
import type { Lang } from '../lib/i18n';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; businessId: string; role: Role; name: string; email: string };
      lang: Lang;
    }
  }
}
export {};
