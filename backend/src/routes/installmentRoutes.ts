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
import { z } from "zod";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { loadSaleDetail } from "../services/saleService.js";
import { requireParam } from "../utils/http.js";
import {
  moneyToCents,
  centsToMoney,
  assertMoneyRange,
} from "../utils/money.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);

interface MembershipContext {
  id: string;
  businessId: string;
  role: "OWNER" | "CASHIER";
}

interface PlanRow extends RowDataPacket {
  id: string;
  business_id: string;
  sale_id: string;
  total_amount: string;
  status: "ACTIVE" | "CANCELLED";
  created_by_membership_id: string;
  cancelled_by_membership_id: string | null;
  cancelled_at: Date | null;
  created_at: Date;
}

interface InstallmentRow extends RowDataPacket {
  id: string;
  installment_number: number;
  amount_due: string;
  due_date: string;
  amount_allocated: string;
  remaining_amount: string;
}

const moneySchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Invalid money amount.")
  .refine((value) => moneyToCents(value) > 0n, {
    message: "Amount must be greater than zero.",
  });

const createPlanSchema = z.object({
  installments: z
    .array(
      z.object({
        amountDue: moneySchema,
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
      })
    )
    .min(1)
    .max(120),
});

function getMembership(res: Response, businessId: string): MembershipContext {
  const membership = res.locals.businessMembership as
    | MembershipContext
    | undefined;

  if (!membership || membership.businessId !== businessId) {
    throw new HttpError(403, "A valid business membership is required.");
  }

  return membership;
}

