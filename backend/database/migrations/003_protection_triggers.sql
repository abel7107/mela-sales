-- =============================================================================
-- Mela Sales - 003_protection_triggers.sql
-- Database-level safety net: financial and audit rows can't be hard-deleted,
-- and audit events can't be edited. Voiding/reversing is done via status.
-- Apply with the mysql client (handles DELIMITER).
-- =============================================================================
USE mela_sales;

DELIMITER $$

CREATE TRIGGER trg_sales_no_delete BEFORE DELETE ON sales FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sales cannot be deleted; void them instead'; END$$

CREATE TRIGGER trg_sale_lines_no_delete BEFORE DELETE ON sale_lines FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sale lines cannot be deleted'; END$$

CREATE TRIGGER trg_payments_no_delete BEFORE DELETE ON payments FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payments cannot be deleted; reverse them instead'; END$$

CREATE TRIGGER trg_invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invoices cannot be deleted; void them instead'; END$$

CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit_events FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only'; END$$

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit_events FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only'; END$$

-- Money on a recorded sale line / payment must not be silently rewritten.
CREATE TRIGGER trg_sale_lines_no_update BEFORE UPDATE ON sale_lines FOR EACH ROW
BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sale lines are immutable; void the sale and create a new one'; END$$

CREATE TRIGGER trg_payments_no_money_update BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.sale_id <> OLD.sale_id OR NEW.business_id <> OLD.business_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount/sale cannot be changed; reverse and re-record';
  END IF;
END$$

CREATE TRIGGER trg_sales_no_money_update BEFORE UPDATE ON sales FOR EACH ROW
BEGIN
  IF NEW.total <> OLD.total OR NEW.subtotal <> OLD.subtotal OR NEW.tax_total <> OLD.tax_total
     OR NEW.discount_total <> OLD.discount_total OR NEW.business_id <> OLD.business_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sale totals cannot be edited; void and re-create';
  END IF;
  IF OLD.status = 'VOIDED' AND NEW.status <> 'VOIDED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A voided sale cannot be reactivated';
  END IF;
END$$

DELIMITER ;
