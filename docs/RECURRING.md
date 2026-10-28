# Recurring payments – decision record

**Who creates the next invoice?** The system, automatically.

- An owner creates a *plan*: customer, items, `WEEKLY` or `MONTHLY`, `startDate`, optional `totalRuns`.
  - No `totalRuns` = subscription (runs until paused/cancelled).
  - `totalRuns = N` = installments (plan becomes `COMPLETED` after N invoices).
- **When?** A scheduler (every `SCHEDULER_INTERVAL_SECONDS`, default 300 s) finds `ACTIVE` plans with `nextRunAt <= now`
  and creates one **credit sale + invoice** per due run (up to 12 missed periods caught up per tick).
- Run *k* is dated `startDate + k periods`, computed from the start date (not from the previous run), so
  monthly plans started on the 31st land on the month end (Feb 28/29) and return to the 31st.
- Generated invoices are normal credit sales: the customer pays later (partial payments allowed), they show in the
  customer balance, reports and `/reports/overdue`. Payment is never assumed.
- **Safety**: the run is claimed with a guarded `UPDATE … WHERE runsDone = ?` in the same transaction as the sale,
  and `(recurringPlanId, recurringRunNo)` is UNIQUE → no duplicates even with several API instances.
- If a run fails (customer deactivated, stock too low) nothing is created, the plan is untouched and is retried next tick.
- Pause = `PATCH /recurring/:id {status:"PAUSED"}`. Resuming does **not** back-fill missed dates beyond the 12-run catch-up; cancel and recreate if that is not wanted.
- Prices in a plan are copied at creation (or taken from the product at run time if omitted).
- All times are UTC; business-local display uses `BUSINESS_TZ_OFFSET_MINUTES` (Ethiopia = 180).