async function ensureSaleBranchAccess(
  businessId: string,
  saleId: string,
  membership: MembershipContext
): Promise<void> {
  if (membership.role === "OWNER") return;

  const [rows] = await pool.execute<RowDataPacket[]>(
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

  if (rows.length === 0) {
    throw new HttpError(404, "Sale not found in this business.");
  }
}

function validateCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

async function lockSale(
  connection: PoolConnection,
  businessId: string,
  saleId: string
): Promise<void> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id
     FROM sales
     WHERE business_id = ? AND id = ?
     LIMIT 1
     FOR UPDATE`,
    [businessId, saleId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Sale not found in this business.");
  }
}

async function writeAuditEvent(
  connection: PoolConnection,
  businessId: string,
  membershipId: string,
  action: string,
  saleId: string,
  planId: string,
  details: Record<string, unknown>
): Promise<void> {
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
      membershipId,
      action,
      "INSTALLMENT_PLAN",
      planId,
      JSON.stringify({ saleId, ...details }),
    ]
  );
}

// POST /api/v1/businesses/:businessId/sales/:saleId/installments
// Create an installment plan for an eligible credit sale.
router.post(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = requireParam(req, "businessId");
    const saleId = requireParam(req, "saleId");

    let connection: PoolConnection | undefined;

    try {
      const membership = getMembership(res, businessId);

      await ensureSaleBranchAccess(businessId, saleId, membership);

      const parsed = createPlanSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new HttpError(
          400,
          "Invalid installment schedule.",
          parsed.error.flatten()
        );
      }

      for (const installment of parsed.data.installments) {
        if (!validateCalendarDate(installment.dueDate)) {
          throw new HttpError(
            400,
            `Invalid due date: ${installment.dueDate}.`
          );
        }
      }

      const scheduleTotal = parsed.data.installments.reduce(
        (total, item) => total + moneyToCents(item.amountDue),
        0n
      );

      assertMoneyRange(scheduleTotal);

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Locking the sale serializes plan creation with payment operations.
      await lockSale(connection, businessId, saleId);

      const sale = await loadSaleDetail(businessId, saleId, connection);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (sale.saleType !== "CREDIT") {
        throw new HttpError(
          409,
          "Installment plans are only allowed for credit sales."
        );
      }

      if (sale.status !== "OPEN") {
        throw new HttpError(
          409,
          "Only open credit sales can receive an installment plan."
        );
      }

      const outstanding = moneyToCents(sale.balanceDue);

      if (outstanding <= 0n) {
        throw new HttpError(
          409,
          "This sale has no outstanding balance."
        );
      }

      if (scheduleTotal !== outstanding) {
        throw new HttpError(
          400,
          `Installment total must equal the outstanding balance of ${centsToMoney(outstanding)}.`
        );
      }

      const [existingPlans] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM installment_plans
         WHERE business_id = ?
           AND sale_id = ?
           AND status = 'ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        [businessId, saleId]
      );

      if (existingPlans.length > 0) {
        throw new HttpError(
          409,
          "This sale already has an active installment plan."
        );
      }

      const planId = randomUUID();

      await connection.execute<ResultSetHeader>(
        `INSERT INTO installment_plans (
          id,
          business_id,
          sale_id,
          total_amount,
          status,
          created_by_membership_id
        )
        VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
        [
          planId,
          businessId,
          saleId,
          centsToMoney(outstanding),
          membership.id,
        ]
      );

      const installmentIds: string[] = [];

      for (const [index, installment] of parsed.data.installments.entries()) {
        const installmentId = randomUUID();
        installmentIds.push(installmentId);

        await connection.execute<ResultSetHeader>(
          `INSERT INTO installments (
            id,
            business_id,
            sale_id,
            plan_id,
            installment_number,
            amount_due,
            due_date
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            installmentId,
            businessId,
            saleId,
            planId,
            index + 1,
            centsToMoney(moneyToCents(installment.amountDue)),
            installment.dueDate,
          ]
        );
      }

      const [ownerRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM business_memberships
         WHERE business_id = ?
           AND role = 'OWNER'
           AND is_active = TRUE`,
        [businessId]
      );

      const today = new Date().toISOString().slice(0, 10);

      for (const owner of ownerRows) {
        for (const [index, installment] of parsed.data.installments.entries()) {
          const type =
            installment.dueDate < today
              ? "OVERDUE"
              : installment.dueDate === today
                ? "DUE_TODAY"
                : "UPCOMING";

          await connection.execute<ResultSetHeader>(
            `INSERT IGNORE INTO notifications (
              id,
              business_id,
              recipient_membership_id,
              installment_id,
              type,
              message
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              businessId,
              String(owner.id),
              installmentIds[index],
              type,
              `Installment ${index + 1} of ${installment.amountDue} is due on ${installment.dueDate}.`,
            ]
          );
        }
      }

      await writeAuditEvent(
        connection,
        businessId,
        membership.id,
        "INSTALLMENT_PLAN_CREATED",
        saleId,
        planId,
        {
          totalAmount: centsToMoney(outstanding),
          installmentCount: parsed.data.installments.length,
        }
      );

      await connection.commit();

      res.status(201).json({
        status: "success",
        message: "Installment plan created successfully.",
        data: {
          id: planId,
          saleId,
          totalAmount: centsToMoney(outstanding),
          status: "ACTIVE",
          installments: parsed.data.installments.map((item, index) => ({
            installmentNumber: index + 1,
            amountDue: centsToMoney(moneyToCents(item.amountDue)),
            dueDate: item.dueDate,
          })),
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Installment plan rollback failed:", rollbackError);
        }
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

// GET /api/v1/businesses/:businessId/sales/:saleId/installments
// Retrieve the latest installment plan and its current balances.
router.get(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const saleId = requireParam(req, "saleId");
      const membership = getMembership(res, businessId);

      await ensureSaleBranchAccess(businessId, saleId, membership);

      const [plans] = await pool.execute<PlanRow[]>(
        `SELECT id, business_id, sale_id, total_amount, status,
                created_by_membership_id, cancelled_by_membership_id,
                cancelled_at, created_at
         FROM installment_plans
         WHERE business_id = ? AND sale_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [businessId, saleId]
      );

      const plan = plans[0];

      if (!plan) {
        throw new HttpError(404, "No installment plan exists for this sale.");
      }

      const [installments] = await pool.execute<InstallmentRow[]>(
        `SELECT
           i.id,
           i.installment_number,
           i.amount_due,
           DATE_FORMAT(i.due_date, '%Y-%m-%d') AS due_date,
           COALESCE(SUM(a.allocated_amount), 0) AS amount_allocated,
           GREATEST(
             i.amount_due - COALESCE(SUM(a.allocated_amount), 0),
             0
           ) AS remaining_amount
         FROM installments i
         LEFT JOIN installment_payment_allocations a
           ON a.business_id = i.business_id
          AND a.sale_id = i.sale_id
          AND a.installment_id = i.id
         WHERE i.business_id = ?
           AND i.sale_id = ?
           AND i.plan_id = ?
         GROUP BY i.id, i.installment_number, i.amount_due, i.due_date
         ORDER BY i.due_date ASC, i.installment_number ASC`,
        [businessId, saleId, plan.id]
      );

      const schedule = installments.map((item) => {
        const remaining = moneyToCents(String(item.remaining_amount));
        const allocated = moneyToCents(String(item.amount_allocated));

        return {
          id: item.id,
          installmentNumber: item.installment_number,
          amountDue: item.amount_due,
          amountAllocated: centsToMoney(allocated),
          remainingAmount: centsToMoney(remaining),
          dueDate: item.due_date,
          status:
            remaining === 0n
              ? "PAID"
              : item.due_date < new Date().toISOString().slice(0, 10)
                ? "OVERDUE"
                : item.due_date === new Date().toISOString().slice(0, 10)
                  ? "DUE_TODAY"
                  : "UPCOMING",
        };
      });

      res.status(200).json({
        status: "success",
        data: {
          id: plan.id,
          saleId: plan.sale_id,
          totalAmount: plan.total_amount,
          status: plan.status,
          createdAt: plan.created_at,
          cancelledAt: plan.cancelled_at,
          installments: schedule,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/sales/:saleId/installments/cancel
// Only OWNER can cancel an active installment plan.
router.post(
  "/cancel",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = requireParam(req, "businessId");
    const saleId = requireParam(req, "saleId");

    let connection: PoolConnection | undefined;

    try {
      const membership = getMembership(res, businessId);

      connection = await pool.getConnection();
      await connection.beginTransaction();

      await lockSale(connection, businessId, saleId);

      const [plans] = await connection.execute<PlanRow[]>(
        `SELECT id, business_id, sale_id, total_amount, status,
                created_by_membership_id, cancelled_by_membership_id,
                cancelled_at, created_at
         FROM installment_plans
         WHERE business_id = ?
           AND sale_id = ?
           AND status = 'ACTIVE'
         LIMIT 1
         FOR UPDATE`,
        [businessId, saleId]
      );

      const plan = plans[0];

      if (!plan) {
        throw new HttpError(
          404,
          "No active installment plan exists for this sale."
        );
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE installment_plans
         SET status = 'CANCELLED',
             cancelled_at = CURRENT_TIMESTAMP,
             cancelled_by_membership_id = ?
         WHERE business_id = ?
           AND id = ?
           AND status = 'ACTIVE'`,
        [membership.id, businessId, plan.id]
      );

      await writeAuditEvent(
        connection,
        businessId,
        membership.id,
        "INSTALLMENT_PLAN_CANCELLED",
        saleId,
        plan.id,
        { totalAmount: plan.total_amount }
      );

      await connection.commit();

      res.status(200).json({
        status: "success",
        message: "Installment plan cancelled successfully.",
        data: {
          id: plan.id,
          saleId,
          status: "CANCELLED",
        },
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Installment cancellation rollback failed:", rollbackError);
        }
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

export default router;
