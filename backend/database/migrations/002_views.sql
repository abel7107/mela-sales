-- =============================================================================
-- Mela Sales - 002_views.sql
-- Derived values. Paid amount and balance always come from VALID payments;
-- they are never stored as editable columns.
-- Always filter these views by business_id in backend queries.
-- =============================================================================
USE mela_sales;

CREATE OR REPLACE VIEW v_sale_balances AS
SELECT
  s.business_id,
  s.id          AS sale_id,
  s.customer_id,
  s.sale_type,
  s.status,
  s.sold_at,
  s.total,
  COALESCE(p.paid, 0.00)                                   AS paid,
  CASE WHEN s.status = 'VOIDED' THEN 0.00
       ELSE s.total - COALESCE(p.paid, 0.00) END           AS balance   -- negative = overpaid [PROVISIONAL rule]
FROM sales s
LEFT JOIN (
  SELECT business_id, sale_id, SUM(amount) AS paid
  FROM payments
  WHERE status = 'VALID'
  GROUP BY business_id, sale_id
) p ON p.business_id = s.business_id AND p.sale_id = s.id;

CREATE OR REPLACE VIEW v_customer_balances AS
SELECT
  c.business_id,
  c.id          AS customer_id,
  c.name,
  COALESCE(SUM(b.balance), 0.00) AS outstanding_balance
FROM customers c
LEFT JOIN v_sale_balances b
  ON b.business_id = c.business_id AND b.customer_id = c.id AND b.status = 'COMPLETED'
GROUP BY c.business_id, c.id, c.name;

-- Daily/weekly/monthly reports: group v_sale_balances (or sales) by
-- DATE(CONVERT_TZ(sold_at,'+00:00', <business offset>)), YEARWEEK(...), or month,
-- WHERE status = 'COMPLETED', splitting by sale_type for cash vs credit.
-- "Payments received" is reported from payments.received_at (status VALID),
-- not from sales.sold_at, so sales, collections and outstanding stay distinct.
