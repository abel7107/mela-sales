
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { RowDataPacket } from "mysql2/promise";

import pool from "../config/database.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  getDateParam,
  getPagination,
  paginated,
  requireParam,
} from "../utils/http.js";
import { HttpError } from "../middleware/errorMiddleware.js";

const router = Router({ mergeParams: true });

interface MembershipContext {
  id: string;
  businessId: string;
  role: "OWNER" | "CASHIER";
}

router.use(requireAuth);

function dateRange(req: Request): { from?: string; to?: string } {
  return {
    from: getDateParam(req, "from"),
    to: getDateParam(req, "to"),
  };
}

function ensureBusinessMembership(
  businessId: string,
  membership: MembershipContext | undefined
): asserts membership is MembershipContext {
  if (!membership || membership.businessId !== businessId) {
    throw new HttpError(403, "A valid business membership is required.");
  }
}

function appendRange(
  where: string[],
  args: (string | number)[],
  column: string,
  from?: string,
  to?: string
): void {
  if (from) {
    where.push(`${column} >= ?`);
    args.push(`${from} 00:00:00`);
  }

  if (to) {
    where.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    args.push(to);
  }
}

function appendBranchAccess(
  where: string[],
  args: (string | number)[],
  saleAlias: string,
  membership: MembershipContext
): void {
  if (membership.role === "CASHIER") {
    where.push(`
      EXISTS (
        SELECT 1
        FROM branch_memberships bm
        WHERE bm.business_id = ${saleAlias}.business_id
          AND bm.branch_id = ${saleAlias}.branch_id
          AND bm.membership_id = ?
      )
    `);

    args.push(membership.id);
  }
}

