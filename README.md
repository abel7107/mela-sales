# Mela Sales – Backend

Daily sales tracking and invoices for small shops. TypeScript · Express 5 · Prisma · **MySQL only**.

## Quick start (local)

```bash
cp .env.example .env            # set SESSION_SECRET (openssl rand -base64 48)
docker compose up -d db         # or use any MySQL 8.4 LTS
npm install
npm run db:migrate -- --name init   # FIRST TIME ONLY: creates prisma/migrations/ — commit that folder
npm run dev                     # http://localhost:4000/health
npm test
```

Production (own VPS): `docker compose up -d --build` behind an HTTPS reverse proxy; set `NODE_ENV=production`
and `TRUST_PROXY=true`. The container runs `prisma migrate deploy` on start.

> **Note:** no migration files are shipped. Run `npm run db:migrate -- --name init` once against a dev database,
> review the generated SQL and commit `prisma/migrations/`. CI/Docker then use `migrate deploy`.

## Project layout

```
prisma/schema.prisma       data model (Decimal(14,2) for all money)
src/lib/money.ts           decimal math: tax, discount, rounding (half-up per line)
src/services/sales.ts      create sale, payments, void, stock, invoice numbering
src/services/recurring.ts  recurring-invoice generator + scheduler
src/services/invoicePdf.ts PDF invoice (pdfkit), English/Amharic labels
src/routes/*               HTTP endpoints (see docs/API.md)
src/middleware/*           auth/session, CSRF, rate limits, errors, language
src/i18n/{en,am}.json      all user-facing text (errors + invoice labels)
tests/                     Vitest: money/tax/rounding, recurrence dates, report buckets, i18n parity
scripts/                   MySQL backup + tested-restore scripts
```

## Standards checklist

| Standard | How it is met |
|---|---|
| MySQL only, own schema/migrations/backups | Prisma on MySQL 8.4; `scripts/backup.sh` + `scripts/restore-test.sh` |
| Free, permissive deps | express, prisma, zod, argon2, decimal.js, pdfkit, multer, jsonwebtoken, helmet… (MIT/Apache-2.0/BSD/ISC). Run `npx license-checker --summary` before release |
| GitHub flow | PR template, CI (typecheck, test, build), Dependabot. Enable branch protection + secret scanning in repo settings |
| English + Amharic | All text in `src/i18n`; `Accept-Language: am` or `?lang=am`. For Amharic PDFs set `INVOICE_FONT_PATH` to a Noto Sans Ethiopic `.ttf` |
| Docs | this README, `.env.example`, `docs/API.md`, `docs/USER_GUIDE.md`, `docs/RECURRING.md` |

## Security baseline mapping

- Argon2id password hashing; login lockout (5 fails → 15 min) + per-IP rate limits; timing-equalised login
- HttpOnly + Secure + SameSite cookies, double-submit CSRF token (`X-CSRF-Token`), Helmet (CSP, HSTS)
- Zod validation on every request; Prisma parameterized queries, raw SQL only via tagged (parameterized) templates
- RBAC (`OWNER`, `CASHIER`) and every query scoped by `businessId` from the session; user re-loaded from DB per request
- Secrets only in env; audit log for login, share, void, delete-like actions, role changes (written in the same DB transaction as the change)
- Logo upload: type + size limit, magic-byte sniffing, random storage name, served only through an authenticated endpoint
- Invoice share links: 256-bit random token, only its SHA-256 stored, expiry + revocation

## Design decisions

- **Money**: `DECIMAL(14,2)`, `decimal.js`, API accepts amounts as strings. Tax-exclusive pricing; tax rounded half-up **per line**; totals are sums of rounded lines so an invoice always adds up.
- **No silent edits**: money fields of a sale are immutable. Only `note`/`dueDate` can change. To correct a sale, void it (owner, with reason) and issue a new one. Voided sales and every payment row stay in the database; payments are append-only.
- **Customer balance** = Σ(total − amountPaid) over non-voided credit sales. Overpayment is blocked in SQL (race-safe).
- **Invoice numbers** `PREFIX-YYYY-000001`: per-business atomic counter inside the sale transaction → gap-free, unique.
- **Recurring payments**: see `docs/RECURRING.md`.
- **Auth**: `AUTH_MODE=local|mela|both`. `POST /auth/mela` verifies a Mela Auth JWT (HS256 secret or RS256/ES256 public key + issuer/audience) and issues the Mela Sales session. **Adjust claim names to your Mela Auth token format** (`sub`, `email`, `email_verified`, `name` assumed).
- Sessions are cookies, so serve the frontend and API from the same site (e.g. `app.example.com` and `app.example.com/api`).

## Included vs. not included

Included (must-have): everything in the spec. Included (nice-to-have): stock deduction + low-stock list, reminders data (`/reports/overdue`), recurring auto-generation, CSV export, barcode lookup via SKU search, Birr as default currency.

Not included yet: expenses/profit, thermal-printer layout, multi-branch, Ethiopian calendar, in-app sending of Telegram/WhatsApp/email (the API returns share links), Playwright end-to-end tests (frontend-dependent), integration tests against a live MySQL.

## Honest status

This code was written without network access, so `npm install`, `prisma generate`, type-checking and the tests
were **not run here**. First steps on your machine: `npm install && npx prisma generate && npm run typecheck && npm test`.
Fix any small type drift from newer library versions (Prisma, Zod, Express 5) — pinned ranges are in `package.json`.
