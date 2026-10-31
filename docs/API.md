# Mela Sales — API Documentation

Complete reference for every endpoint in the Mela Sales backend, plus how to test each one.

- **Base URL (local):** `http://localhost:5000`
- **API prefix:** `/api/v1`
- **Stack:** Express 5 · TypeScript · MySQL 8 · JWT (Mela Auth / JWKS)
- **Source:** `backend/src/`

---

## Table of contents

1. [Quick start — 3 ways to test](#1-quick-start--3-ways-to-test)
2. [Authentication](#2-authentication)
3. [Conventions](#3-conventions)
4. [Endpoint reference](#4-endpoint-reference)
   - [4.1 Health](#41-health)
   - [4.2 Businesses](#42-businesses)
   - [4.3 Members](#43-members)
   - [4.4 Products & services](#44-products--services)
   - [4.5 Customers](#45-customers)
   - [4.6 Sales](#46-sales)
   - [4.7 Payments](#47-payments)
   - [4.8 Voiding](#48-voiding)
   - [4.9 Invoices](#49-invoices)
   - [4.10 Reports](#410-reports)
5. [Errors & status codes](#5-errors--status-codes)
6. [Automated testing](#6-automated-testing)
7. [Full manual test walkthrough](#7-full-manual-test-walkthrough)
8. [Data model](#8-data-model)

---

## 1. Quick start — 3 ways to test

### Option A — Automated tests (recommended, no setup)

Runs all 96 tests against your real database. The suite creates its own
business, mints its own JWTs, exercises every endpoint, then deletes every row
it created.

```bash
cd backend
npm install
npm test
```

### Option B — Manual curl testing with the dev token helper

No Mela Auth instance needed.

```bash
# Terminal 1: start the API
cd backend
cp .env.example .env   # fill in DB values
npm run dev

# Terminal 2: mint a token + JWKS endpoint (leave running)
cd backend
npm run dev:auth -- --user abel
```

`dev:auth` prints:

```
1. Add these to backend/.env (then restart `npm run dev`):
   MELA_AUTH_ISSUER=https://auth.test.mela/
   MELA_AUTH_AUDIENCE=mela-sales-api-test
   MELA_AUTH_JWKS_URL=http://127.0.0.1:38981/.well-known/jwks.json

2. Use this token for user "abel":
   Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

Copy the three `MELA_AUTH_*` lines into `backend/.env`, restart `npm run dev`,
then use the printed token as `$TOKEN` below. The helper keeps the JWKS
endpoint alive for 1 hour.

### Option C — Real Mela Auth

Set `MELA_AUTH_ISSUER`, `MELA_AUTH_AUDIENCE`, `MELA_AUTH_JWKS_URL` in
`backend/.env` to your production/staging values and obtain a real access token.

### Shell variables used in the examples

```bash
export BASE=http://localhost:5000
export TOKEN="eyJhbGciOiJSUzI1NiIs..."     # from dev:auth or Mela Auth
export BID="<business-uuid>"                # from POST /businesses
export PID="<product-uuid>"
export CID="<customer-uuid>"
export SID="<sale-uuid>"
```

Every example assumes these are set. Add the header to each call:

```bash
-H "Authorization: Bearer $TOKEN" \
-H "Content-Type: application/json"
```

---

## 2. Authentication

All endpoints except `GET /health` and `GET /health/db` require a bearer token:

```
Authorization: Bearer <access-token>
```

**Verification** (`src/middleware/requireAuth.ts`):

| Check | Failure |
| --- | --- |
| `Authorization` header present, `Bearer` scheme | `401` |
| Token signature valid against the JWKS endpoint | `401` |
| `iss` matches `MELA_AUTH_ISSUER` | `401` |
| `aud` matches `MELA_AUTH_AUDIENCE` | `401` |
| Token not expired | `401` |
| Token has a `sub` claim | `401` |
| `MELA_AUTH_*` env vars configured | `503` |
| JWKS URL is `https:` (or localhost) | `503` |

Tokens are verified locally on every request. They are never logged, stored,
or forwarded.

### Authorization (roles)

After authentication, `requireRole` loads the caller's **active membership**
for the `businessId` in the URL:

| Failure | Status |
| --- | --- |
| No membership in this business | `403` |
| Membership exists but lacks the required role | `403` |
| Membership deactivated | `403` |

| Role | Allowed operations |
| --- | --- |
| `OWNER` | Everything below, **plus** product create/update/delete, business profile, member management, voiding sales |
| `CASHIER` | Create/list/read sales, record payments, create/list/read customers, list/read products, read reports, read invoice |

> **Security note:** a `403` is returned *before* the record is looked up, so
> you cannot probe for the existence of a business you do not belong to.

---

## 3. Conventions

### Response envelope

Every response includes a `status` field.

**Single resource / action:**

```json
{ "status": "success", "message": "…optional…", "data": { } }
```

**List (paginated):**

```json
{
  "status": "success",
  "data": [ ],
  "pagination": {
    "limit": 50, "offset": 0, "page": 1,
    "total": 128, "totalPages": 3, "hasMore": true
  }
}
```

**Error:**

```json
{ "status": "error", "message": "…", "errors": [ { "field": "…", "message": "…" } ] }
```

`errors` is only present on validation failures. Every error response also
carries `requestId` for log correlation.

### Money & quantities

| Type | Format | Examples |
| --- | --- | --- |
| Money | Decimal **string**, exactly ≤ 2 decimal places | `"0"`, `"45"`, `"45.5"`, `"125.50"` |
| Quantity | Decimal **string**, ≤ 3 decimal places, > 0 | `"1"`, `"2.5"`, `"0.125"` |

**Never send or expect a JSON number for money.** All arithmetic is done in
integer cents inside the server (`src/utils/money.ts`), so there is no
floating-point drift.

Negative amounts are rejected by validation (`400`).

### Pagination

| Query param | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | int 1–200 | `50` | Out of range → `400` |
| `page` | int ≥ 1 | `1` | 1-based; converts to `offset` |
| `offset` | int ≥ 0 | `0` | Takes precedence over `page` |

### Dates

Range parameters (`from`, `to`) are `YYYY-MM-DD`. The range is **inclusive** of
both days (`from 00:00:00` through `to 23:59:59.999`). Any other format → `400`.

### Idempotency

`POST …/sales` and `POST …/sales/:saleId/payments` accept an optional header:

```
Idempotency-Key: <string, max 100 chars>
```

The key is stored on the payment row. Reusing it → `409`. This makes client
retries safe.

### Soft delete

Products and customers are **never** physically removed. `DELETE` sets
`isActive`/`is_active = false`. Historical sales keep their snapshots.

### Request headers

| Header | Direction | Purpose |
| --- | --- | --- |
| `Authorization` | in | Bearer token (required on all non-health routes) |
| `Content-Type: application/json` | in | Required for bodies |
| `Idempotency-Key` | in | Optional, payment/sale retries |
| `X-Request-Id` | in/out | Optional; echoed if safe (`[A-Za-z0-9._-]{1,128}`), otherwise replaced |
| `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` | out | RFC draft-8 rate-limit headers |

### Rate limiting

Default **300 requests/minute per IP** (`RATE_LIMIT_PER_MINUTE`). Exceeding it
returns `429`. Disabled when `NODE_ENV=test`.

---

## 4. Endpoint reference

Legend: **Role** = minimum role required.

### 4.1 Health

#### `GET /health`

Liveness probe. **No auth.**

```bash
curl -s $BASE/health
```

```json
{ "status": "ok", "service": "mela-sales-api", "timestamp": "2026-10-27T13:10:18.459Z" }
```

#### `GET /health/db`

Database connectivity. **No auth.** `200` when connected, `503` otherwise.

```bash
curl -s $BASE/health/db
# {"status":"ok","database":"connected","timestamp":"…"}
```

---

### 4.2 Businesses

#### `GET /api/v1/businesses`

**Role:** any authenticated user. Lists every business the caller has an
active membership in.

```bash
curl -s $BASE/api/v1/businesses -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    {
      "id": "3f2a…",
      "name": "Test Cafe",
      "currency": "ETB",
      "phone": "+251911000001",
      "email": null,
      "address": null,
      "logoUrl": null,
      "isActive": true,
      "createdAt": "2026-10-27T12:00:00.000Z",
      "updatedAt": "2026-10-27T12:00:00.000Z",
      "membership": { "id": "9b1c…", "role": "OWNER" }
    }
  ]
}
```

#### `POST /api/v1/businesses`

**Role:** any authenticated user. Creates a business; the caller becomes its
`OWNER`. Also creates the `invoice_sequences` row.

**Body** (all optional except `name`):

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | **required**, 1–150 chars |
| `currency` | string | 3 uppercase letters, default `"ETB"` |
| `phone` | string \| null | 3–30 chars |
| `email` | string \| null | valid email, ≤ 254 |
| `address` | string \| null | ≤ 255 |
| `logoUrl` | string \| null | valid URL, ≤ 500 |

Unknown fields → `400`.

```bash
curl -s -X POST $BASE/api/v1/businesses \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Cafe","currency":"ETB","phone":"+251911000001"}'
```

```json
{
  "status": "success",
  "message": "Business created successfully.",
  "data": {
    "id": "3f2a…", "name": "Test Cafe", "currency": "ETB",
    "phone": "+251911000001", "email": null, "address": null,
    "logoUrl": null, "isActive": true,
    "createdAt": "…", "updatedAt": "…",
    "membership": { "id": "9b1c…", "role": "OWNER" }
  }
}
```

**Errors:** `400` invalid body · `401` no token.

#### `GET /api/v1/businesses/:businessId`

**Role:** `OWNER`, `CASHIER`. Returns the profile **plus the caller's own
membership**.

```bash
curl -s $BASE/api/v1/businesses/$BID -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": {
    "id": "3f2a…", "name": "Test Cafe", "currency": "ETB",
    "phone": null, "email": null, "address": null, "logoUrl": null,
    "isActive": true, "createdAt": "…", "updatedAt": "…",
    "membership": { "id": "9b1c…", "role": "OWNER" }
  }
}
```

**Errors:** `403` not a member · `404` business missing/inactive.

#### `PATCH /api/v1/businesses/:businessId`

**Role:** `OWNER` only. Partial update; send only the fields you want to change.

**Body:** any subset of `name`, `currency`, `phone`, `email`, `address`, `logoUrl`.
Empty object → `400` ("Provide at least one field to update.").

```bash
curl -s -X PATCH $BASE/api/v1/businesses/$BID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Cafe Updated","address":"Addis Ababa"}'
```

```json
{
  "status": "success",
  "message": "Business updated successfully.",
  "data": { "id": "3f2a…", "name": "Test Cafe Updated", "address": "Addis Ababa", "…": "…" }
}
```

> Unlike `GET`, this response contains **no** `membership` key.

**Errors:** `400` empty/invalid body · `403` not OWNER · `404` not found.

---

### 4.3 Members

Membership rows link a Mela Auth `authUserId` to a business with a role.

#### `GET /api/v1/businesses/:businessId/members`

**Role:** `OWNER` only.

```bash
curl -s $BASE/api/v1/businesses/$BID/members -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    { "id": "9b1c…", "authUserId": "abel", "role": "OWNER",
      "isActive": true, "createdAt": "2026-10-27T12:00:00.000Z" }
  ]
}
```

**Errors:** `403` non-owner.

#### `POST /api/v1/businesses/:businessId/members`

**Role:** `OWNER` only. Grants an existing Mela Auth user access.

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `authUserId` | string | **required**, 1–255 (the JWT `sub`) |
| `role` | `"OWNER"` \| `"CASHIER"` | **required** |

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/members \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"authUserId":"bob","role":"CASHIER"}'
```

```json
{
  "status": "success",
  "message": "Member added successfully.",
  "data": { "id": "aa44…", "authUserId": "bob", "role": "CASHIER", "isActive": true }
}
```

**Errors:** `400` invalid body · `403` non-owner · `409` already a member ·
`404` business not found.

#### `PATCH /api/v1/businesses/:businessId/members/:membershipId`

**Role:** `OWNER` only.

**Body:** any subset of `role`, `isActive`. Empty → `400`.

**Guard:** an OWNER cannot set `isActive: false` on **their own** membership →
`400` `"You cannot deactivate your own membership."`

```bash
curl -s -X PATCH $BASE/api/v1/businesses/$BID/members/$MID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

```json
{
  "status": "success",
  "message": "Member updated successfully.",
  "data": { "id": "aa44…", "authUserId": "bob", "role": "CASHIER",
            "isActive": false, "createdAt": "…" }
}
```

**Effects:** deactivating a member immediately revokes their access to all
endpoints of that business (`403`).

**Errors:** `400` empty body / self-deactivation · `403` non-owner ·
`404` membership not in this business.

---

### 4.4 Products & services

#### `GET /api/v1/businesses/:businessId/products-services`

**Role:** `OWNER`, `CASHIER`.

| Query param | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | — | Case-insensitive match on `name`, `sku`, `description` |
| `include_inactive` | `true`/`false`/`1`/`0` | `false` | Owner view of deactivated items |
| `limit`, `page` | int | 50, 1 | Pagination |

```bash
curl -s "$BASE/api/v1/businesses/$BID/products-services?q=macchi&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    {
      "id": "7d0e…",
      "businessId": "3f2a…",
      "name": "Macchiato",
      "description": null,
      "sku": "MCH-1",
      "type": "PRODUCT",
      "price": "45.00",
      "isActive": true,
      "createdAt": "2026-10-27T12:05:00.000Z",
      "updatedAt": "2026-10-27T12:05:00.000Z"
    }
  ],
  "pagination": { "limit": 10, "offset": 0, "page": 1,
                  "total": 1, "totalPages": 1, "hasMore": false }
}
```

**Errors:** `400` bad `limit`/`page`/`include_inactive` · `403` non-member.

#### `GET /api/v1/businesses/:businessId/products-services/:productId`

**Role:** `OWNER`, `CASHIER`. Returns a single product (including inactive).

```bash
curl -s $BASE/api/v1/businesses/$BID/products-services/$PID \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "status": "success", "data": { "id": "7d0e…", "name": "Macchiato",
  "price": "45.00", "isActive": true, "…": "…" } }
```

**Errors:** `404` not found in this business.

#### `POST /api/v1/businesses/:businessId/products-services`

**Role:** `OWNER` only.

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | **required**, 1–150 |
| `type` | `"PRODUCT"` \| `"SERVICE"` | **required** |
| `price` | money string | **required**, ≥ 0, ≤ 2 decimals |
| `description` | string \| null | ≤ 1000 |
| `sku` | string \| null | 1–64, unique per business |
| `is_active` | boolean | default `true` |

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/products-services \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Macchiato","type":"PRODUCT","price":"45.00","sku":"MCH-1"}'
```

```json
{
  "status": "success",
  "message": "Product/service created successfully.",
  "data": { "id": "7d0e…", "businessId": "3f2a…", "name": "Macchiato",
            "sku": "MCH-1", "type": "PRODUCT", "price": "45.00",
            "isActive": true, "createdAt": "…", "updatedAt": "…" }
}
```

**Errors:** `400` invalid body (incl. `price: "-1"`, `"12.505"`, empty name) ·
`403` non-owner · `409` duplicate SKU.

#### `PATCH /api/v1/businesses/:businessId/products-services/:productId`

**Role:** `OWNER` only. Partial update. Empty body → `400`.

```bash
curl -s -X PATCH $BASE/api/v1/businesses/$BID/products-services/$PID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"price":"49.50"}'
```

```json
{ "status": "success", "message": "Product/service updated successfully.",
  "data": { "id": "7d0e…", "price": "49.50", "…": "…" } }
```

**Errors:** `400` empty/invalid body · `403` non-owner · `404` not found ·
`409` duplicate SKU.

#### `DELETE /api/v1/businesses/:businessId/products-services/:productId`

**Role:** `OWNER` only. **Soft delete** — sets `isActive: false`. The row is
kept so historical sales remain intact.

```bash
curl -s -X DELETE $BASE/api/v1/businesses/$BID/products-services/$PID \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "status": "success", "message": "Product/service deactivated successfully.",
  "data": { "id": "7d0e…", "isActive": false, "…": "…" } }
```

**Errors:** `403` non-owner · `404` not found.

> Deactivated products cannot be added to new sales (`404` on `POST /sales`).

---

### 4.5 Customers

#### `GET /api/v1/businesses/:businessId/customers`

**Role:** `OWNER`, `CASHIER`.

| Query param | Type | Default |
| --- | --- | --- |
| `q` | string | — (matches `name`, `phone`, `email`) |
| `include_inactive` | bool | `false` |
| `limit`, `page` | int | 50, 1 |

```bash
curl -s "$BASE/api/v1/businesses/$BID/customers?q=abebe" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    { "id": "c1…", "businessId": "3f2a…", "name": "Abebe Kebede",
      "phone": "+251911222333", "email": null, "address": null,
      "notes": null, "isActive": true,
      "createdAt": "…", "updatedAt": "…" }
  ],
  "pagination": { "limit": 50, "offset": 0, "page": 1,
                  "total": 1, "totalPages": 1, "hasMore": false }
}
```

**Errors:** `400` bad query · `403` non-member.

#### `GET /api/v1/businesses/:businessId/customers/:customerId`

**Role:** `OWNER`, `CASHIER`.

```bash
curl -s $BASE/api/v1/businesses/$BID/customers/$CID \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "status": "success",
  "data": { "id": "c1…", "name": "Abebe Kebede", "phone": "+251911222333",
            "email": null, "address": null, "notes": null,
            "isActive": true, "createdAt": "…", "updatedAt": "…" } }
```

**Errors:** `404` not found.

#### `POST /api/v1/businesses/:businessId/customers`

**Role:** `OWNER`, **or `CASHIER`** (cashiers need customers for credit sales).

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `name` | string | **required**, 1–150 |
| `phone` | string \| null | 3–30 |
| `email` | string \| null | valid email |
| `address` | string \| null | ≤ 255 |
| `notes` | string \| null | ≤ 1000 |
| `is_active` | boolean | default `true` |

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/customers \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Abebe Kebede","phone":"+251911222333"}'
```

```json
{ "status": "success", "message": "Customer created successfully.",
  "data": { "id": "c1…", "name": "Abebe Kebede",
            "phone": "+251911222333", "isActive": true, "…": "…" } }
```

**Errors:** `400` invalid body (empty/over-long name, bad email) ·
`403` non-member.

#### `PATCH /api/v1/businesses/:businessId/customers/:customerId`

**Role:** `OWNER`, `CASHIER`. Partial update; empty body → `400`.

```bash
curl -s -X PATCH $BASE/api/v1/businesses/$BID/customers/$CID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"notes":"Prefers WhatsApp"}'
```

```json
{ "status": "success", "message": "Customer updated successfully.",
  "data": { "id": "c1…", "notes": "Prefers WhatsApp", "…": "…" } }
```

**Errors:** `400` empty/invalid body · `403` non-member · `404` not found.

#### `DELETE /api/v1/businesses/:businessId/customers/:customerId`

**Role:** `OWNER` only. **Soft delete** (`isActive: false`).

```bash
curl -s -X DELETE $BASE/api/v1/businesses/$BID/customers/$CID \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "status": "success", "message": "Customer deactivated successfully.",
  "data": { "id": "c1…", "isActive": false, "…": "…" } }
```

**Errors:** `403` non-owner · `404` not found.

> Inactive customers cannot be used on new sales (`404`).

---

### 4.6 Sales

#### `POST /api/v1/businesses/:businessId/sales`

**Role:** `OWNER`, `CASHIER`.

This is the core endpoint. In a **single transaction** it: validates the
customer, loads every price from the database, computes totals in integer
cents, allocates the next invoice number (row-locked), inserts the sale header,
line snapshots, an optional payment, the invoice, and an audit event.

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `saleType` | `"CASH"` \| `"CREDIT"` | **required** |
| `items` | array | **required**, 1–100 entries |
| `items[].productServiceId` | uuid | **required**, must be active in this business |
| `items[].quantity` | quantity string | **required**, > 0, ≤ 3 decimals |
| `items[].discountAmount` | money string | optional, default `"0.00"`, ≤ line amount |
| `customerId` | uuid \| null | **required for `CREDIT`**, must be active |
| `discountAmount` | money string | optional sale-level discount, default `"0.00"` |
| `taxAmount` | money string | optional, default `"0.00"` |
| `notes` | string \| null | ≤ 1000 |
| `initialPaymentAmount` | money string | optional, default `"0.00"` (credit only) |
| `paymentMethod` | enum | required for cash sales and for any initial payment |
| `paymentReference` | string \| null | ≤ 150 |
| `paymentNotes` | string \| null | ≤ 500 |

`paymentMethod` ∈ `CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `OTHER`.

**Unknown fields are rejected** (`.strict()` schemas) — including any attempt
to send a price. Prices always come from the database.

**Business rules:**

| Rule | Result |
| --- | --- |
| Cash sale total must be > `0` | `400` |
| Cash sale is always fully paid → status `PAID` | — |
| Credit sale without `customerId` | `400` |
| Credit sale fully covered by initial payment → `PAID`, else `OPEN` | — |
| `paymentMethod` missing on cash sale | `400` |
| `paymentMethod` missing while `initialPaymentAmount > 0` | `400` |
| Any discount (line + sale) > subtotal | `400` |
| Line discount > line amount | `400` |
| Initial payment > total | `400` |
| Product inactive / unknown / other business | `404` |
| Customer inactive / unknown / other business | `404` |

**Curl — cash sale:**

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/sales \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: sale-001" \
  -d '{
    "saleType": "CASH",
    "paymentMethod": "CASH",
    "items": [ { "productServiceId": "'$PID'", "quantity": "2" } ]
  }'
```

**Curl — credit sale with an initial payment:**

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/sales \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "saleType": "CREDIT",
    "customerId": "'$CID'",
    "items": [ { "productServiceId": "'$PID'", "quantity": "3" } ],
    "taxAmount": "13.50",
    "initialPaymentAmount": "50.00",
    "paymentMethod": "CASH",
    "notes": "Wedding order"
  }'
```

**Success `201`:**

```json
{
  "status": "success",
  "message": "Sale created successfully.",
  "data": {
    "id": "s9…",
    "businessId": "3f2a…",
    "customerId": "c1…",
    "customerName": "Abebe Kebede",
    "createdByMembershipId": "9b1c…",
    "saleType": "CREDIT",
    "status": "OPEN",
    "subtotal": "135.00",
    "discountAmount": "0.00",
    "taxAmount": "13.50",
    "totalAmount": "148.50",
    "amountPaid": "50.00",
    "balanceDue": "98.50",
    "notes": "Wedding order",
    "voidReason": null,
    "voidedAt": null,
    "createdAt": "2026-10-27T12:30:00.000Z",
    "updatedAt": "2026-10-27T12:30:00.000Z",
    "invoice": { "id": "i7…", "invoiceNumber": "INV-000001",
                 "issuedAt": "2026-10-27T12:30:00.000Z" },
    "items": [
      { "id": "l1…", "productServiceId": "7d0e…", "name": "Macchiato",
        "type": "PRODUCT", "sku": "MCH-1", "quantity": "3",
        "unitPrice": "45.00", "discountAmount": "0.00",
        "lineTotal": "135.00" }
    ],
    "payments": [
      { "id": "p1…", "amount": "50.00", "method": "CASH",
        "reference": null, "notes": null,
        "receivedAt": "2026-10-27T12:30:00.000Z",
        "receivedByMembershipId": "9b1c…" }
    ]
  }
}
```

**Errors:** `400` validation/business rules · `403` non-member ·
`404` product/customer · `409` reused `Idempotency-Key`.

---

#### `GET /api/v1/businesses/:businessId/sales`

**Role:** `OWNER`, `CASHIER`.

| Query param | Type | Notes |
| --- | --- | --- |
| `status` | `OPEN`, `PAID`, `VOID` | Comma-separated or repeated |
| `saleType` | `CASH`, `CREDIT` | Comma-separated or repeated |
| `customerId` | uuid | Exact match |
| `invoice` | string | Exact invoice number, e.g. `INV-000001` |
| `from`, `to` | `YYYY-MM-DD` | Inclusive date range on `createdAt` |
| `limit`, `page` | int | Pagination |

Invalid enum value → `400` listing the allowed values.

```bash
curl -s "$BASE/api/v1/businesses/$BID/sales?status=OPEN&saleType=CREDIT&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    {
      "id": "s9…",
      "customerId": "c1…",
      "customerName": "Abebe Kebede",
      "saleType": "CREDIT",
      "status": "OPEN",
      "subtotal": "135.00",
      "discountAmount": "0.00",
      "taxAmount": "13.50",
      "totalAmount": "148.50",
      "amountPaid": "50.00",
      "balanceDue": "98.50",
      "notes": "Wedding order",
      "invoiceNumber": "INV-000001",
      "createdByMembershipId": "9b1c…",
      "createdAt": "2026-10-27T12:30:00.000Z"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "page": 1,
                  "total": 1, "totalPages": 1, "hasMore": false }
}
```

Sorted newest first. `balanceDue` is clamped at `0`.

**Errors:** `400` bad filter/date/pagination · `403` non-member.

#### `GET /api/v1/businesses/:businessId/sales/:saleId`

**Role:** `OWNER`, `CASHIER`. Full detail — same shape as the `POST /sales`
response body (`data`), including `items`, `payments`, `invoice`, and computed
`amountPaid` / `balanceDue`.

```bash
curl -s $BASE/api/v1/businesses/$BID/sales/$SID \
  -H "Authorization: Bearer $TOKEN"
```

```json
{ "status": "success", "data": { "id": "s9…", "status": "OPEN",
  "totalAmount": "148.50", "amountPaid": "50.00", "balanceDue": "98.50",
  "items": [ … ], "payments": [ … ], "invoice": { … } } }
```

**Errors:** `403` non-member · `404` sale not in this business.

---

### 4.7 Payments

#### `POST /api/v1/businesses/:businessId/sales/:saleId/payments`

**Role:** `OWNER`, `CASHIER`. Records a payment against an **open** sale and
updates its status when the balance is settled.

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `amount` | money string | **required**, > 0, ≤ remaining balance |
| `method` | enum | **required** — `CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `OTHER` |
| `reference` | string \| null | ≤ 150 |
| `notes` | string \| null | ≤ 500 |
| `receivedAt` | ISO-8601 datetime with offset \| null | optional backdating |

**Header:** `Idempotency-Key` (optional, ≤100 chars) — reuse → `409`.

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/payments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: pay-001" \
  -d '{"amount":"48.50","method":"MOBILE_MONEY","reference":"MP123"}'
```

**Success `201`:**

```json
{
  "status": "success",
  "message": "Payment recorded.",
  "data": {
    "paymentId": "p2…",
    "sale": {
      "id": "s9…", "status": "OPEN",
      "totalAmount": "148.50", "amountPaid": "98.50",
      "balanceDue": "50.00", "payments": [ …, { … } ]
    }
  }
}
```

When the payment settles the balance exactly, `status` becomes `"PAID"` and
`message` becomes `"Payment recorded. The sale is now fully paid."`.

**Errors:**

| Status | Cause |
| --- | --- |
| `400` | Amount ≤ 0, exceeds remaining balance, invalid body |
| `403` | Non-member |
| `404` | Sale not found |
| `409` | Sale already `PAID`, sale `VOID`, or reused `Idempotency-Key` |

---

### 4.8 Voiding

#### `POST /api/v1/businesses/:businessId/sales/:saleId/void`

**Role:** `OWNER` only.

**Body:**

| Field | Type | Rules |
| --- | --- | --- |
| `reason` | string | **required**, 3–500 chars, trimmed |

```bash
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/void \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"reason":"Customer cancelled the order"}'
```

**Success `200`:**

```json
{
  "status": "success",
  "message": "Sale voided successfully.",
  "data": {
    "id": "s9…", "status": "VOID",
    "voidReason": "Customer cancelled the order",
    "voidedAt": "2026-10-27T13:00:00.000Z",
    "…": "…"
  }
}
```

**Behaviour:**

- Only `OPEN` or `PAID` sales can be voided; already-`VOID` → `409`.
- Voided sales are **excluded** from `sales/summary` totals and from the
  `reports/payments` list (payments on voided sales are treated as reversed).
- Payments already recorded stay in the database (audit trail).
- Voided sales **reject** further payments (`409`).
- Writes an `SALE_VOIDED` audit event with the reason.

**Errors:** `400` reason missing/too short/too long · `403` non-owner ·
`404` sale not found · `409` already voided.

---

### 4.9 Invoices

Every sale gets an invoice at creation time with a business-unique number of
the form `INV-000001`, `INV-000002`, … allocated under a row lock so numbers
are gap-free and never duplicated.

#### `GET /api/v1/businesses/:businessId/sales/:saleId/invoice`

**Role:** `OWNER`, `CASHIER`. Invoice as JSON.

```bash
curl -s $BASE/api/v1/businesses/$BID/sales/$SID/invoice \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": {
    "id": "i7…",
    "invoiceNumber": "INV-000001",
    "issuedAt": "2026-10-27T12:30:00.000Z",
    "business": {
      "id": "3f2a…", "name": "Test Cafe", "currency": "ETB",
      "phone": null, "email": null, "address": null, "logoUrl": null
    },
    "sale": { "…": "full sale detail, same as GET /sales/:saleId" }
  }
}
```

**Errors:** `404` sale not found or no invoice issued.

#### `GET /api/v1/businesses/:businessId/sales/:saleId/invoice/print`

**Role:** `OWNER`, `CASHIER`. Returns a **self-contained HTML document** —
open it in a browser and use Print → Save as PDF, or share the HTML file.

- `Content-Type: text/html; charset=utf-8`
- `Content-Disposition: inline; filename="INV-000001.html"`
- No external assets (inline CSS only), works offline
- Includes `@media print` rules for clean PDF output
- Shows items, payments received, totals, balance due, and a VOID banner if voided

```bash
curl -s $BASE/api/v1/businesses/$BID/sales/$SID/invoice/print \
  -H "Authorization: Bearer $TOKEN" -o invoice.html
open invoice.html        # macOS
xdg-open invoice.html    # Linux
```

**Errors:** `404` sale/invoice not found.

---

### 4.10 Reports

#### `GET /api/v1/businesses/:businessId/reports/sales/summary`

**Role:** `OWNER`, `CASHIER`. `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional).

Excludes voided sales from all totals; reports the voided count separately.

```bash
curl -s "$BASE/api/v1/businesses/$BID/reports/sales/summary?from=2026-10-01&to=2026-10-31" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": {
    "range": { "from": "2026-10-01", "to": "2026-10-31" },
    "totals": {
      "saleCount": 2,
      "totalAmount": "238.50",
      "taxAmount": "13.50",
      "discountAmount": "0.00",
      "cashAmount": "90.00",
      "creditAmount": "148.50",
      "outstandingAmount": "148.50",
      "voidedCount": 1
    },
    "daily": [
      { "day": "2026-10-27", "saleCount": 2,
        "totalAmount": "238.50", "cashAmount": "90.00",
        "creditAmount": "148.50" }
    ],
    "topProducts": [
      { "name": "Macchiato", "type": "PRODUCT",
        "quantitySold": "5.000", "revenue": "225.00" }
    ]
  }
}
```

- `daily` is sorted newest first, one row per calendar day.
- `topProducts` is limited to 10, ordered by revenue descending.
- `outstandingAmount` = sum of `totalAmount` for sales still in status `OPEN`.

**Errors:** `400` invalid date · `403` non-member.

#### `GET /api/v1/businesses/:businessId/reports/customers/balances`

**Role:** `OWNER`, `CASHIER`. Outstanding credit per active customer.

| Query param | Type | Default |
| --- | --- | --- |
| `only_with_balance` | `true`/`1` | `false` — when true, hides customers with zero balance |
| `limit`, `page` | int | 50, 1 |

```bash
curl -s "$BASE/api/v1/businesses/$BID/reports/customers/balances?only_with_balance=true" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    { "customerId": "c1…", "name": "Abebe Kebede",
      "phone": "+251911222333",
      "totalSales": "148.50", "totalPaid": "98.50",
      "outstandingBalance": "50.00",
      "lastSaleAt": "2026-10-27T12:30:00.000Z" }
  ],
  "pagination": { "limit": 50, "offset": 0, "page": 1,
                  "total": 1, "totalPages": 1, "hasMore": false }
}
```

- Ordered by `outstandingBalance` descending, then name.
- Only active customers; voided sales excluded.
- Zero-balance customers still appear unless `only_with_balance=true`.

**Errors:** `400` bad query · `403` non-member.

#### `GET /api/v1/businesses/:businessId/reports/payments`

**Role:** `OWNER`, `CASHIER`.

| Query param | Type | Notes |
| --- | --- | --- |
| `from`, `to` | `YYYY-MM-DD` | On `receivedAt`, inclusive |
| `method` | enum | `CASH`, `BANK_TRANSFER`, `MOBILE_MONEY`, `OTHER` |
| `limit`, `page` | int | Pagination |

Payments belonging to **voided** sales are excluded.

```bash
curl -s "$BASE/api/v1/businesses/$BID/reports/payments?from=2026-10-01&method=CASH" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "status": "success",
  "data": [
    { "id": "p1…", "amount": "50.00", "method": "CASH",
      "reference": null, "notes": null,
      "receivedAt": "2026-10-27T12:30:00.000Z",
      "receivedByMembershipId": "9b1c…",
      "saleId": "s9…", "invoiceNumber": "INV-000001",
      "customerName": "Abebe Kebede" }
  ],
  "pagination": { "limit": 50, "offset": 0, "page": 1,
                  "total": 3, "totalPages": 1, "hasMore": false },
  "totals": { "paymentCount": 3, "totalAmount": "148.50" }
}
```

`totals` reflects **all** matching payments, not just the current page.

**Errors:** `400` invalid date or `method` · `403` non-member.

---

## 5. Errors & status codes

### Envelope

```json
{
  "status": "error",
  "message": "Human-readable description",
  "errors": [ { "field": "items.0.quantity", "message": "Quantity must be greater than zero." } ],
  "requestId": "b3f1c2…"
}
```

`errors` appears only for Zod validation failures (`field` uses dotted paths).
`requestId` appears on all errors generated by the error middleware.

### Status codes

| Code | Meaning | Typical cause |
| --- | --- | --- |
| `200` | OK | Read/update/void success |
| `201` | Created | `POST` resource created |
| `400` | Bad request | Validation failure, bad query param, business-rule violation, malformed JSON |
| `401` | Unauthorized | Missing/malformed/expired/invalid token |
| `403` | Forbidden | Not a member, or role insufficient |
| `404` | Not found | Resource absent or in another business |
| `409` | Conflict | Duplicate SKU, duplicate membership, already paid/void, reused `Idempotency-Key` |
| `413` | Payload too large | Body > 1 MB |
| `429` | Too many requests | Rate limit exceeded |
| `500` | Server error | Unhandled exception (message is always generic) |
| `503` | Service unavailable | `MELA_AUTH_*` not configured, JWKS not https, DB down |

### Common error messages

| Message | Status |
| --- | --- |
| `"A valid Bearer access token is required."` | 401 |
| `"The access token is invalid or could not be verified."` | 401 |
| `"Mela Auth is not configured on this server."` | 503 |
| `"You do not have an active membership in this business."` | 403 |
| `"You do not have permission to perform this action."` | 403 |
| `"Business ID is required."` | 400 |
| `"Invalid sale data."` + `errors[]` | 400 |
| `"Product/service … was not found or is inactive in this business."` | 404 |
| `"The active customer was not found in this business."` | 404 |
| `"A product/service with this SKU already exists in this business."` | 409 |
| `"This sale is already fully paid."` | 409 |
| `"Payments cannot be recorded against a voided sale."` | 409 |
| `"This sale has already been voided."` | 409 |
| `"This Idempotency-Key has already been used…"` | 409 |
| `"The request body is not valid JSON."` | 400 |
| `"Route not found: GET /nope"` | 404 |

---

## 6. Automated testing

### Commands

```bash
cd backend
npm run lint        # type-check + unused locals/params (src, tests, scripts)
npm run typecheck   # type-check only
npm run build       # compile to dist/
npm test            # run all 96 tests
npm run test:watch  # watch mode
```

### Test layout

```
backend/tests/
├── unit/
│   ├── money.test.ts         # integer-cents math, rounding, range checks
│   ├── http.test.ts          # pagination, date params, path params
│   └── validators.test.ts    # Zod schemas: sales, products, customers
├── integration/
│   └── api.test.ts           # full HTTP flow against a real MySQL database
└── helpers/
    ├── authServer.ts         # local JWKS endpoint + token minter
    └── db.ts                 # cleanup of rows created by the suite
