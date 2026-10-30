
CREATE TABLE businesses (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'ETB',
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    address VARCHAR(255) NULL,
    logo_url VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE business_memberships (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    auth_user_id VARCHAR(255) NOT NULL,
    role ENUM('OWNER', 'CASHIER') NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_membership_business_user (business_id, auth_user_id),
    UNIQUE KEY uq_membership_business_id_id (business_id, id),
    CONSTRAINT fk_membership_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(254) NULL,
    address VARCHAR(255) NULL,
    notes VARCHAR(1000) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customers_business_id_id (business_id, id),
    KEY idx_customers_business_name (business_id, name),
    KEY idx_customers_business_phone (business_id, phone),
    CONSTRAINT fk_customers_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_services (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(1000) NULL,
    sku VARCHAR(64) NULL,
    type ENUM('PRODUCT', 'SERVICE') NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_business_id_id (business_id, id),
    UNIQUE KEY uq_product_business_sku (business_id, sku),
    KEY idx_products_business_name (business_id, name),
    KEY idx_products_business_active (business_id, is_active),
    CONSTRAINT chk_product_price_nonnegative CHECK (price >= 0),
    CONSTRAINT fk_products_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    customer_id CHAR(36) NULL,
    created_by_membership_id CHAR(36) NOT NULL,
    sale_type ENUM('CASH', 'CREDIT') NOT NULL,
    status ENUM('OPEN', 'PAID', 'VOID') NOT NULL DEFAULT 'OPEN',
    subtotal DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    notes VARCHAR(1000) NULL,
    void_reason VARCHAR(500) NULL,
    voided_at TIMESTAMP NULL,
    voided_by_membership_id CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sales_business_id_id (business_id, id),
    KEY idx_sales_business_date (business_id, created_at),
    KEY idx_sales_business_customer (business_id, customer_id),
    KEY idx_sales_business_status (business_id, status),
    CONSTRAINT chk_sales_subtotal CHECK (subtotal >= 0),
    CONSTRAINT chk_sales_discount CHECK (discount_amount >= 0),
    CONSTRAINT chk_sales_tax CHECK (tax_amount >= 0),
    CONSTRAINT chk_sales_total CHECK (total_amount >= 0),
    CONSTRAINT fk_sales_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sales_customer
        FOREIGN KEY (business_id, customer_id)
        REFERENCES customers(business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sales_creator
        FOREIGN KEY (business_id, created_by_membership_id)
        REFERENCES business_memberships(business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sales_voider
        FOREIGN KEY (business_id, voided_by_membership_id)
        REFERENCES business_memberships(business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sale_lines (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    sale_id CHAR(36) NOT NULL,
    product_service_id CHAR(36) NULL,
    item_name VARCHAR(150) NOT NULL,
    item_type ENUM('PRODUCT', 'SERVICE') NOT NULL,
    sku_snapshot VARCHAR(64) NULL,
    quantity DECIMAL(12,3) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sale_lines_business_sale (business_id, sale_id),
    KEY idx_sale_lines_product (business_id, product_service_id),
    CONSTRAINT chk_sale_line_quantity CHECK (quantity > 0),
    CONSTRAINT chk_sale_line_price CHECK (unit_price >= 0),
    CONSTRAINT chk_sale_line_discount CHECK (discount_amount >= 0),
    CONSTRAINT chk_sale_line_total CHECK (line_total >= 0),
    CONSTRAINT fk_sale_lines_sale
        FOREIGN KEY (business_id, sale_id)
        REFERENCES sales(business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_sale_lines_product
        FOREIGN KEY (business_id, product_service_id)
        REFERENCES product_services(business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    sale_id CHAR(36) NOT NULL,
    received_by_membership_id CHAR(36) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    method ENUM('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'OTHER') NOT NULL,
    reference VARCHAR(150) NULL,
    idempotency_key VARCHAR(100) NULL,
    notes VARCHAR(500) NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payment_business_id_id (business_id, id),
    UNIQUE KEY uq_payment_idempotency (business_id, idempotency_key),
    KEY idx_payments_business_sale (business_id, sale_id),
    KEY idx_payments_business_date (business_id, received_at),
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    CONSTRAINT fk_payments_sale
        FOREIGN KEY (business_id, sale_id)
        REFERENCES sales(business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_payments_receiver
        FOREIGN KEY (business_id, received_by_membership_id)
        REFERENCES business_memberships(business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_sequences (
    business_id CHAR(36) NOT NULL PRIMARY KEY,
    next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
    CONSTRAINT fk_invoice_sequences_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    sale_id CHAR(36) NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    issued_by_membership_id CHAR(36) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoice_business_number (business_id, invoice_number),
    UNIQUE KEY uq_invoice_business_sale (business_id, sale_id),
    UNIQUE KEY uq_invoice_business_id_id (business_id, id),
    KEY idx_invoices_business_date (business_id, issued_at),
    CONSTRAINT fk_invoices_sale
        FOREIGN KEY (business_id, sale_id)
        REFERENCES sales(business_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_invoices_issuer
        FOREIGN KEY (business_id, issued_by_membership_id)
        REFERENCES business_memberships(business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_auth_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_refresh_tokens (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_tokens_user (user_id),
    KEY idx_refresh_tokens_expiry (expires_at),
    CONSTRAINT fk_refresh_tokens_user
        FOREIGN KEY (user_id) REFERENCES auth_users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE auth_password_resets (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_password_reset_token (token_hash),
    KEY idx_password_resets_user (user_id),
    KEY idx_password_resets_expiry (expires_at),
    CONSTRAINT fk_password_resets_user
        FOREIGN KEY (user_id) REFERENCES auth_users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_events (
    id CHAR(36) NOT NULL PRIMARY KEY,
    business_id CHAR(36) NOT NULL,
    actor_membership_id CHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id CHAR(36) NULL,
    reason VARCHAR(500) NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_business_date (business_id, created_at),
    KEY idx_audit_entity (business_id, entity_type, entity_id),
    CONSTRAINT fk_audit_business
        FOREIGN KEY (business_id) REFERENCES businesses(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_audit_actor
        FOREIGN KEY (business_id, actor_membership_id)
        REFERENCES business_memberships(business_id, id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
