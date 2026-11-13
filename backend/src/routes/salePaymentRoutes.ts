import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { RowDataPacket } from "mysql2";
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
  role: "OWNER" | "CASHIER";
}

interface InstallmentAllocationRow extends RowDataPacket {
  id: string;
  amount_due: string;
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

      // Lock the sale row to prevent concurrent payment transactions
      // from calculating the balance at the same time.
      const [lockedSales] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM sales
         WHERE business_id = ? AND id = ?
         FOR UPDATE`,
        [businessId, saleId]
      );

      if (lockedSales.length === 0) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      // Load sale details through the same transaction connection.
      const sale = await loadSaleDetail(businessId, saleId, connection);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (membership.role === "CASHIER") {
        const [branchRows] = await connection.execute<RowDataPacket[]>(
          `SELECT s.id
           FROM sales s
           INNER JOIN branch_memberships bm
             ON bm.business_id = s.business_id
            AND bm.branch_id = s.branch_id
           WHERE s.business_id = ?
             AND s.id = ?
             AND bm.membership_id = ?
           LIMIT 1`,
          [businessId, saleId, membership.id]
        );

        if (branchRows.length === 0) {
          throw new HttpError(404, "Sale not found in this business.");
        }
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

      // Allocate payments to the earliest unpaid installments (FIFO).
      // The sale row is already locked, so concurrent payments are serialized.
      const [activePlans] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM installment_plans
         WHERE business_id = ?
           AND sale_id = ?
           AND status = 'ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        [businessId, saleId]
      );

      const installmentAllocations: Array<{
        installmentId: string;
        amount: string;
      }> = [];

      if (activePlans.length > 0) {
        const planId = String(activePlans[0].id);

        const [installments] =
          await connection.execute<InstallmentAllocationRow[]>(
            `SELECT id, amount_due
             FROM installments
             WHERE business_id = ?
               AND sale_id = ?
               AND plan_id = ?
             ORDER BY due_date ASC, installment_number ASC
             FOR UPDATE`,
            [businessId, saleId, planId]
          );

        let paymentRemaining = amountCents;

        for (const installment of installments) {
          if (paymentRemaining === 0n) break;

          const [allocationRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(allocated_amount), 0) AS allocated_amount
             FROM installment_payment_allocations
             WHERE business_id = ?
               AND sale_id = ?
               AND installment_id = ?`,
            [businessId, saleId, installment.id]
          );

          const amountDue = moneyToCents(String(installment.amount_due));
          const alreadyAllocated = moneyToCents(
            String(allocationRows[0]?.allocated_amount ?? "0")
          );

          const installmentRemaining = amountDue - alreadyAllocated;

          if (installmentRemaining <= 0n) continue;

          const allocationAmount =
            paymentRemaining < installmentRemaining
              ? paymentRemaining
              : installmentRemaining;

          await connection.execute<ResultSetHeader>(
            `INSERT INTO installment_payment_allocations (
              id,
              business_id,
              sale_id,
              payment_id,
              installment_id,
              allocated_amount
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              businessId,
              saleId,
              paymentId,
              installment.id,
              centsToMoney(allocationAmount),
            ]
          );

          installmentAllocations.push({
            installmentId: installment.id,
            amount: centsToMoney(allocationAmount),
          });

          paymentRemaining -= allocationAmount;
        }

        // Never record a partially allocated payment against an active plan.
        if (paymentRemaining > 0n) {
          throw new HttpError(
            409,
            "Payment could not be fully allocated to the active installment plan. The payment was rolled back."
          );
        }
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
            installmentAllocations,
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
