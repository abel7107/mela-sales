# Mela Sales

Mela Sales is a web-based sales management system for tracking daily sales, managing cash and credit payments, monitoring customer balances, and generating printable or shareable invoices.

## Project Structure

```text
mela-sales/
├── backend/     Express 5 + TypeScript + MySQL API
└── frontend/    React + TypeScript + Vite + Tailwind CSS
```

## Requirements

### Backend
- Node.js 20+
- MySQL 8+
- npm

### Frontend
- Node.js 20+
- npm

## Backend Setup

```bash
cd backend
cp .env.example .env    # then fill in your values
npm install

# apply the baseline schema to your database
mysql -u <user> -p <db_name> < database/migrations/007_baseline_current_schema.sql

npm run dev             # http://localhost:5000
```

Or with Docker for MySQL:

```bash
cd backend
docker compose up -d mysql
docker compose --profile tools run --rm migrate
```

## Frontend Setup

```bash
cd frontend
cp .env.example .env    # optional
npm install
npm run dev             # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:5001`.

## Backend Environment Variables

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (default `5000`) |
| `NODE_ENV` | `development`, `test`, or `production` |
| `CORS_ORIGINS` | Comma-separated allowlist. Empty allows all in non-production only |
| `RATE_LIMIT_PER_MINUTE` | Requests per minute per IP (default `300`, ignored in tests) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `MELA_AUTH_ISSUER` | Expected JWT `iss` |
| `MELA_AUTH_AUDIENCE` | Expected JWT `aud` |
| `MELA_AUTH_JWKS_URL` | JWKS endpoint used to verify tokens |
| `MELA_AUTH_PRIVATE_KEY_PATH` | Path to the RS256 private signing key in production |

## Frontend Environment Variables

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Optional absolute API base URL. Leave empty for same-origin or Vite proxy |

## Authentication

Every endpoint except `/health` and `/health/db` requires:

```http
Authorization: Bearer <access-token>
```

Access tokens are JWTs signed with RS256 and verified locally using JWKS (signature, issuer, audience, expiry). Refresh tokens are stored hashed in MySQL. Password reset tokens expire after one hour.

Roles:
- `OWNER`: business profile, products, members, branches, sales, reports, voiding
- `CASHIER`: sales, customers, products/reports read access

## Database

- MySQL 8+
- Baseline schema: `backend/database/migrations/007_baseline_current_schema.sql`
- Money is stored as `DECIMAL(12,2)`
- Tenant isolation uses composite foreign keys `(business_id, id)`
- Invoice numbers use `invoice_sequences` inside a transaction
- Do not rerun historical migrations

## Scripts

### Backend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm run dev:auth` | Mint a local JWT + JWKS endpoint for manual testing |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check only |
| `npm run lint` | Type-check plus unused locals/params |
| `npm test` | Run unit and integration tests |
| `npm run test:watch` | Re-run tests on change |

### Frontend

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Vite dev server |
| `npm run build` | Type-check and build production bundle |
| `npm run lint` | Run oxlint |
| `npm run preview` | Preview production build |

## Testing

Backend tests run against the database configured in `backend/.env`. The integration suite creates and removes its own rows.

```bash
cd backend
npm test

cd ../frontend
npm run build
npm run lint
```

## Deployment

Backend Docker image:

```bash
cd backend
docker build -t mela-sales-api .
docker run -p 5000:5000 --env-file .env mela-sales-api
```

Production checklist:
- Set `NODE_ENV=production`
- Set `CORS_ORIGINS` to the frontend origin
- Provision the RS256 private key and set `MELA_AUTH_PRIVATE_KEY_PATH`
- Use a least-privilege MySQL user
- Apply `007_baseline_current_schema.sql` to a fresh database
- Put HTTPS in front of the API
- Serve the frontend build behind the same origin or configure `VITE_API_BASE_URL`

## Health Checks

- `GET /health`
- `GET /health/db`