```

### What the integration suite covers (96 assertions total)

| Area | Covered |
| --- | --- |
| Health | `/health`, `/health/db`, 404 handler, `X-Request-Id` echo/rejection |
| Auth | missing token, malformed token, wrong signing key, malformed JSON body |
| Business | create, list, read, update, empty-update rejection, non-member `403` |
| Members | grant role, duplicate `409`, non-owner `403`, deactivation revokes access, self-deactivation blocked |
| Products | create, duplicate SKU `409`, list + pagination metadata, search hit/miss, single fetch, cashier denied `403` |
| Customers | create as cashier, list/search |
| Sales | cash sale `PAID`, credit sale `OPEN` with balance math, client price ignored, unknown fields rejected, credit-without-customer `400` |
| Sales list | all/`status`/`saleType`/`customerId`/`invoice` filters, invalid filter `400` |
| Payments | partial payment, overpay `400`, zero `400`, settle → `PAID`, already-paid `409`, idempotency `409` |
| Invoices | JSON fetch, printable HTML (content-type, CSP allows inline styles) |
| Reports | summary totals + daily + top products, customer balances, payments totals, void exclusion |
| Void | reason required `400`, cashier denied `403`, void success, double-void `409`, payment-after-void `409` |

### Database hygiene

The suite runs against the database in `.env`, but **every row it creates is
deleted in `afterAll`** in foreign-key-safe order (`audit_events` → … →
`businesses`). After `npm test` all tables are empty again.

### Test data isolation

Each test business gets a random UUID, so parallel or repeated runs never
collide. Tests run sequentially (`fileParallelism: false`) because they share
one database.

---

## 7. Full manual test walkthrough

End-to-end curl script exercising the entire lifecycle. Run it after
[Option B](#option-b--manual-curl-testing-with-the-dev-token-helper).

```bash
BASE=http://localhost:5000
TOKEN="<paste token from npm run dev:auth>"

AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"

# ── 1. Health ────────────────────────────────────────────────
curl -s $BASE/health
curl -s $BASE/health/db

# ── 2. Create a business (you become OWNER) ─────────────────
BID=$(curl -s -X POST $BASE/api/v1/businesses \
  -H "$AUTH" -H "$JSON" \
  -d '{"name":"Demo Shop","currency":"ETB"}' | jq -r .data.id)
echo "BID=$BID"

# ── 3. List your businesses ─────────────────────────────────
curl -s $BASE/api/v1/businesses -H "$AUTH" | jq

# ── 4. Update the profile ───────────────────────────────────
curl -s -X PATCH $BASE/api/v1/businesses/$BID \
  -H "$AUTH" -H "$JSON" -d '{"address":"Addis Ababa"}' | jq

# ── 5. Add a CASHIER member ─────────────────────────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/members \
  -H "$AUTH" -H "$JSON" -d '{"authUserId":"bob","role":"CASHIER"}' | jq

curl -s $BASE/api/v1/businesses/$BID/members -H "$AUTH" | jq

# ── 6. Create a product ─────────────────────────────────────
PID=$(curl -s -X POST $BASE/api/v1/businesses/$BID/products-services \
  -H "$AUTH" -H "$JSON" \
  -d '{"name":"Macchiato","type":"PRODUCT","price":"45.00","sku":"MCH-1"}' \
  | jq -r .data.id)
