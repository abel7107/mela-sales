
-- ============================================================
-- 005_branch_management.sql
-- Branch management for Mela Sales
-- ============================================================

-- 1. Create business branches.
CREATE TABLE branches (
    id CHAR(36) NOT NULL,
    business_id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NULL,
    phone VARCHAR(30) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_branches_business_id_id
        (business_id, id),

    UNIQUE KEY uq_branches_business_name
        (business_id, name),

    KEY idx_branches_business_active
        (business_id, is_active),

    CONSTRAINT fk_branches_business
        FOREIGN KEY (business_id)
        REFERENCES businesses (id)
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- 2. Assign business employees to branches.
CREATE TABLE branch_memberships (
    id CHAR(36) NOT NULL,
    business_id CHAR(36) NOT NULL,
    branch_id CHAR(36) NOT NULL,
    membership_id CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_branch_memberships_assignment
        (business_id, branch_id, membership_id),

    KEY idx_branch_memberships_membership
        (business_id, membership_id),

    CONSTRAINT fk_branch_memberships_branch
        FOREIGN KEY (business_id, branch_id)
        REFERENCES branches (business_id, id)
        ON DELETE RESTRICT,

    CONSTRAINT fk_branch_memberships_membership
        FOREIGN KEY (business_id, membership_id)
        REFERENCES business_memberships (business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- 3. Associate sales with branches.
-- NULL preserves existing historical sales.
ALTER TABLE sales
    ADD COLUMN branch_id CHAR(36) NULL AFTER business_id,

    ADD KEY idx_sales_business_branch_date
        (business_id, branch_id, created_at),

    ADD CONSTRAINT fk_sales_branch
        FOREIGN KEY (business_id, branch_id)
        REFERENCES branches (business_id, id)
        ON DELETE RESTRICT;
