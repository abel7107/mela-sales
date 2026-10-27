# Mela Sales – Database (MySQL 8.4 LTS)

```
backend/
  database/
    migrations/
      001_init.sql                 tables, keys, constraints, indexes
      002_views.sql                v_sale_balances, v_customer_balances
      003_protection_triggers.sql  blocks hard deletes / edits of financial + audit rows
      004_optional_recurrence.sql  ONLY if the mentor approves recurring payments
    seeds/dev_seed.sql             fake data for development only
```

## Apply (any MySQL 8.x server, using the mysql client)
Run the files in this order:
```bash
mysql -u <user> -p < backend/database/migrations/001_init.sql
mysql -u <user> -p < backend/database/migrations/002_views.sql
mysql -u <user> -p < backend/database/migrations/003_protection_triggers.sql
mysql -u <user> -p < backend/database/seeds/dev_seed.sql      # development only, never production
```
`004_optional_recurrence.sql` is applied only if recurring payments are approved.

Backend `.env` (see `backend/.env.example`): `DATABASE_URL="mysql://<user>:<password>@localhost:3306/mela_sales"`.
Use a least-privilege database user in production.

## Key design rules
- Money is `DECIMAL`; the backend calculates totals and stores them.
- Paid amount / balance are derived from `payments.status = 'VALID'` (views), never stored.
- Child tables use composite FKs `(business_id, parent_id)` so rows cannot reference another business.
- Void sales / reverse payments with status + reason; hard deletes are blocked by triggers.
- Invoice numbers: use `invoice_sequences` inside one transaction (steps are in 001_init.sql). Never `MAX()+1`.
- Duplicate payments: send an `idempotency_key`; it is unique per business.
- Backend queries must be scoped by the business_id from the verified membership, never from the request body.

## Backup / restore
```bash
# backup (schedule daily)
mysqldump --single-transaction --routines --triggers -u <backup_user> -p mela_sales | gzip > mela_sales_$(date +%F).sql.gz
# restore test: load into a scratch database and compare row counts
mysql -u root -p -e "CREATE DATABASE mela_restore_test"
gunzip -c mela_sales_YYYY-MM-DD.sql.gz | sed 's/`mela_sales`/`mela_restore_test`/g' | mysql -u root -p mela_restore_test
```

## Pending mentor decisions that may change this schema
Tax/rounding rules, precision, sale lifecycle, invoice number format and reset period, payment methods,
overpayment/refund policy, customer required on credit sales (currently enforced), recurring payments, public share link.
Columns marked `[PROVISIONAL]` in the SQL are the ones to revisit.