echo "PID=$PID"

curl -s "$BASE/api/v1/businesses/$BID/products-services?q=macchi" -H "$AUTH" | jq

# ── 7. Create a customer ────────────────────────────────────
CID=$(curl -s -X POST $BASE/api/v1/businesses/$BID/customers \
  -H "$AUTH" -H "$JSON" \
  -d '{"name":"Abebe Kebede","phone":"+251911222333"}' | jq -r .data.id)
echo "CID=$CID"

# ── 8. CASH sale (auto-PAID) ────────────────────────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/sales \
  -H "$AUTH" -H "$JSON" -H "Idempotency-Key: demo-cash-1" \
  -d '{"saleType":"CASH","paymentMethod":"CASH",
       "items":[{"productServiceId":"'$PID'","quantity":"2"}]}' | jq

# ── 9. CREDIT sale with initial payment ─────────────────────
SALE=$(curl -s -X POST $BASE/api/v1/businesses/$BID/sales \
  -H "$AUTH" -H "$JSON" \
  -d '{"saleType":"CREDIT","customerId":"'$CID'",
       "items":[{"productServiceId":"'$PID'","quantity":"3"}],
       "taxAmount":"13.50","initialPaymentAmount":"50.00",
       "paymentMethod":"CASH","notes":"Wedding order"}')
