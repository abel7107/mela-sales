# Mela Sales API (v1)

Base: `/api/v1` · JSON · money as **strings** (`"125.50"`) · quantities up to 3 decimals · errors:
`{ "error": { "code": "OVERPAYMENT", "message": "…localized…", "issues"?: [...] } }`

Auth: session cookie `mela_session` (HttpOnly). After login/register the response includes `csrfToken`; send it on every
POST/PATCH/PUT/DELETE as `X-CSRF-Token` (also available in the `mela_csrf` cookie). Language: `Accept-Language: am` or `?lang=am`.
Pagination: `?page=1&limit=25` → `{ data, total, page, limit }`. Roles: **O** = owner only, **A** = owner + cashier.

## Auth
| Method & path | Notes |
|---|---|
| POST `/auth/register` | `{businessName,name,email,password(≥10)}` creates business + owner (local mode) |
| POST `/auth/login` | `{email,password}` |
| POST `/auth/mela` | `{token, businessName?}` exchange a Mela Auth JWT; `businessName` needed on first sign-in |
| POST `/auth/logout`, GET `/auth/me` | |

## Users (O)
GET/POST `/users` `{name,email,role,password?}` · PATCH `/users/:id` `{name?,role?,active?}` (cannot change self)

## Business
GET `/business` (A) · PATCH `/business` (O) `{name,phone,email,address,tin,invoicePrefix}` · POST `/business/logo` (O, multipart field `logo`, PNG/JPEG ≤ 1 MB) · GET `/business/logo` (A)

## Products & services
GET `/products?q=&active=` (A; `q` matches name or exact SKU/barcode) · POST (O) `{name,price,taxRate?,sku?,isService?,trackStock?,stockQty?,lowStockAt?}` ·
PATCH `/products/:id` (O; `active:false` to retire) · POST `/products/:id/stock` (O) `{delta:"-2",reason}` · GET `/products/low-stock` (O)

## Customers
GET `/customers?q=&owing=true` (list includes `balance`) · POST `{name,phone?,email?,address?,note?}` · GET `/customers/:id` (balance, payment history, open credit sales) ·
PATCH `/customers/:id` · POST `/customers/:id/payments` `{amount,method?,note?}` (applied oldest sale first)

## Sales
POST `/sales`
```json
{
  "paymentType": "CASH",            // or "CREDIT" (needs customerId; optional initialPayment, dueDate)
  "paymentMethod": "CASH",          // CASH | BANK | MOBILE | OTHER
  "customerId": "uuid",
  "items": [
    { "productId": "uuid", "quantity": "2", "discount": "5.00" },
    { "name": "Delivery", "quantity": "1", "unitPrice": "50", "taxRate": "0" }
  ],
  "note": "optional"
}
```
Returns the sale with items and invoice. Tax rate/price default from the product. Discount is a per-line amount.
GET `/sales?from=YYYY-MM-DD&to=&customerId=&status=&paymentType=` (cashiers see only their own) · GET `/sales/:id` ·
PATCH `/sales/:id` `{note?,dueDate?}` only · POST `/sales/:id/void` (O) `{reason}` · POST `/sales/:id/payments` `{amount,method?,note?}`
There is **no delete**.

## Invoices
GET `/invoices?q=` · GET `/invoices/:id` · GET `/invoices/:id/pdf[?download=1&lang=am]` ·
POST `/invoices/:id/share` `{expiresInDays?}` → `{url, expiresAt, links:{whatsapp,telegram,email}}` · DELETE `/invoices/:id/shares` (revoke all) ·
Public: GET `/public/invoices/:token` → PDF (no login)

## Reports (O)
GET `/reports/summary?from=&to=&groupBy=day|week|month` → totals + buckets (`total, cashTotal, creditTotal, discountTotal, taxTotal, paymentsReceived`) ·
GET `/reports/overdue` · GET `/reports/sales.csv?from=&to=`

## Recurring (O to write)
GET/POST `/recurring` · GET `/recurring/:id` · PATCH `/recurring/:id` `{status: ACTIVE|PAUSED|CANCELLED}` · POST `/recurring/run-due`
See `docs/RECURRING.md`.

## Audit log (O)
GET `/audit-logs?entity=&entityId=&action=`

## Other
GET `/health` (no auth)
