SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: mela_sales_db
-- ------------------------------------------------------
-- Server version	8.0.46-0ubuntu0.24.04.4

/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET TIME_ZONE='+00:00' */;

--
-- Table structure for table `audit_events`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `audit_events` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_membership_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_business_date` (`business_id`,`created_at`),
  KEY `idx_audit_entity` (`business_id`,`entity_type`,`entity_id`),
  KEY `fk_audit_actor` (`business_id`,`actor_membership_id`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`business_id`, `actor_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_audit_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auth_password_resets`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `auth_password_resets` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_reset_token` (`token_hash`),
  KEY `idx_password_resets_user` (`user_id`),
  KEY `idx_password_resets_expiry` (`expires_at`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auth_refresh_tokens`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `auth_refresh_tokens` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user` (`user_id`),
  KEY `idx_refresh_tokens_expiry` (`expires_at`),
  CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auth_users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `auth_users` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `branch_memberships`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `branch_memberships` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branch_memberships_assignment` (`business_id`,`branch_id`,`membership_id`),
  KEY `idx_branch_memberships_membership` (`business_id`,`membership_id`),
  CONSTRAINT `fk_branch_memberships_branch` FOREIGN KEY (`business_id`, `branch_id`) REFERENCES `branches` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_branch_memberships_membership` FOREIGN KEY (`business_id`, `membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `branches`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `branches` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branches_business_id_id` (`business_id`,`id`),
  UNIQUE KEY `uq_branches_business_name` (`business_id`,`name`),
  KEY `idx_branches_business_active` (`business_id`,`is_active`),
  CONSTRAINT `fk_branches_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_memberships`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `business_memberships` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('OWNER','CASHIER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_membership_business_user` (`business_id`,`auth_user_id`),
  UNIQUE KEY `uq_membership_business_id_id` (`business_id`,`id`),
  CONSTRAINT `fk_membership_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `businesses`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `businesses` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ETB',
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `customers` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customers_business_id_id` (`business_id`,`id`),
  KEY `idx_customers_business_name` (`business_id`,`name`),
  KEY `idx_customers_business_phone` (`business_id`,`phone`),
  CONSTRAINT `fk_customers_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `installment_payment_allocations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `installment_payment_allocations` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `installment_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `allocated_amount` decimal(12,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_installment_allocation_payment_installment` (`business_id`,`payment_id`,`installment_id`),
  KEY `idx_installment_allocations_installment` (`business_id`,`sale_id`,`installment_id`),
  KEY `idx_installment_allocations_payment` (`business_id`,`sale_id`,`payment_id`),
  CONSTRAINT `fk_installment_allocations_installment` FOREIGN KEY (`business_id`, `sale_id`, `installment_id`) REFERENCES `installments` (`business_id`, `sale_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_installment_allocations_payment` FOREIGN KEY (`business_id`, `sale_id`, `payment_id`) REFERENCES `payments` (`business_id`, `sale_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_installment_allocations_amount_positive` CHECK ((`allocated_amount` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `installment_plans`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `installment_plans` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `status` enum('ACTIVE','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `active_sale_id` char(36) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'ACTIVE') then `sale_id` else NULL end)) STORED,
  `created_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cancelled_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_installment_plans_business_id` (`business_id`,`id`),
  UNIQUE KEY `uq_installment_plans_business_sale_id` (`business_id`,`sale_id`,`id`),
  UNIQUE KEY `uq_installment_plans_one_active_sale` (`business_id`,`active_sale_id`),
  KEY `idx_installment_plans_business_sale` (`business_id`,`sale_id`),
  KEY `idx_installment_plans_creator` (`business_id`,`created_by_membership_id`),
  KEY `fk_installment_plans_cancelled_by` (`business_id`,`cancelled_by_membership_id`),
  CONSTRAINT `fk_installment_plans_cancelled_by` FOREIGN KEY (`business_id`, `cancelled_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_installment_plans_creator` FOREIGN KEY (`business_id`, `created_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_installment_plans_sale` FOREIGN KEY (`business_id`, `sale_id`) REFERENCES `sales` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_installment_plans_cancel_fields` CHECK ((((`status` = _utf8mb4'ACTIVE') and (`cancelled_at` is null) and (`cancelled_by_membership_id` is null)) or ((`status` = _utf8mb4'CANCELLED') and (`cancelled_at` is not null) and (`cancelled_by_membership_id` is not null)))),
  CONSTRAINT `chk_installment_plans_total_positive` CHECK ((`total_amount` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `installments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `installments` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `installment_number` int unsigned NOT NULL,
  `amount_due` decimal(12,2) NOT NULL,
  `due_date` date NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_installments_business_id` (`business_id`,`id`),
  UNIQUE KEY `uq_installments_business_sale_id` (`business_id`,`sale_id`,`id`),
  UNIQUE KEY `uq_installments_plan_number` (`business_id`,`plan_id`,`installment_number`),
  KEY `idx_installments_fifo` (`business_id`,`sale_id`,`due_date`,`installment_number`),
  KEY `idx_installments_plan` (`business_id`,`sale_id`,`plan_id`),
  CONSTRAINT `fk_installments_plan` FOREIGN KEY (`business_id`, `sale_id`, `plan_id`) REFERENCES `installment_plans` (`business_id`, `sale_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_installments_amount_positive` CHECK ((`amount_due` > 0)),
  CONSTRAINT `chk_installments_number_positive` CHECK ((`installment_number` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoice_sequences`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `invoice_sequences` (
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `next_number` bigint unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`business_id`),
  CONSTRAINT `fk_invoice_sequences_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `invoices`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invoice_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_business_number` (`business_id`,`invoice_number`),
  UNIQUE KEY `uq_invoice_business_sale` (`business_id`,`sale_id`),
  UNIQUE KEY `uq_invoice_business_id_id` (`business_id`,`id`),
  KEY `idx_invoices_business_date` (`business_id`,`issued_at`),
  KEY `fk_invoices_issuer` (`business_id`,`issued_by_membership_id`),
  CONSTRAINT `fk_invoices_issuer` FOREIGN KEY (`business_id`, `issued_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_invoices_sale` FOREIGN KEY (`business_id`, `sale_id`) REFERENCES `sales` (`business_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient_membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `installment_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('UPCOMING','DUE_TODAY','OVERDUE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_notifications_recipient_installment_type` (`business_id`,`recipient_membership_id`,`installment_id`,`type`),
  KEY `idx_notifications_inbox` (`business_id`,`recipient_membership_id`,`is_read`,`created_at`),
  KEY `idx_notifications_installment` (`business_id`,`installment_id`),
  CONSTRAINT `fk_notifications_installment` FOREIGN KEY (`business_id`, `installment_id`) REFERENCES `installments` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_notifications_recipient` FOREIGN KEY (`business_id`, `recipient_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_notifications_read_at` CHECK ((((`is_read` = false) and (`read_at` is null)) or ((`is_read` = true) and (`read_at` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `payments` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `received_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `method` enum('CASH','BANK_TRANSFER','MOBILE_MONEY','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reference` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `received_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_business_id_id` (`business_id`,`id`),
  UNIQUE KEY `uq_payments_business_sale_id` (`business_id`,`sale_id`,`id`),
  UNIQUE KEY `uq_payment_idempotency` (`business_id`,`idempotency_key`),
  KEY `idx_payments_business_sale` (`business_id`,`sale_id`),
  KEY `idx_payments_business_date` (`business_id`,`received_at`),
  KEY `fk_payments_receiver` (`business_id`,`received_by_membership_id`),
  CONSTRAINT `fk_payments_receiver` FOREIGN KEY (`business_id`, `received_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_sale` FOREIGN KEY (`business_id`, `sale_id`) REFERENCES `sales` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_payment_amount` CHECK ((`amount` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_services`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `product_services` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sku` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('PRODUCT','SERVICE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(12,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_product_business_id_id` (`business_id`,`id`),
  UNIQUE KEY `uq_product_business_sku` (`business_id`,`sku`),
  KEY `idx_products_business_name` (`business_id`,`name`),
  KEY `idx_products_business_active` (`business_id`,`is_active`),
  CONSTRAINT `fk_products_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_product_price_nonnegative` CHECK ((`price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sale_lines`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sale_lines` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_service_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_type` enum('PRODUCT','SERVICE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sku_snapshot` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(12,3) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sale_lines_business_sale` (`business_id`,`sale_id`),
  KEY `idx_sale_lines_product` (`business_id`,`product_service_id`),
  CONSTRAINT `fk_sale_lines_product` FOREIGN KEY (`business_id`, `product_service_id`) REFERENCES `product_services` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sale_lines_sale` FOREIGN KEY (`business_id`, `sale_id`) REFERENCES `sales` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_sale_line_discount` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `chk_sale_line_price` CHECK ((`unit_price` >= 0)),
  CONSTRAINT `chk_sale_line_quantity` CHECK ((`quantity` > 0)),
  CONSTRAINT `chk_sale_line_total` CHECK ((`line_total` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `sales` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `customer_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sale_type` enum('CASH','CREDIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('OPEN','PAID','VOID') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `subtotal` decimal(12,2) NOT NULL,
  `discount_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `tax_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(12,2) NOT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `void_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `voided_by_membership_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_business_id_id` (`business_id`,`id`),
  KEY `idx_sales_business_date` (`business_id`,`created_at`),
  KEY `idx_sales_business_customer` (`business_id`,`customer_id`),
  KEY `idx_sales_business_status` (`business_id`,`status`),
  KEY `fk_sales_creator` (`business_id`,`created_by_membership_id`),
  KEY `fk_sales_voider` (`business_id`,`voided_by_membership_id`),
  KEY `idx_sales_business_branch_date` (`business_id`,`branch_id`,`created_at`),
  CONSTRAINT `fk_sales_branch` FOREIGN KEY (`business_id`, `branch_id`) REFERENCES `branches` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sales_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sales_creator` FOREIGN KEY (`business_id`, `created_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sales_customer` FOREIGN KEY (`business_id`, `customer_id`) REFERENCES `customers` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sales_voider` FOREIGN KEY (`business_id`, `voided_by_membership_id`) REFERENCES `business_memberships` (`business_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_sales_discount` CHECK ((`discount_amount` >= 0)),
  CONSTRAINT `chk_sales_subtotal` CHECK ((`subtotal` >= 0)),
  CONSTRAINT `chk_sales_tax` CHECK ((`tax_amount` >= 0)),
  CONSTRAINT `chk_sales_total` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
--



SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