SID=$(echo "$SALE" | jq -r .data.id)
INV=$(echo "$SALE" | jq -r .data.invoice.invoiceNumber)
echo "SID=$SID  INV=$INV"
echo "$SALE" | jq '.data | {status,totalAmount,amountPaid,balanceDue}'

# ── 10. List sales with filters ─────────────────────────────
curl -s "$BASE/api/v1/businesses/$BID/sales?status=OPEN" -H "$AUTH" | jq
curl -s "$BASE/api/v1/businesses/$BID/sales?invoice=$INV" -H "$AUTH" | jq

# ── 11. Read the sale ───────────────────────────────────────
curl -s $BASE/api/v1/businesses/$BID/sales/$SID -H "$AUTH" | jq

# ── 12. Try to overpay (expect 400) ─────────────────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/payments \
  -H "$AUTH" -H "$JSON" \
  -d '{"amount":"999.00","method":"CASH"}' | jq

# ── 13. Settle the balance (expect PAID) ────────────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/payments \
  -H "$AUTH" -H "$JSON" -H "Idempotency-Key: demo-pay-1" \
  -d '{"amount":"98.50","method":"BANK_TRANSFER","reference":"TXN-9"}' \
  | jq '.data | {paymentId, status: .sale.status, balanceDue: .sale.balanceDue}'

