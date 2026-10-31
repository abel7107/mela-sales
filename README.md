# mela-sales

Mela Sales is a web-based sales management system for tracking daily sales, managing cash and credit payments, monitoring customer balances, and generating printable or shareable invoices.

> **📖 Full API documentation:** [`docs/API.md`](docs/API.md) — every endpoint,
> request/response examples, curl commands, and a complete testing guide.

```
mela-sales/
├── backend/     Express 5 + TypeScript + MySQL API
└── (frontend/)  coming next
```

## Backend

### Requirements

- Node.js 20+
- MySQL 8+

### Setup

```bash
cd backend
cp .env.example .env    # then fill in your values
npm install

# apply the schema to your database
mysql -u <user> -p <db_name> < database/schema.sql

npm run dev             # http://localhost:5000
```

Or with Docker instead of a local MySQL:

```bash
cd backend
docker compose up -d mysql
docker compose --profile tools run --rm migrate
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run dev:auth` | Mint a local JWT + JWKS endpoint for manual curl testing |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check only |
| `npm run lint` | Type-check plus unused locals/params |
| `npm test` | Run unit + integration tests |
| `npm run test:watch` | Re-run tests on change |

> The integration suite runs against the database named in `.env` and removes
> every row it creates when it finishes.

### Environment

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (default `5000`) |
| `NODE_ENV` | `development`, `test` or `production` |
| `CORS_ORIGINS` | Comma-separated allowlist. Empty = allow all (non-production only) |
| `RATE_LIMIT_PER_MINUTE` | Requests per minute per IP (default `300`, ignored under `NODE_ENV=test`) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `MELA_AUTH_ISSUER` | Expected JWT `iss` |
| `MELA_AUTH_AUDIENCE` | Expected JWT `aud` |
| `MELA_AUTH_JWKS_URL` | JWKS endpoint used to verify tokens |

### Authentication

Every endpoint except `/health` and `/health/db` requires:

```
Authorization: Bearer <access-token>
```

Tokens are issued by Mela Auth and verified locally against the JWKS endpoint
(signature, issuer, audience, expiry). No token is ever logged or stored.

The caller must then hold an **active membership** in the business named in the
URL. Roles:

| Role | Capabilities |
| --- | --- |
| `OWNER` | Everything, plus products, business profile, members, voiding |
| `CASHIER` | Sales, customers, reading products and reports |

### Conventions

- **Money** is always a decimal string with 2 places (`"125.50"`), never a float.
  All arithmetic happens in integer cents.
- **Quantities** are decimal strings with up to 3 places (`"2.5"`).
- **List endpoints** accept `limit` (1–200, default 50) and `page` (or `offset`)
  and return `pagination: { limit, offset, page, total, totalPages, hasMore }`.
- **Errors** are `{ "status": "error", "message": "...", "errors"?: [...] }`.
- **Writes** return `{ "status": "success", "message": "...", "data": ... }`.
- **Idempotency**: `POST .../sales` and `POST .../sales/:id/payments` accept an
  optional `Idempotency-Key` header (≤100 chars). Reusing a key returns `409`.
- **Soft delete**: products and customers are deactivated, never removed.

### Security

- JWTs are verified against Mela Auth's JWKS (`iss`, `aud`, signature, expiry).
  Tokens are never logged or persisted.
- Tenant isolation: membership is checked on every request, and the schema uses
  composite `(business_id, id)` foreign keys so rows cannot cross businesses.
- Prices and totals are always computed server-side from the database.
- Helmet security headers, per-IP rate limiting, and CORS origin allowlist.
- Every response carries an `X-Request-Id` (echoing a safe client-supplied one),
  and error payloads include it for log correlation.
- `Idempotency-Key` prevents duplicate sales and payments on retries.

---

## API reference

Base path: `/api/v1`. All routes below are relative to it.

### Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness |
| GET | `/health/db` | none | Database connectivity (`503` when down) |

### Businesses & members

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/businesses` | any | Businesses the caller belongs to |
| POST | `/businesses` | any | Creates a business; caller becomes `OWNER` |
| GET | `/businesses/:businessId` | OWNER, CASHIER | Profile + caller's membership |
| PATCH | `/businesses/:businessId` | OWNER | `name`, `currency`, `phone`, `email`, `address`, `logoUrl` |
| GET | `/businesses/:businessId/members` | OWNER | List memberships |
| POST | `/businesses/:businessId/members` | OWNER | `{ authUserId, role }` |
| PATCH | `/businesses/:businessId/members/:membershipId` | OWNER | `{ role?, isActive? }`; cannot deactivate yourself |

`POST /businesses` body:

```json
{ "name": "Test Cafe", "currency": "ETB", "phone": "+251911000001",
  "email": null, "address": null, "logoUrl": null }
```

### Products & services

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/businesses/:businessId/products-services` | OWNER, CASHIER | `?q=&include_inactive=&limit=&page=` |
| GET | `/businesses/:businessId/products-services/:productId` | OWNER, CASHIER | Single product |
| POST | `/businesses/:businessId/products-services` | OWNER | |
| PATCH | `/businesses/:businessId/products-services/:productId` | OWNER | Partial update |
| DELETE | `/businesses/:businessId/products-services/:productId` | OWNER | Soft delete (`is_active = false`) |

