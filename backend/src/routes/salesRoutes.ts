import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { createSaleSchema } from "../validators/salesValidator.js";
import { loadSaleDetail } from "../services/saleService.js";
import {
  centsToMoney,
  extendPrice,
  moneyToCents,
  quantityToThousandths,
  assertMoneyRange,
} from "../utils/money.js";
import {
  getDateParam,
  getPagination,
  paginated,
  requireParam,
} from "../utils/http.js";

const router = Router({ mergeParams: true });

interface ProductRow extends RowDataPacket {
  id: string;
  name: string;
  sku: string | null;
  type: "PRODUCT" | "SERVICE";
  price: string;
}

interface CustomerRow extends RowDataPacket {
  id: string;
}

interface InvoiceSequenceRow extends RowDataPacket {
  next_number: string | number | bigint;
}

interface BusinessMembershipContext {
  id: string;
  businessId: string;
  authUserId: string;
  role: "OWNER" | "CASHIER";
}

interface PreparedSaleLine {
  id: string;
  productServiceId: string;
  itemName: string;
  itemType: "PRODUCT" | "SERVICE";
  skuSnapshot: string | null;
  quantity: string;
  unitPrice: string;
  grossCents: bigint;
  discountCents: bigint;
  lineTotalCents: bigint;
}

async function findActiveProduct(
  connection: PoolConnection,
  businessId: string,
  productServiceId: string
): Promise<ProductRow | undefined> {
  const [rows] = await connection.execute<ProductRow[]>(
    `SELECT id, name, sku, type, price
     FROM product_services
     WHERE business_id = ?
       AND id = ?
       AND is_active = TRUE
     FOR UPDATE`,
    [businessId, productServiceId]
  );

  return rows[0];
}

function getIdempotencyKey(req: Request): string | null {
  const raw = req.headers["idempotency-key"];

  if (raw === undefined) return null;

  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim() ?? "";

  if (!trimmed) return null;

  if (trimmed.length > 100) {
    throw new HttpError(
      400,
      "Idempotency-Key cannot exceed 100 characters."
    );
  }

  return trimmed;
}

router.use(requireAuth);

