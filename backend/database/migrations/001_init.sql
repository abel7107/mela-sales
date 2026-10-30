-- =============================================================================
-- Mela Sales - 001_init.sql   (Draft v0.1, Person 4 - Database Developer)
-- Target: MySQL 8.4 LTS (also runs on 8.0), InnoDB, utf8mb4
--
-- Rules followed (from the planning document, Appendix A):
--   * Money = DECIMAL, never FLOAT/DOUBLE.
--   * Every business-owned table has business_id, and child tables use
--     COMPOSITE foreign keys (business_id, parent_id) so a row can never point
--     at another business's parent.
--   * No ON DELETE CASCADE on financial/audit data. Void/reverse via status.
--   * Paid amount and balance are NOT stored; they are derived from VALID
--     payments (see 002_views.sql).
--   * Mela Auth is the identity source: we store only its opaque subject id.
--   * Timestamps are stored in UTC.
--
-- Items marked [PROVISIONAL] depend on mentor decisions (Section 14 / A.4).
-- =============================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS mela_sales
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE mela_sales;

-- -----------------------------------------------------------------------------
-- businesses
-- -----------------------------------------------------------------------------
CREATE TABLE businesses (
  id               CHAR(36)      NOT NULL DEFAULT (UUID()),
  name             VARCHAR(150)  NOT NULL,
  phone            VARCHAR(30)   NULL,
  email            VARCHAR(190)  NULL,
  address          VARCHAR(255)  NULL,
  tax_id           VARCHAR(50)   NULL,                       -- TIN shown on invoices
  currency_code    CHAR(3)       NOT NULL DEFAULT 'ETB',     -- [PROVISIONAL]
  timezone         VARCHAR(64)   NOT NULL DEFAULT 'Africa/Addis_Ababa',
  logo_storage_key VARCHAR(255)  NULL,                       -- random file name, never a user-supplied one
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- business_memberships : links a verified Mela Auth identity to a business+role
-- -----------------------------------------------------------------------------
CREATE TABLE business_memberships (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  business_id   CHAR(36)     NOT NULL,
  auth_subject  VARCHAR(191) NOT NULL,                       -- opaque Mela Auth subject id (no passwords here)
  role          ENUM('OWNER','CASHIER') NOT NULL,
  status        ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership_business_subject (business_id, auth_subject),
  KEY idx_membership_subject (auth_subject),                  -- lookup for GET /api/v1/me
  CONSTRAINT fk_membership_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  business_id  CHAR(36)     NOT NULL,
  name         VARCHAR(150) NOT NULL,
  phone        VARCHAR(30)  NULL,
  email        VARCHAR(190) NULL,
  notes        TEXT         NULL,
  status       ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_business_id (business_id, id),       -- target of composite FKs
  KEY idx_customer_business_name (business_id, name),
  KEY idx_customer_business_phone (business_id, phone),
  CONSTRAINT fk_customer_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- product_services
-- -----------------------------------------------------------------------------
CREATE TABLE product_services (
  id           CHAR(36)      NOT NULL DEFAULT (UUID()),
  business_id  CHAR(36)      NOT NULL,
  kind         ENUM('PRODUCT','SERVICE') NOT NULL DEFAULT 'PRODUCT',
  code         VARCHAR(50)   NULL,                            -- SKU / barcode later
  name         VARCHAR(150)  NOT NULL,
  description  VARCHAR(500)  NULL,
  unit_price   DECIMAL(12,2) NOT NULL,                        -- [PROVISIONAL] precision
  tax_rate     DECIMAL(5,2)  NOT NULL DEFAULT 0.00,           -- percent, e.g. 15.00 [PROVISIONAL]
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_business_id (business_id, id),
  UNIQUE KEY uq_product_business_code (business_id, code),    -- NULL codes allowed, many
  KEY idx_product_business_name (business_id, name),
  CONSTRAINT fk_product_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT ck_product_price CHECK (unit_price >= 0),
  CONSTRAINT ck_product_tax   CHECK (tax_rate >= 0 AND tax_rate <= 100)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- sales
--   Totals are stored as computed by the BACKEND at creation time (the backend
--   is the source of truth for calculation). Paid/balance are derived.
-- -----------------------------------------------------------------------------
CREATE TABLE sales (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  business_id        CHAR(36)      NOT NULL,
  customer_id        CHAR(36)      NULL,
  sale_type          ENUM('CASH','CREDIT') NOT NULL,
  status             ENUM('COMPLETED','VOIDED') NOT NULL DEFAULT 'COMPLETED',  -- [PROVISIONAL] lifecycle
  sold_at            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),      -- used for daily/weekly/monthly reports
  subtotal           DECIMAL(12,2) NOT NULL,                  -- sum of line (qty*price - line discount), before tax
  discount_total     DECIMAL(12,2) NOT NULL DEFAULT 0.00,     -- sale-level discount
  tax_total          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total              DECIMAL(12,2) NOT NULL,
  created_by_subject VARCHAR(191)  NOT NULL,
  voided_at          DATETIME(3)   NULL,
  voided_by_subject  VARCHAR(191)  NULL,
  void_reason        VARCHAR(500)  NULL,
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sale_business_id (business_id, id),
  KEY idx_sale_business_sold_at (business_id, sold_at),       -- reports
  KEY idx_sale_business_type_status (business_id, sale_type, status, sold_at),
  KEY idx_sale_business_customer (business_id, customer_id),  -- customer balances
  CONSTRAINT fk_sale_business FOREIGN KEY (business_id) REFERENCES businesses (id),
  CONSTRAINT fk_sale_customer FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id),
  CONSTRAINT ck_sale_amounts CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0),
  -- A credit sale must belong to a customer or the balance can't be tracked. [PROVISIONAL]
  CONSTRAINT ck_sale_credit_customer CHECK (sale_type = 'CASH' OR customer_id IS NOT NULL),
  -- A voided sale must carry who/when/why.
  CONSTRAINT ck_sale_void_fields CHECK (
    (status = 'VOIDED' AND voided_at IS NOT NULL AND voided_by_subject IS NOT NULL AND void_reason IS NOT NULL)
    OR (status <> 'VOIDED' AND voided_at IS NULL)
  )
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- sale_lines : item snapshots (name/price are copied so later product edits
-- never change past sales)
-- -----------------------------------------------------------------------------
CREATE TABLE sale_lines (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  business_id        CHAR(36)      NOT NULL,
  sale_id            CHAR(36)      NOT NULL,
  line_no            SMALLINT UNSIGNED NOT NULL,
  product_service_id CHAR(36)      NULL,                      -- NULL = ad-hoc line
  description        VARCHAR(255)  NOT NULL,                  -- snapshot
  quantity           DECIMAL(12,3) NOT NULL,                  -- [PROVISIONAL] precision
  unit_price         DECIMAL(12,2) NOT NULL,                  -- snapshot
  discount           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_rate           DECIMAL(5,2)  NOT NULL DEFAULT 0.00,     -- snapshot
  tax_amount         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total         DECIMAL(12,2) NOT NULL,
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_line_sale_lineno (sale_id, line_no),
  KEY idx_line_business_sale (business_id, sale_id),
  KEY idx_line_business_product (business_id, product_service_id),
  CONSTRAINT fk_line_sale FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id),
  CONSTRAINT fk_line_product FOREIGN KEY (business_id, product_service_id)
    REFERENCES product_services (business_id, id),
  CONSTRAINT ck_line_values CHECK (
    quantity > 0 AND unit_price >= 0 AND discount >= 0 AND tax_rate >= 0
    AND tax_amount >= 0 AND line_total >= 0
  )
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- payments : every receipt is its own row. Never edited into a balance field.
--   Mistakes are fixed by status = 'REVERSED', not by deleting.
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
  id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
  business_id        CHAR(36)      NOT NULL,
  sale_id            CHAR(36)      NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  method             ENUM('CASH','MOBILE_MONEY','BANK_TRANSFER','CARD','OTHER') NOT NULL,  -- [PROVISIONAL]
  status             ENUM('VALID','REVERSED') NOT NULL DEFAULT 'VALID',
  received_at        DATETIME(3)   NOT NULL,
  reference          VARCHAR(100)  NULL,                      -- receipt / transaction ref
  idempotency_key    VARCHAR(100)  NULL,                      -- blocks duplicate submissions
  created_by_subject VARCHAR(191)  NOT NULL,
  reversed_at        DATETIME(3)   NULL,
  reversed_by_subject VARCHAR(191) NULL,
  reversal_reason    VARCHAR(500)  NULL,
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_business_id (business_id, id),
  UNIQUE KEY uq_payment_idempotency (business_id, idempotency_key),
  KEY idx_payment_business_sale (business_id, sale_id, status),
  KEY idx_payment_business_received (business_id, received_at),
  CONSTRAINT fk_payment_sale FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id),
  CONSTRAINT ck_payment_amount CHECK (amount > 0),
  CONSTRAINT ck_payment_reversal CHECK (
    (status = 'REVERSED' AND reversed_at IS NOT NULL AND reversed_by_subject IS NOT NULL AND reversal_reason IS NOT NULL)
    OR (status = 'VALID' AND reversed_at IS NULL)
  )
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- invoice_sequences : transaction-safe counter. Never use MAX(number)+1.
--   Usage inside ONE transaction:
--     INSERT INTO invoice_sequences (business_id, period_key) VALUES (?, ?)
--       ON DUPLICATE KEY UPDATE business_id = business_id;
--     SELECT next_number, prefix FROM invoice_sequences
--       WHERE business_id = ? AND period_key = ? FOR UPDATE;
--     -- build invoice_number, INSERT INTO invoices ...
--     UPDATE invoice_sequences SET next_number = next_number + 1
--       WHERE business_id = ? AND period_key = ?;
--     COMMIT;
-- -----------------------------------------------------------------------------
CREATE TABLE invoice_sequences (
  business_id  CHAR(36)     NOT NULL,
  period_key   VARCHAR(10)  NOT NULL DEFAULT 'ALL',           -- 'ALL' or e.g. '2026' if numbering resets yearly [PROVISIONAL]
  prefix       VARCHAR(10)  NOT NULL DEFAULT 'INV',
  next_number  BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (business_id, period_key),
  CONSTRAINT fk_invseq_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
CREATE TABLE invoices (
  id                 CHAR(36)     NOT NULL DEFAULT (UUID()),
  business_id        CHAR(36)     NOT NULL,
  sale_id            CHAR(36)     NOT NULL,
  invoice_number     VARCHAR(40)  NOT NULL,                   -- format [PROVISIONAL], e.g. INV-000001
  status             ENUM('ISSUED','VOIDED') NOT NULL DEFAULT 'ISSUED',
  issued_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  issued_by_subject  VARCHAR(191) NOT NULL,
  snapshot_json      JSON         NULL,                       -- immutable issue-time copy (business, customer, lines, totals)
  share_token        CHAR(64)     NULL,                       -- random, only if public link is approved
  voided_at          DATETIME(3)  NULL,
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_business_number (business_id, invoice_number),
  UNIQUE KEY uq_invoice_sale (sale_id),                       -- one invoice per sale [PROVISIONAL]
  UNIQUE KEY uq_invoice_share_token (share_token),
  KEY idx_invoice_business_issued (business_id, issued_at),
  CONSTRAINT fk_invoice_sale FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- audit_events : append-only. business_id nullable for events before a
-- business is known (e.g. failed login). Do not store secrets or tokens here.
-- -----------------------------------------------------------------------------
CREATE TABLE audit_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id    CHAR(36)     NULL,
  actor_subject  VARCHAR(191) NULL,
  action         VARCHAR(64)  NOT NULL,                       -- e.g. SALE_CREATED, SALE_VOIDED, PAYMENT_RECORDED, PAYMENT_REVERSED, INVOICE_ISSUED, ROLE_CHANGED, LOGIN
  entity_type    VARCHAR(40)  NULL,
  entity_id      CHAR(36)     NULL,
  reason         VARCHAR(500) NULL,
  metadata       JSON         NULL,                           -- safe metadata only
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_business_created (business_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_actor (actor_subject, created_at),
  CONSTRAINT fk_audit_business FOREIGN KEY (business_id) REFERENCES businesses (id)
) ENGINE=InnoDB;