# ── 14. Reuse the idempotency key (expect 409) ──────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/payments \
  -H "$AUTH" -H "$JSON" -H "Idempotency-Key: demo-pay-1" \
  -d '{"amount":"10.00","method":"CASH"}' | jq

# ── 15. Invoice JSON + printable HTML ───────────────────────
curl -s $BASE/api/v1/businesses/$BID/sales/$SID/invoice -H "$AUTH" | jq
curl -s $BASE/api/v1/businesses/$BID/sales/$SID/invoice/print \
  -H "$AUTH" -o invoice.html && open invoice.html

# ── 16. Reports ─────────────────────────────────────────────
curl -s "$BASE/api/v1/businesses/$BID/reports/sales/summary" -H "$AUTH" | jq
curl -s "$BASE/api/v1/businesses/$BID/reports/customers/balances" -H "$AUTH" | jq
curl -s "$BASE/api/v1/businesses/$BID/reports/payments" -H "$AUTH" | jq

# ── 17. Negative tests ──────────────────────────────────────
# No token (expect 401)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/businesses

# Unknown route (expect 404)
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/v1/nope

# Malformed JSON (expect 400)
curl -s -X POST $BASE/api/v1/businesses -H "$AUTH" -H "$JSON" -d '{bad'

# ── 18. Void a sale (OWNER only) ────────────────────────────
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/void \
  -H "$AUTH" -H "$JSON" \
  -d '{"reason":"Customer cancelled the order"}' | jq '.data.status'