```json
{ "name": "Macchiato", "type": "PRODUCT", "price": "45.00", "sku": "MCH-1",
  "description": null, "is_active": true }
```

Duplicate `sku` within a business returns `409`.

### Customers

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/businesses/:businessId/customers` | OWNER, CASHIER | `?q=&include_inactive=&limit=&page=` |
| GET | `/businesses/:businessId/customers/:customerId` | OWNER, CASHIER | |
| POST | `/businesses/:businessId/customers` | OWNER, CASHIER | |
| PATCH | `/businesses/:businessId/customers/:customerId` | OWNER, CASHIER | Partial update |
| DELETE | `/businesses/:businessId/customers/:customerId` | OWNER | Soft delete |

```json
{ "name": "Abebe Kebede", "phone": "+251911222333",
  "email": null, "address": null, "notes": null }
```

### Sales

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/businesses/:businessId/sales` | OWNER, CASHIER | Creates sale + invoice + optional payment |
| GET | `/businesses/:businessId/sales` | OWNER, CASHIER | `?status=&saleType=&customerId=&invoice=&from=&to=&limit=&page=` |
| GET | `/businesses/:businessId/sales/:saleId` | OWNER, CASHIER | Sale with lines, payments, invoice |
| POST | `/businesses/:businessId/sales/:saleId/payments` | OWNER, CASHIER | Record a payment against an open sale |
| POST | `/businesses/:businessId/sales/:saleId/void` | OWNER | `{ "reason": "..." }` (≥3 chars) |
| GET | `/businesses/:businessId/sales/:saleId/invoice` | OWNER, CASHIER | Invoice as JSON |
| GET | `/businesses/:businessId/sales/:saleId/invoice/print` | OWNER, CASHIER | Self-contained printable HTML |

**Create a sale** — prices are always read from the database; any price sent by
the client is ignored.

```json
{
  "saleType": "CREDIT",
  "customerId": "uuid-or-null",
  "items": [
    { "productServiceId": "uuid", "quantity": "3", "discountAmount": "0.00" }
  ],
  "discountAmount": "0.00",
  "taxAmount": "13.50",
  "notes": "Wedding order",
  "initialPaymentAmount": "50.00",
  "paymentMethod": "CASH",
  "paymentReference": null,
  "paymentNotes": null
}
```

Rules:

- `CASH` sales require `paymentMethod` and are created as `PAID` (full amount
  paid automatically). Total must be greater than zero.
- `CREDIT` sales require `customerId`. Status is `PAID` only when the initial
  payment covers the total, otherwise `OPEN`.
- `discountAmount` at line *and* sale level may not exceed the subtotal.
- Unknown fields are rejected (`strict` schemas).

**Record a payment**

```json
{ "amount": "48.50", "method": "MOBILE_MONEY", "reference": "MP123", "notes": null }
```

`method` ∈ `CASH | BANK_TRANSFER | MOBILE_MONEY | OTHER`.
The amount must be greater than zero and cannot exceed the remaining balance.
When it exactly settles the balance the sale becomes `PAID`.

**Statuses**: `OPEN` → `PAID`, or → `VOID` (via the void endpoint). Voided
sales reject further payments.

### Reports

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/businesses/:businessId/reports/sales/summary` | OWNER, CASHIER | `?from=&to=` |
| GET | `/businesses/:businessId/reports/customers/balances` | OWNER, CASHIER | `?only_with_balance=&limit=&page=` |
| GET | `/businesses/:businessId/reports/payments` | OWNER, CASHIER | `?from=&to=&method=&limit=&page=` |

`sales/summary` returns `totals` (sale count, total, tax, discount, cash vs
credit split, outstanding, voided count), a `daily` breakdown, and `topProducts`.
Voided sales are excluded from all totals.

`customers/balances` returns `totalSales`, `totalPaid`, `outstandingBalance`
and `lastSaleAt` per active customer, ordered by outstanding balance.

`payments` returns a paginated list plus `totals.paymentCount` and
`totals.totalAmount`. Payments on voided sales are excluded.

Dates are `YYYY-MM-DD`; ranges are inclusive of `from` and `to`.

---

## Data model

```
businesses ─┬─ business_memberships (OWNER | CASHIER)
            ├─ customers
            ├─ product_services
            ├─ invoice_sequences (per-business INV-000001 counter)
            ├─ sales ──┬─ sale_lines (snapshots of name/price/sku)
            │          ├─ payments (idempotency_key)
            │          ├─ invoices (1:1, unique number per business)
            │          └─ audit_events
            └─ audit_events
```

Every tenant-scoped table carries `business_id` and most foreign keys are
composite (`business_id`, `id`) so rows can never be joined across businesses.
Schema: `backend/database/schema.sql`.

## Roadmap

- Frontend (web UI)
- Inventory / stock tracking
- CSV export for reports
