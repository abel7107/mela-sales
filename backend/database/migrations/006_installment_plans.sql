-- Migration 006: Credit installment plans, FIFO allocation records, and reminders
-- STATUS: DRAFT — REVIEW ONLY. DO NOT APPLY UNTIL APPROVED.
-- Requires migration 005 (branch management) to have been applied.
-- MySQL 8.0 / InnoDB / utf8mb4_unicode_ci conventions.

-- ---------------------------------------------------------------------------
-- 1. Installment plans
-- A sale may have multiple historical plans, but only one ACTIVE plan.
-- ---------------------------------------------------------------------------
CREATE TABLE installment_plans (
  id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  sale_id CHAR(36) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  status ENUM('ACTIVE', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',

  active_sale_id CHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN status = 'ACTIVE' THEN sale_id ELSE NULL END
    ) STORED,

  created_by_membership_id CHAR(36) NOT NULL,
  cancelled_by_membership_id CHAR(36) NULL,
  cancelled_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_installment_plans_business_id
    (business_id, id),

  UNIQUE KEY uq_installment_plans_business_sale_id
    (business_id, sale_id, id),

  UNIQUE KEY uq_installment_plans_one_active_sale
    (business_id, active_sale_id),

  KEY idx_installment_plans_business_sale
    (business_id, sale_id),

  KEY idx_installment_plans_creator
    (business_id, created_by_membership_id),

  CONSTRAINT fk_installment_plans_sale
    FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_installment_plans_creator
    FOREIGN KEY (business_id, created_by_membership_id)
    REFERENCES business_memberships (business_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_installment_plans_cancelled_by
    FOREIGN KEY (business_id, cancelled_by_membership_id)
    REFERENCES business_memberships (business_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_installment_plans_total_positive
    CHECK (total_amount > 0),

  CONSTRAINT chk_installment_plans_cancel_fields
    CHECK (
      (status = 'ACTIVE'
        AND cancelled_at IS NULL
        AND cancelled_by_membership_id IS NULL)
      OR
      (status = 'CANCELLED'
        AND cancelled_at IS NOT NULL
        AND cancelled_by_membership_id IS NOT NULL)
    )

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Installment schedule
-- Remaining balance and status are derived from allocations and due_date.
-- ---------------------------------------------------------------------------

CREATE TABLE installments (
  id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  sale_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,

  installment_number INT UNSIGNED NOT NULL,
  amount_due DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_installments_business_id
    (business_id, id),

  UNIQUE KEY uq_installments_business_sale_id
    (business_id, sale_id, id),

  UNIQUE KEY uq_installments_plan_number
    (business_id, plan_id, installment_number),

  KEY idx_installments_fifo
    (business_id, sale_id, due_date, installment_number),

  KEY idx_installments_plan
    (business_id, sale_id, plan_id),

  CONSTRAINT fk_installments_plan
    FOREIGN KEY (business_id, sale_id, plan_id)
    REFERENCES installment_plans (business_id, sale_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_installments_amount_positive
    CHECK (amount_due > 0),

  CONSTRAINT chk_installments_number_positive
    CHECK (installment_number > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Payment allocation support
-- Each allocation connects a payment to an installment belonging to
-- the same business and sale.
-- ---------------------------------------------------------------------------

ALTER TABLE payments
  ADD UNIQUE KEY uq_payments_business_sale_id
    (business_id, sale_id, id);

CREATE TABLE installment_payment_allocations (
  id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  sale_id CHAR(36) NOT NULL,
  payment_id CHAR(36) NOT NULL,
  installment_id CHAR(36) NOT NULL,

  allocated_amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_installment_allocation_payment_installment
    (business_id, payment_id, installment_id),

  KEY idx_installment_allocations_installment
    (business_id, sale_id, installment_id),

  KEY idx_installment_allocations_payment
    (business_id, sale_id, payment_id),

  CONSTRAINT fk_installment_allocations_payment
    FOREIGN KEY (business_id, sale_id, payment_id)
    REFERENCES payments (business_id, sale_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_installment_allocations_installment
    FOREIGN KEY (business_id, sale_id, installment_id)
    REFERENCES installments (business_id, sale_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_installment_allocations_amount_positive
    CHECK (allocated_amount > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. In-app notifications
-- A recipient receives each reminder type at most once per installment.
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  recipient_membership_id CHAR(36) NOT NULL,
  installment_id CHAR(36) NOT NULL,

  type ENUM('UPCOMING', 'DUE_TODAY', 'OVERDUE') NOT NULL,
  message VARCHAR(500) NOT NULL,

  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,

  PRIMARY KEY (id),

  UNIQUE KEY uq_notifications_recipient_installment_type
    (business_id, recipient_membership_id, installment_id, type),

  KEY idx_notifications_inbox
    (business_id, recipient_membership_id, is_read, created_at),

  KEY idx_notifications_installment
    (business_id, installment_id),

  CONSTRAINT fk_notifications_recipient
    FOREIGN KEY (business_id, recipient_membership_id)
    REFERENCES business_memberships (business_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_notifications_installment
    FOREIGN KEY (business_id, installment_id)
    REFERENCES installments (business_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT chk_notifications_read_at
    CHECK (
      (is_read = FALSE AND read_at IS NULL)
      OR
      (is_read = TRUE AND read_at IS NOT NULL)
    )

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- END OF DRAFT MIGRATION 006.
--
-- Business rules enforced by backend transactions:
-- * Only CREDIT, non-VOID sales may receive a plan.
-- * Plan total equals outstanding sale balance at creation.
-- * Schedule total equals plan total.
-- * Schedule edits preserve the unpaid plan balance.
-- * An installment cannot be reduced below its allocated amount.
-- * FIFO allocation cannot exceed payment or installment balances.
-- * Cancelled plans receive no new allocations or reminders.
-- * Notifications respect OWNER and branch-assigned CASHIER permissions.
-- ---------------------------------------------------------------------------
