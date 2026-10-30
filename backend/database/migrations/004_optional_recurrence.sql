-- =============================================================================
-- Mela Sales - 004_optional_recurrence.sql   *** OPTIONAL ***
-- Apply ONLY if the mentor approves recurring payments for this deadline.
-- Decide first (Section 9.2): installment plan vs recurring invoice vs reminder.
-- This table models the "recurring invoice / subscription" case; an installment
-- plan can also reuse it (kind = 'INSTALLMENT').
-- =============================================================================
USE mela_sales;

CREATE TABLE recurrence_schedules (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  business_id        CHAR(36)      NOT NULL,
  customer_id        CHAR(36)      NOT NULL,
  template_sale_id   CHAR(36)      NULL,                      -- sale whose lines are copied each cycle
  kind               ENUM('SUBSCRIPTION','INSTALLMENT','REMINDER_ONLY') NOT NULL,
  interval_unit      ENUM('DAY','WEEK','MONTH') NOT NULL,
  interval_count     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  installment_amount DECIMAL(12,2) NULL,
  total_cycles       SMALLINT UNSIGNED NULL,                  -- NULL = until cancelled
  completed_cycles   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  next_run_at        DATETIME(3)   NOT NULL,                  -- UTC
  status             ENUM('ACTIVE','PAUSED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'ACTIVE',
  created_by_subject VARCHAR(191)  NOT NULL,
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_recur_due (status, next_run_at),
  CONSTRAINT fk_recur_customer FOREIGN KEY (business_id, customer_id) REFERENCES customers (business_id, id),
  CONSTRAINT fk_recur_sale FOREIGN KEY (business_id, template_sale_id) REFERENCES sales (business_id, id),
  CONSTRAINT ck_recur_interval CHECK (interval_count > 0)
) ENGINE=InnoDB;

-- Duplicate-job prevention: one generated invoice/sale per schedule per cycle.
CREATE TABLE recurrence_runs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id  CHAR(36)    NOT NULL,
  cycle_no     SMALLINT UNSIGNED NOT NULL,
  sale_id      CHAR(36)    NULL,
  run_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_schedule_cycle (schedule_id, cycle_no),
  CONSTRAINT fk_run_schedule FOREIGN KEY (schedule_id) REFERENCES recurrence_schedules (id)
) ENGINE=InnoDB;
