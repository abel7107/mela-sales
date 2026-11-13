# Mela Sales Database Migrations

## Current database reference

`schema.sql` is the current schema snapshot generated from the live
`mela_sales_db` database.

Do not execute this snapshot as a migration.

## Migration history

| File | Status | Notes |
|---|---|---|
| 001_init.sql | Historical / legacy | Initial schema; differs from current live database. |
| 002_views.sql | Legacy / incompatible | References outdated database, columns, and statuses. Do not rerun. |
| 003_protection_triggers.sql | Not applied / incompatible | No triggers are currently installed. Definitions reference outdated columns and statuses. |
| 004_optional_recurrence.sql | Optional / not approved | Recurring schedule design; not the agreed installment implementation. |
| 005_branch_management.sql | Applied | Branch tables and sales.branch_id exist in the live database. Do not rerun. |
| 006_installment_plans.sql | Applied | Installment plans, schedules, allocations, and notifications tables exist in the live database. Do not rerun. |
| 007_baseline_current_schema.sql | Baseline | Non-destructive `CREATE TABLE IF NOT EXISTS` snapshot of the current live schema for fresh deployments. |

## Rules

1. Never rerun an already-applied migration.
2. Never edit historical migrations to represent the current schema.
3. Create new numbered migrations for future database changes.
4. Review and back up the database before applying migrations.
5. Update `schema.sql` after approved schema changes.
6. Do not apply optional migrations without explicit approval.