# Payment on voided sale (expect 409)
curl -s -X POST $BASE/api/v1/businesses/$BID/sales/$SID/payments \
  -H "$AUTH" -H "$JSON" -d '{"amount":"1.00","method":"CASH"}' | jq
```

> `jq` is used for readability — install it with `apt install jq` /
> `brew install jq`, or drop the `| jq` parts.

---

## 8. Data model

Schema: [`backend/database/schema.sql`](../backend/database/schema.sql)

```
businesses
 ├─ business_memberships   id, business_id, auth_user_id, role(OWNER|CASHIER), is_active
 ├─ customers              id, business_id, name, phone, email, address, notes, is_active
 ├─ product_services       id, business_id, name, sku, type(PRODUCT|SERVICE), price, is_active
 ├─ invoice_sequences      business_id → next_number   (row-locked counter)
 ├─ sales                  id, business_id, customer_id, created_by_membership_id,
 │   │                     sale_type(CASH|CREDIT), status(OPEN|PAID|VOID),
 │   │                     subtotal, discount_amount, tax_amount, total_amount,
 │   │                     void_reason, voided_at, voided_by_membership_id
 │   ├─ sale_lines         snapshots: item_name, item_type, sku_snapshot,
 │   │                     quantity, unit_price, discount_amount, line_total
 │   ├─ payments           amount, method, reference, idempotency_key, received_at
 │   ├─ invoices           invoice_number (unique per business, 1:1 with sale)
 │   └─ audit_events       action, entity_type, entity_id, reason, details(JSON)
 └─ audit_events           business-level actions (BUSINESS_CREATED, …)