// GET /api/v1/businesses/:businessId/reports/sales/summary
// Daily and aggregate sales totals, excluding voided sales.
router.get(
  "/sales/summary",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const { from, to } = dateRange(req);

      const membership = res.locals.businessMembership as
        | MembershipContext
        | undefined;

      ensureBusinessMembership(businessId, membership);

      // Conditions for the main sales queries.
      const where: string[] = [
        "s.business_id = ?",
        "s.status <> 'VOID'",
      ];

      const args: (string | number)[] = [businessId];

      appendRange(where, args, "s.created_at", from, to);
      appendBranchAccess(where, args, "s", membership);

      const whereSql = where.join(" AND ");

      // Conditions for the joined sale_lines / sales query.
      const lineWhere: string[] = [
        "s.business_id = ?",
        "s.status <> 'VOID'",
      ];

      const lineArgs: (string | number)[] = [businessId];

      appendBranchAccess(lineWhere, lineArgs, "s", membership);
      appendRange(lineWhere, lineArgs, "s.created_at", from, to);

      const [totals] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS saleCount,
                COALESCE(SUM(s.total_amount), 0) AS totalAmount,
                COALESCE(SUM(s.tax_amount), 0) AS taxAmount,
                COALESCE(SUM(s.discount_amount), 0) AS discountAmount,
                COALESCE(
                  SUM(CASE WHEN s.sale_type = 'CASH'
                      THEN s.total_amount END),
                  0
                ) AS cashAmount,
                COALESCE(
                  SUM(CASE WHEN s.sale_type = 'CREDIT'
                      THEN s.total_amount END),
                  0
                ) AS creditAmount,
               COALESCE(
  (
    SELECT SUM(
      GREATEST(
        s2.total_amount - COALESCE(paid.totalPaid, 0),
        0
      )
    )
    FROM sales s2
    LEFT JOIN (
      SELECT
        business_id,
        sale_id,
        SUM(amount) AS totalPaid
      FROM payments
      GROUP BY business_id, sale_id
    ) paid
      ON paid.business_id = s2.business_id
     AND paid.sale_id = s2.id
    WHERE s2.business_id = ?
      AND s2.sale_type = 'CREDIT'
      AND s2.status <> 'VOID'
      AND (
        ? = 'OWNER'
        OR EXISTS (
          SELECT 1
          FROM branch_memberships bm
          WHERE bm.business_id = s2.business_id
            AND bm.branch_id = s2.branch_id
            AND bm.membership_id = ?
        )
      )
  ),
  0
) AS outstandingAmount
         FROM sales s
         WHERE ${whereSql}`,
        [
          businessId,
          membership.role,
          membership.id,
          ...args,
        ]
      );

      const [daily] = await pool.execute<RowDataPacket[]>(
        `SELECT DATE(s.created_at) AS day,
                COUNT(*) AS saleCount,
                COALESCE(SUM(s.total_amount), 0) AS totalAmount,
                COALESCE(
                  SUM(CASE WHEN s.sale_type = 'CASH'
                      THEN s.total_amount END),
                  0
                ) AS cashAmount,
                COALESCE(
                  SUM(CASE WHEN s.sale_type = 'CREDIT'
                      THEN s.total_amount END),
                  0
                ) AS creditAmount
         FROM sales s
         WHERE ${whereSql}
         GROUP BY DATE(s.created_at)
         ORDER BY day DESC`,
        args
      );

      const [topProducts] = await pool.execute<RowDataPacket[]>(
        `SELECT sl.item_name AS name,
                sl.item_type AS type,
                COALESCE(SUM(sl.quantity), 0) AS quantitySold,
                COALESCE(SUM(sl.line_total), 0) AS revenue
         FROM sale_lines sl
         INNER JOIN sales s
           ON s.business_id = sl.business_id
          AND s.id = sl.sale_id
         WHERE ${lineWhere.join(" AND ")}
         GROUP BY sl.item_name, sl.item_type
         ORDER BY revenue DESC
         LIMIT 10`,
        lineArgs
      );

      const voidWhere: string[] = [
        "s.business_id = ?",
        "s.status = 'VOID'",
      ];

      const voidArgs: (string | number)[] = [businessId];

      appendBranchAccess(voidWhere, voidArgs, "s", membership);
      appendRange(voidWhere, voidArgs, "s.created_at", from, to);

      const [voided] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS voidedCount
         FROM sales s
         WHERE ${voidWhere.join(" AND ")}`,
        voidArgs
      );

      res.status(200).json({
        status: "success",
        data: {
          range: {
            from: from ?? null,
            to: to ?? null,
          },
          totals: {
            saleCount: Number(totals[0].saleCount),
            totalAmount: totals[0].totalAmount,
            taxAmount: totals[0].taxAmount,
            discountAmount: totals[0].discountAmount,
            cashAmount: totals[0].cashAmount,
            creditAmount: totals[0].creditAmount,
            outstandingAmount: totals[0].outstandingAmount,
            voidedCount: Number(voided[0].voidedCount),
          },
          daily: daily.map((row) => ({
            day: row.day,
            saleCount: Number(row.saleCount),
            totalAmount: row.totalAmount,
            cashAmount: row.cashAmount,
            creditAmount: row.creditAmount,
          })),
          topProducts: topProducts.map((row) => ({
            name: row.name,
            type: row.type,
            quantitySold: row.quantitySold,
            revenue: row.revenue,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/reports/customers/balances
// Outstanding credit balance per customer.
router.get(
  "/customers/balances",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const pagination = getPagination(req);

      const membership = res.locals.businessMembership as
        | MembershipContext
        | undefined;

      ensureBusinessMembership(businessId, membership);

      const saleBranchCondition =
        membership.role === "CASHIER"
          ? `AND EXISTS (
              SELECT 1
              FROM branch_memberships bm
              WHERE bm.business_id = s.business_id
                AND bm.branch_id = s.branch_id
                AND bm.membership_id = ?
            )`
          : "";

      const onlyWithBalance =
        req.query.only_with_balance === "true" ||
        req.query.only_with_balance === "1";

      const having = onlyWithBalance
        ? `HAVING
             COALESCE(SUM(s.total_amount), 0) -
             COALESCE(SUM(p.paid), 0) > 0`
        : "";

      // Count query uses exactly the same branch filter as the data query.
      const countArgs: (string | number)[] = [];

      if (membership.role === "CASHIER") {
        countArgs.push(membership.id);
      }

      countArgs.push(businessId);

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM (
           SELECT c.id
           FROM customers c
           LEFT JOIN sales s
             ON s.business_id = c.business_id
          AND s.customer_id = c.id
          AND s.sale_type = 'CREDIT'
          AND s.status <> 'VOID'
            ${saleBranchCondition}
           LEFT JOIN (
             SELECT business_id,
                    sale_id,
                    SUM(amount) AS paid
             FROM payments
             GROUP BY business_id, sale_id
           ) p
             ON p.business_id = s.business_id
            AND p.sale_id = s.id
           WHERE c.business_id = ?
             AND c.is_active = TRUE
           GROUP BY c.id
           ${having}
         ) t`,
        countArgs
      );

      // Data query uses the same branch condition and parameter order.
      const rowsArgs: (string | number)[] = [];

      if (membership.role === "CASHIER") {
        rowsArgs.push(membership.id);
      }

      rowsArgs.push(
        businessId,
        pagination.limit,
        pagination.offset
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id,
                c.name,
                c.phone,
                COALESCE(SUM(s.total_amount), 0) AS totalSales,
                COALESCE(SUM(p.paid), 0) AS totalPaid,
                COALESCE(SUM(s.total_amount), 0) -
                  COALESCE(SUM(p.paid), 0) AS outstandingBalance,
                MAX(s.created_at) AS lastSaleAt
         FROM customers c
         LEFT JOIN sales s
           ON s.business_id = c.business_id
         AND s.customer_id = c.id
          AND s.sale_type = 'CREDIT'
          AND s.status <> 'VOID'
          ${saleBranchCondition}
         LEFT JOIN (
           SELECT business_id,
                  sale_id,
                  SUM(amount) AS paid
           FROM payments
           GROUP BY business_id, sale_id
         ) p
           ON p.business_id = s.business_id
          AND p.sale_id = s.id
         WHERE c.business_id = ?
           AND c.is_active = TRUE
         GROUP BY c.id, c.name, c.phone
         ${having}
         ORDER BY outstandingBalance DESC, c.name ASC
         LIMIT ? OFFSET ?`,
        rowsArgs
      );

      res.status(200).json(
        paginated(
          rows.map((row) => ({
            customerId: row.id,
            name: row.name,
            phone: row.phone,
            totalSales: row.totalSales,
            totalPaid: row.totalPaid,
            outstandingBalance: row.outstandingBalance,
            lastSaleAt: row.lastSaleAt,
          })),
          Number(countRows[0].total),
          pagination
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/reports/payments
// Payments received in a date range. Payments on voided sales are excluded.
router.get(
  "/payments",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const pagination = getPagination(req);
      const { from, to } = dateRange(req);

      const membership = res.locals.businessMembership as
        | MembershipContext
        | undefined;

      ensureBusinessMembership(businessId, membership);

      const where: string[] = [
        "p.business_id = ?",
        "s.status <> 'VOID'",
      ];

      const args: (string | number)[] = [businessId];

      appendBranchAccess(where, args, "s", membership);
      appendRange(where, args, "p.received_at", from, to);

      const method =
        typeof req.query.method === "string"
          ? req.query.method.trim().toUpperCase()
          : "";

      const allowedMethods = [
        "CASH",
        "BANK_TRANSFER",
        "MOBILE_MONEY",
        "OTHER",
      ];

      if (method) {
        if (!allowedMethods.includes(method)) {
          res.status(400).json({
            status: "error",
            message: `Invalid method. Allowed values: ${allowedMethods.join(", ")}.`,
          });
          return;
        }

        where.push("p.method = ?");
        args.push(method);
      }

      const whereSql = where.join(" AND ");

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM payments p
         INNER JOIN sales s
           ON s.business_id = p.business_id
          AND s.id = p.sale_id
         WHERE ${whereSql}`,
        args
      );

      const [totals] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(p.amount), 0) AS totalAmount,
                COUNT(*) AS paymentCount
         FROM payments p
         INNER JOIN sales s
           ON s.business_id = p.business_id
          AND s.id = p.sale_id
         WHERE ${whereSql}`,
        args
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT p.id,
                p.amount,
                p.method,
                p.reference,
                p.notes,
                p.received_at,
                p.received_by_membership_id,
                p.sale_id,
                i.invoice_number,
                c.name AS customerName
         FROM payments p
         INNER JOIN sales s
           ON s.business_id = p.business_id
          AND s.id = p.sale_id
         LEFT JOIN invoices i
           ON i.business_id = p.business_id
          AND i.sale_id = p.sale_id
         LEFT JOIN customers c
           ON c.business_id = s.business_id
          AND c.id = s.customer_id
         WHERE ${whereSql}
         ORDER BY p.received_at DESC, p.id DESC
         LIMIT ? OFFSET ?`,
        [...args, pagination.limit, pagination.offset]
      );

      res.status(200).json({
        ...paginated(
          rows.map((row) => ({
            id: row.id,
            amount: row.amount,
            method: row.method,
            reference: row.reference,
            notes: row.notes,
            receivedAt: row.received_at,
            receivedByMembershipId: row.received_by_membership_id,
            saleId: row.sale_id,
            invoiceNumber: row.invoice_number,
            customerName: row.customerName,
          })),
          Number(countRows[0].total),
          pagination
        ),
        totals: {
          paymentCount: Number(totals[0].paymentCount),
          totalAmount: totals[0].totalAmount,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/reports/installments
// List installment plans with progress summary.
router.get(
  "/installments",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const membership = res.locals.businessMembership as
        | MembershipContext
        | undefined;

      ensureBusinessMembership(businessId, membership);

      const branchCondition =
        membership?.role === "CASHIER"
          ? `AND EXISTS (
               SELECT 1
               FROM branch_memberships bm
               WHERE bm.business_id = s.business_id
                 AND bm.branch_id = s.branch_id
                 AND bm.membership_id = ?
             )`
          : "";

      const args: (string | number)[] = [businessId];

      if (membership?.role === "CASHIER") {
        args.push(membership.id);
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           ip.id AS planId,
           ip.sale_id AS saleId,
           ip.total_amount AS totalAmount,
           ip.status AS status,
           ip.created_at AS createdAt,
           ip.cancelled_at AS cancelledAt,
           s.status AS saleStatus,
           c.name AS customerName,
           (SELECT COUNT(*) FROM installments i
             WHERE i.business_id = ip.business_id AND i.plan_id = ip.id) AS installmentCount,
           COALESCE((
             SELECT SUM(a.allocated_amount)
             FROM installment_payment_allocations a
             INNER JOIN installments i
               ON i.business_id = a.business_id AND i.id = a.installment_id
             WHERE i.plan_id = ip.id
           ), 0) AS allocatedTotal,
           (SELECT MIN(i.due_date)
             FROM installments i
             WHERE i.plan_id = ip.id
               AND i.amount_due > COALESCE((
                 SELECT SUM(a.allocated_amount)
                 FROM installment_payment_allocations a
                 WHERE a.installment_id = i.id
               ), 0)
           ) AS nextDueDate
         FROM installment_plans ip
         INNER JOIN sales s
           ON s.business_id = ip.business_id
          AND s.id = ip.sale_id
         LEFT JOIN customers c
           ON c.business_id = s.business_id
          AND c.id = s.customer_id
         WHERE ip.business_id = ?
           ${branchCondition}
         ORDER BY ip.created_at DESC
         LIMIT 200`,
        args
      );

      res.status(200).json({
        status: "success",
        data: rows.map((row) => ({
          planId: row.planId,
          saleId: row.saleId,
          totalAmount: row.totalAmount,
          status: row.status,
          createdAt: row.createdAt,
          cancelledAt: row.cancelledAt,
          saleStatus: row.saleStatus,
          customerName: row.customerName,
          installmentCount: Number(row.installmentCount),
          allocatedTotal: row.allocatedTotal,
          nextDueDate: row.nextDueDate,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