// POST /api/v1/businesses/:businessId/sales
// OWNER and CASHIER can create sales.
router.post(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const businessId = requireParam(req, "businessId");

    const parsed = createSaleSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid sale data.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const input = parsed.data;

    const membership = res.locals
      .businessMembership as BusinessMembershipContext | undefined;

    if (!membership || membership.businessId !== businessId) {
      res.status(403).json({
        status: "error",
        message: "A valid business membership is required.",
      });
      return;
    }

    let idempotencyKey: string | null = null;

    try {
      idempotencyKey = getIdempotencyKey(req);
    } catch (error) {
      next(error);
      return;
    }

    let connection: PoolConnection | undefined;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Validate the customer within this business.
      if (input.customerId) {
        const [customers] = await connection.execute<CustomerRow[]>(
          `SELECT id
           FROM customers
           WHERE business_id = ?
             AND id = ?
             AND is_active = TRUE
           FOR UPDATE`,
          [businessId, input.customerId]
        );

        if (customers.length === 0) {
          throw new HttpError(
            404,
            "The active customer was not found in this business."
          );
        }
      }

      // Load prices from the database. Never trust prices sent by clients.
      const lines: PreparedSaleLine[] = [];

      let subtotalCents = 0n;
      let lineDiscountTotalCents = 0n;

      for (const item of input.items) {
        const product = await findActiveProduct(
          connection,
          businessId,
          item.productServiceId
        );

        if (!product) {
          throw new HttpError(
            404,
            `Product/service ${item.productServiceId} was not found or is inactive in this business.`
          );
        }

        const unitPriceCents = moneyToCents(product.price);
        const quantityMilli = quantityToThousandths(item.quantity);
        const discountCents = moneyToCents(item.discountAmount);

        const grossCents = extendPrice(unitPriceCents, quantityMilli);

        if (discountCents > grossCents) {
          throw new HttpError(
            400,
            `The discount for "${product.name}" cannot exceed its line amount.`
          );
        }

        const lineTotalCents = grossCents - discountCents;

        assertMoneyRange(grossCents);
        assertMoneyRange(lineTotalCents);

        subtotalCents += grossCents;
        lineDiscountTotalCents += discountCents;

        lines.push({
          id: randomUUID(),
          productServiceId: product.id,
          itemName: product.name,
          itemType: product.type,
          skuSnapshot: product.sku,
          quantity: item.quantity,
          unitPrice: product.price,
          grossCents,
          discountCents,
          lineTotalCents,
        });
      }

      const saleDiscountCents = moneyToCents(input.discountAmount);
      const taxCents = moneyToCents(input.taxAmount);

      const totalDiscountCents =
        lineDiscountTotalCents + saleDiscountCents;

      if (totalDiscountCents > subtotalCents) {
        throw new HttpError(
          400,
          "The total discount cannot exceed the subtotal."
        );
      }

      const totalCents =
        subtotalCents - totalDiscountCents + taxCents;

      assertMoneyRange(subtotalCents);
      assertMoneyRange(totalDiscountCents);
      assertMoneyRange(taxCents);
      assertMoneyRange(totalCents);

      // Cash sales are paid in full. For credit sales, an optional
      // initial payment can be recorded.
      if (input.saleType === "CASH" && totalCents <= 0n) {
        throw new HttpError(
          400,
          "A cash sale must have a total greater than zero."
        );
      }

      const paymentCents =
        input.saleType === "CASH"
          ? totalCents
          : moneyToCents(input.initialPaymentAmount);

      if (paymentCents > totalCents) {
        throw new HttpError(
          400,
          "The payment cannot exceed the sale total."
        );
      }

      if (
        input.saleType === "CREDIT" &&
        paymentCents > 0n &&
        !input.paymentMethod
      ) {
        throw new HttpError(
          400,
          "A payment method is required for an initial payment."
        );
      }

      const status: "OPEN" | "PAID" =
        paymentCents === totalCents ? "PAID" : "OPEN";

      const saleId = randomUUID();
      const invoiceId = randomUUID();

      // Lock and advance this business's invoice sequence atomically.
      await connection.execute<ResultSetHeader>(
        `INSERT INTO invoice_sequences (business_id, next_number)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE next_number = next_number`,
        [businessId]
      );

      const [sequenceRows] =
        await connection.execute<InvoiceSequenceRow[]>(
          `SELECT next_number
           FROM invoice_sequences
           WHERE business_id = ?
           FOR UPDATE`,
          [businessId]
        );

      if (sequenceRows.length === 0) {
        throw new Error("Could not allocate an invoice number.");
      }

      const invoiceSequence = BigInt(sequenceRows[0].next_number);
      const invoiceNumber =
        `INV-${invoiceSequence.toString().padStart(6, "0")}`;

      await connection.execute<ResultSetHeader>(
        `UPDATE invoice_sequences
         SET next_number = next_number + 1
         WHERE business_id = ?`,
        [businessId]
      );

      // Save the sale header.
      await connection.execute<ResultSetHeader>(
        `INSERT INTO sales (
          id,
          business_id,
          customer_id,
          created_by_membership_id,
          sale_type,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          businessId,
          input.customerId ?? null,
          membership.id,
          input.saleType,
          status,
          centsToMoney(subtotalCents),
          centsToMoney(totalDiscountCents),
          centsToMoney(taxCents),
          centsToMoney(totalCents),
          input.notes ?? null,
        ]
      );

      // Save item snapshots so later product edits do not change old sales.
      for (const line of lines) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO sale_lines (
            id,
            business_id,
            sale_id,
            product_service_id,
            item_name,
            item_type,
            sku_snapshot,
            quantity,
            unit_price,
            discount_amount,
            line_total
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            line.id,
            businessId,
            saleId,
            line.productServiceId,
            line.itemName,
            line.itemType,
            line.skuSnapshot,
            line.quantity,
            line.unitPrice,
            centsToMoney(line.discountCents),
            centsToMoney(line.lineTotalCents),
          ]
        );
      }

      // Record the payment, if any.
      let paymentId: string | null = null;

      if (paymentCents > 0n) {
        if (!input.paymentMethod) {
          throw new HttpError(400, "A payment method is required.");
        }

        paymentId = randomUUID();

        try {
          await connection.execute<ResultSetHeader>(
            `INSERT INTO payments (
              id,
              business_id,
              sale_id,
              received_by_membership_id,
              amount,
              method,
              reference,
              idempotency_key,
              notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              paymentId,
              businessId,
              saleId,
              membership.id,
              centsToMoney(paymentCents),
              input.paymentMethod,
              input.paymentReference ?? null,
              idempotencyKey,
              input.paymentNotes ?? null,
            ]
          );
        } catch (error) {
          if (
            idempotencyKey &&
            typeof error === "object" &&
            error !== null &&
            (error as { code?: unknown }).code === "ER_DUP_ENTRY"
          ) {
            throw new HttpError(
              409,
              "This Idempotency-Key has already been used."
            );
          }
          throw error;
        }
      }

      // Create the invoice record.
      await connection.execute<ResultSetHeader>(
        `INSERT INTO invoices (
          id,
          business_id,
          sale_id,
          invoice_number,
          issued_by_membership_id
        )
        VALUES (?, ?, ?, ?, ?)`,
        [
          invoiceId,
          businessId,
          saleId,
          invoiceNumber,
          membership.id,
        ]
      );

      // Record the action in the audit log.
      await connection.execute<ResultSetHeader>(
        `INSERT INTO audit_events (
          id,
          business_id,
          actor_membership_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          businessId,
          membership.id,
          "SALE_CREATED",
          "SALE",
          saleId,
          JSON.stringify({
            saleType: input.saleType,
            status,
            invoiceNumber,
            totalAmount: centsToMoney(totalCents),
          }),
        ]
      );

      await connection.commit();

      const sale = await loadSaleDetail(businessId, saleId);

      res.status(201).json({
        status: "success",
        message: "Sale created successfully.",
        data: sale,
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Sale transaction rollback failed:", rollbackError);
        }
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

interface SaleListRow extends RowDataPacket {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  sale_type: "CASH" | "CREDIT";
  status: "OPEN" | "PAID" | "VOID";
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  notes: string | null;
  invoice_number: string | null;
  created_at: Date;
  created_by_membership_id: string;
}

const SALE_LIST_SELECT = `
  s.id,
  s.customer_id,
  c.name AS customer_name,
  s.sale_type,
  s.status,
  s.subtotal,
  s.discount_amount,
  s.tax_amount,
  s.total_amount,
  s.notes,
  s.created_at,
  s.created_by_membership_id,
  i.invoice_number,
  (SELECT COALESCE(SUM(p.amount), 0)
   FROM payments p
   WHERE p.business_id = s.business_id
     AND p.sale_id = s.id) AS amount_paid
`;

function toSaleListItem(row: SaleListRow) {
  const paidCents = moneyToCents(row.amount_paid);
  const totalCents = moneyToCents(row.total_amount);
  const balance = totalCents - paidCents;

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    saleType: row.sale_type,
    status: row.status,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    amountPaid: row.amount_paid,
    balanceDue: centsToMoney(balance < 0n ? 0n : balance),
    notes: row.notes,
    invoiceNumber: row.invoice_number,
    createdByMembershipId: row.created_by_membership_id,
    createdAt: row.created_at,
  };
}

function parseMultiFilter(
  value: unknown,
  allowed: readonly string[],
  field: string
): string[] | undefined {
  if (value === undefined || value === "") return undefined;

  const raw = Array.isArray(value) ? value.join(",") : String(value);
  const parts = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const invalid = parts.filter((part) => !allowed.includes(part));

  if (invalid.length > 0) {
    throw new HttpError(
      400,
      `Invalid ${field}: ${invalid.join(", ")}. Allowed values: ${allowed.join(", ")}.`
    );
  }

  return parts.length > 0 ? parts : undefined;
}

// GET /api/v1/businesses/:businessId/sales
// OWNER and CASHIER can list sales.
router.get(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const pagination = getPagination(req);

      const statuses = parseMultiFilter(
        req.query.status,
        ["OPEN", "PAID", "VOID"],
        "status"
      );
      const saleTypes = parseMultiFilter(
        req.query.saleType,
        ["CASH", "CREDIT"],
        "saleType"
      );

      const customerId =
        typeof req.query.customerId === "string"
          ? req.query.customerId
          : undefined;

      const from = getDateParam(req, "from");
      const to = getDateParam(req, "to");

      const invoiceNumber =
        typeof req.query.invoice === "string"
          ? req.query.invoice.trim()
          : "";

      const where: string[] = ["s.business_id = ?"];
      const args: (string | number)[] = [businessId];

      if (statuses) {
        where.push(`s.status IN (${statuses.map(() => "?").join(", ")})`);
        args.push(...statuses);
      }

      if (saleTypes) {
        where.push(`s.sale_type IN (${saleTypes.map(() => "?").join(", ")})`);
        args.push(...saleTypes);
      }

      if (customerId) {
        where.push("s.customer_id = ?");
        args.push(customerId);
      }

      if (from) {
        where.push("s.created_at >= ?");
        args.push(`${from} 00:00:00`);
      }

      if (to) {
        where.push("s.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
        args.push(to);
      }

      if (invoiceNumber) {
        where.push("i.invoice_number = ?");
        args.push(invoiceNumber);
      }

      const whereSql = where.join(" AND ");

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM sales s
         LEFT JOIN invoices i
           ON i.business_id = s.business_id AND i.sale_id = s.id
         WHERE ${whereSql}`,
        args
      );

      const [rows] = await pool.execute<SaleListRow[]>(
        `SELECT ${SALE_LIST_SELECT}
         FROM sales s
         LEFT JOIN customers c
           ON c.business_id = s.business_id AND c.id = s.customer_id
         LEFT JOIN invoices i
           ON i.business_id = s.business_id AND i.sale_id = s.id
         WHERE ${whereSql}
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT ? OFFSET ?`,
        [...args, pagination.limit, pagination.offset]
      );

      res.status(200).json(
        paginated(
          rows.map(toSaleListItem),
          Number(countRows[0].total),
          pagination
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

export default router;