```

### Design invariants

| Invariant | How it's enforced |
| --- | --- |
| Tenant isolation | Most FKs are composite `(business_id, id)`; every query filters on `business_id` |
| Money integrity | Integer-cent arithmetic; `DECIMAL(12,2)` columns; `CHECK >= 0` constraints |
| Price integrity | Prices loaded from DB inside the transaction with `FOR UPDATE` |
| Unique invoice numbers | `invoice_sequences` row lock (`SELECT … FOR UPDATE`) |
| Idempotent payments | `UNIQUE (business_id, idempotency_key)` |
| Historical accuracy | `sale_lines` snapshot name/price/sku; products & customers are soft-deleted |
| Referential safety | All FKs `ON DELETE RESTRICT` — delete children first |
| Audit trail | `audit_events` rows for `SALE_CREATED`, `SALE_VOIDED`, `PAYMENT_RECORDED`, `BUSINESS_CREATED` |

### Status transitions

```
              ┌──────────────► PAID  (payment == total)
  created ────┤
   OPEN ──────┴──────────────► PAID  (later payment settles balance)
     │
     └───────────────────────► VOID  (OWNER, with reason)
  PAID ──────────────────────► VOID  (OWNER, with reason)
  VOID ───────────────────────► ✗    (terminal — payments rejected, double-void 409)
```

---

## Appendix — endpoint checklist

| # | Method | Path | Role |
| --- | --- | --- | --- |
| 1 | GET | `/health` | public |
| 2 | GET | `/health/db` | public |
| 3 | GET | `/api/v1/businesses` | any |
| 4 | POST | `/api/v1/businesses` | any |
| 5 | GET | `/api/v1/businesses/:businessId` | OWNER, CASHIER |
| 6 | PATCH | `/api/v1/businesses/:businessId` | OWNER |
| 7 | GET | `/api/v1/businesses/:businessId/members` | OWNER |
| 8 | POST | `/api/v1/businesses/:businessId/members` | OWNER |
| 9 | PATCH | `/api/v1/businesses/:businessId/members/:membershipId` | OWNER |
| 10 | GET | `/api/v1/businesses/:businessId/products-services` | OWNER, CASHIER |
| 11 | GET | `/api/v1/businesses/:businessId/products-services/:productId` | OWNER, CASHIER |
| 12 | POST | `/api/v1/businesses/:businessId/products-services` | OWNER |
| 13 | PATCH | `/api/v1/businesses/:businessId/products-services/:productId` | OWNER |
| 14 | DELETE | `/api/v1/businesses/:businessId/products-services/:productId` | OWNER |
| 15 | GET | `/api/v1/businesses/:businessId/customers` | OWNER, CASHIER |
| 16 | GET | `/api/v1/businesses/:businessId/customers/:customerId` | OWNER, CASHIER |
| 17 | POST | `/api/v1/businesses/:businessId/customers` | OWNER, CASHIER |
| 18 | PATCH | `/api/v1/businesses/:businessId/customers/:customerId` | OWNER, CASHIER |
| 19 | DELETE | `/api/v1/businesses/:businessId/customers/:customerId` | OWNER |
| 20 | POST | `/api/v1/businesses/:businessId/sales` | OWNER, CASHIER |
| 21 | GET | `/api/v1/businesses/:businessId/sales` | OWNER, CASHIER |
| 22 | GET | `/api/v1/businesses/:businessId/sales/:saleId` | OWNER, CASHIER |
| 23 | POST | `/api/v1/businesses/:businessId/sales/:saleId/payments` | OWNER, CASHIER |
| 24 | POST | `/api/v1/businesses/:businessId/sales/:saleId/void` | OWNER |
| 25 | GET | `/api/v1/businesses/:businessId/sales/:saleId/invoice` | OWNER, CASHIER |
| 26 | GET | `/api/v1/businesses/:businessId/sales/:saleId/invoice/print` | OWNER, CASHIER |
| 27 | GET | `/api/v1/businesses/:businessId/reports/sales/summary` | OWNER, CASHIER |
| 28 | GET | `/api/v1/businesses/:businessId/reports/customers/balances` | OWNER, CASHIER |
| 29 | GET | `/api/v1/businesses/:businessId/reports/payments` | OWNER, CASHIER |
