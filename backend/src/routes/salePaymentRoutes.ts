import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { loadSaleDetail } from "../services/saleService.js";
import {
  assertMoneyRange,
  centsToMoney,
  moneyToCents,
} from "../utils/money.js";
import { requireParam } from "../utils/http.js";

const router = Router({ mergeParams: true });

const moneySchema = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Amount must be a non-negative decimal with up to 2 decimal places."
  );

const recordPaymentSchema = z
  .object({
    amount: moneySchema.refine(
      (value) => /[1-9]/.test(value),
      "Amount must be greater than zero."
    ),
    method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
    reference: z.string().trim().max(150).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .optional(),
  })
  .strict();

interface MembershipContext {
  id: string;
  businessId: string;
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

// POST /api/v1/businesses/:businessId/sales/:saleId/payments
// OWNER and CASHIER can record payments against an open sale.
router.post(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const businessId = requireParam(req, "businessId");
    const saleId = requireParam(req, "saleId");

    const parsed = recordPaymentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        status: "error",
        message: "Invalid payment data.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const input = parsed.data;

    const membership = res.locals.businessMembership as
      | MembershipContext
      | undefined;

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

    const amountCents = moneyToCents(input.amount);
    assertMoneyRange(amountCents);

    let connection: PoolConnection | undefined;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const sale = await loadSaleDetail(businessId, saleId);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (sale.status === "VOID") {
        throw new HttpError(
          409,
          "Payments cannot be recorded against a voided sale."
        );
      }

      if (sale.status === "PAID") {
        throw new HttpError(409, "This sale is already fully paid.");
      }

      const paidCents = moneyToCents(sale.amountPaid);
      const totalCents = moneyToCents(sale.totalAmount);
      const newTotalCents = paidCents + amountCents;

      if (newTotalCents > totalCents) {
        throw new HttpError(
          400,
          `Payment exceeds the remaining balance of ${centsToMoney(totalCents - paidCents)}.`
        );
      }

      const paymentId = randomUUID();

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
            notes,
            received_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
          [
            paymentId,
            businessId,
            saleId,
            membership.id,
            centsToMoney(amountCents),
            input.method,
            input.reference ?? null,
            idempotencyKey,
            input.notes ?? null,
            input.receivedAt ?? null,
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
            "This Idempotency-Key has already been used for a payment."
          );
        }
        throw error;
      }

      const newStatus = newTotalCents === totalCents ? "PAID" : "OPEN";

      if (newStatus === "PAID") {
        await connection.execute<ResultSetHeader>(
          `UPDATE sales
           SET status = 'PAID'
           WHERE business_id = ? AND id = ? AND status = 'OPEN'`,
          [businessId, saleId]
        );
      }

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
          "PAYMENT_RECORDED",
          "SALE",
          saleId,
          JSON.stringify({
            paymentId,
            amount: centsToMoney(amountCents),
            method: input.method,
            newStatus,
            balanceDue: centsToMoney(totalCents - newTotalCents),
          }),
        ]
      );

      await connection.commit();

      const updated = await loadSaleDetail(businessId, saleId);

      res.status(201).json({
        status: "success",
        message:
          newStatus === "PAID"
            ? "Payment recorded. The sale is now fully paid."
            : "Payment recorded.",
        data: {
          paymentId,
          sale: updated,
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Payment rollback failed:", rollbackError);
        }
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

export default router;
