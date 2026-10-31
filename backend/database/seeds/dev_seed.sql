-- Development seed data ONLY. Never run in production.
-- Fixed IDs so teammates get the same data. auth_subject values are fake.
USE mela_sales;

INSERT INTO businesses (id, name, phone, address, currency_code) VALUES
 ('b1111111-1111-4111-8111-111111111111', 'Demo Shop A', '0911000001', 'Dire Dawa', 'ETB'),
 ('b2222222-2222-4222-8222-222222222222', 'Demo Shop B', '0911000002', 'Addis Ababa', 'ETB');

INSERT INTO business_memberships (business_id, auth_subject, role) VALUES
 ('b1111111-1111-4111-8111-111111111111', 'dev-owner-a',   'OWNER'),
 ('b1111111-1111-4111-8111-111111111111', 'dev-cashier-a', 'CASHIER'),
 ('b2222222-2222-4222-8222-222222222222', 'dev-owner-b',   'OWNER');

INSERT INTO customers (id, business_id, name, phone) VALUES
 ('c1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'Abebe Kebede', '0911223344'),
 ('c2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'Almaz Tesfaye', '0922334455'),
 ('c3333333-3333-4333-8333-333333333333', 'b2222222-2222-4222-8222-222222222222', 'Other Business Customer', NULL);

INSERT INTO product_services (id, business_id, kind, code, name, unit_price, tax_rate) VALUES
 ('d1111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', 'PRODUCT', 'SUG-1KG', 'Sugar 1kg',     120.00, 0.00),
 ('d2222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'PRODUCT', 'OIL-1L',  'Cooking oil 1L', 250.00, 15.00),
 ('d3333333-3333-4333-8333-333333333333', 'b1111111-1111-4111-8111-111111111111', 'SERVICE', NULL,      'Delivery',        50.00, 0.00);

-- Cash sale: 2 x oil @250 = 500 + 15% tax 75 = 575, fully paid
INSERT INTO sales (id, business_id, customer_id, sale_type, subtotal, tax_total, total, created_by_subject, sold_at) VALUES
 ('51111111-1111-4111-8111-111111111111', 'b1111111-1111-4111-8111-111111111111', NULL, 'CASH', 500.00, 75.00, 575.00, 'dev-cashier-a', '2026-10-26 07:00:00.000');
INSERT INTO sale_lines (business_id, sale_id, line_no, product_service_id, description, quantity, unit_price, tax_rate, tax_amount, line_total) VALUES
 ('b1111111-1111-4111-8111-111111111111', '51111111-1111-4111-8111-111111111111', 1, 'd2222222-2222-4222-8222-222222222222', 'Cooking oil 1L', 2.000, 250.00, 15.00, 75.00, 575.00);
INSERT INTO payments (business_id, sale_id, amount, method, received_at, created_by_subject) VALUES
 ('b1111111-1111-4111-8111-111111111111', '51111111-1111-4111-8111-111111111111', 575.00, 'CASH', '2026-10-26 07:00:00.000', 'dev-cashier-a');

-- Credit sale: 10 x sugar @120 = 1200, paid 500 so far -> balance 700
INSERT INTO sales (id, business_id, customer_id, sale_type, subtotal, tax_total, total, created_by_subject, sold_at) VALUES
 ('52222222-2222-4222-8222-222222222222', 'b1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'CREDIT', 1200.00, 0.00, 1200.00, 'dev-owner-a', '2026-10-26 09:30:00.000');
INSERT INTO sale_lines (business_id, sale_id, line_no, product_service_id, description, quantity, unit_price, line_total) VALUES
 ('b1111111-1111-4111-8111-111111111111', '52222222-2222-4222-8222-222222222222', 1, 'd1111111-1111-4111-8111-111111111111', 'Sugar 1kg', 10.000, 120.00, 1200.00);
INSERT INTO payments (business_id, sale_id, amount, method, received_at, idempotency_key, created_by_subject) VALUES
 ('b1111111-1111-4111-8111-111111111111', '52222222-2222-4222-8222-222222222222', 500.00, 'CASH', '2026-10-26 09:35:00.000', 'seed-pay-1', 'dev-owner-a');

-- Invoice sequence + invoice for the cash sale
INSERT INTO invoice_sequences (business_id, period_key, prefix, next_number) VALUES
 ('b1111111-1111-4111-8111-111111111111', 'ALL', 'INV', 2);
INSERT INTO invoices (business_id, sale_id, invoice_number, issued_by_subject) VALUES
 ('b1111111-1111-4111-8111-111111111111', '51111111-1111-4111-8111-111111111111', 'INV-000001', 'dev-cashier-a');

INSERT INTO audit_events (business_id, actor_subject, action, entity_type, entity_id) VALUES
 ('b1111111-1111-4111-8111-111111111111', 'dev-cashier-a', 'SALE_CREATED', 'sale', '51111111-1111-4111-8111-111111111111'),
 ('b1111111-1111-4111-8111-111111111111', 'dev-owner-a',   'SALE_CREATED', 'sale', '52222222-2222-4222-8222-222222222222');
