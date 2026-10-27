import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { RowDataPacket } from "mysql2";

import pool from "../config/database.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  getDateParam,
  getPagination,
  paginated,
  requireParam,
} from "../utils/http.js";

const router = Router({ mergeParams: true });

router.use(requireAuth);

function dateRange(req: Request): { from?: string; to?: string } {
  return {
    from: getDateParam(req, "from"),
    to: getDateParam(req, "to"),
  };
}

function appendRange(
  where: string[],
  args: (string | number)[],
  column: string,
  from?: string,
  to?: string
): void {
  // `column` may already include a table alias, e.g. "s.created_at".
  if (from) {
    where.push(`${column} >= ?`);
    args.push(`${from} 00:00:00`);
  }

  if (to) {
    where.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`);
    args.push(to);
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

      // Conditions for queries against `sales` alone.
      const where: string[] = ["business_id = ?", "status <> 'VOID'"];
      const args: (string | number)[] = [businessId];
      appendRange(where, args, "created_at", from, to);

      const whereSql = where.join(" AND ");

      // Conditions for the joined `sale_lines` / `sales` query.
      const lineWhere: string[] = [
        "s.business_id = ?",
        "s.status <> 'VOID'",
      ];
      const lineArgs: (string | number)[] = [businessId];
      appendRange(lineWhere, lineArgs, "s.created_at", from, to);

      const [totals] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS saleCount,
                COALESCE(SUM(total_amount), 0) AS totalAmount,
                COALESCE(SUM(tax_amount), 0) AS taxAmount,
                COALESCE(SUM(discount_amount), 0) AS discountAmount,
                COALESCE(SUM(CASE WHEN sale_type = 'CASH' THEN total_amount END), 0) AS cashAmount,
                COALESCE(SUM(CASE WHEN sale_type = 'CREDIT' THEN total_amount END), 0) AS creditAmount,
                COALESCE(SUM(CASE WHEN status = 'OPEN' THEN total_amount END), 0) AS outstandingAmount
         FROM sales
         WHERE ${whereSql}`,
        args
      );

      const [daily] = await pool.execute<RowDataPacket[]>(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS saleCount,
                COALESCE(SUM(total_amount), 0) AS totalAmount,
                COALESCE(SUM(CASE WHEN sale_type = 'CASH' THEN total_amount END), 0) AS cashAmount,
                COALESCE(SUM(CASE WHEN sale_type = 'CREDIT' THEN total_amount END), 0) AS creditAmount
         FROM sales
         WHERE ${whereSql}
         GROUP BY DATE(created_at)
         ORDER BY day DESC`,
        args
      );

      const [topProducts] = await pool.execute<RowDataPacket[]>(
        `SELECT sl.item_name AS name,
                sl.item_type AS type,
                COALESCE(SUM(sl.quantity), 0) AS quantitySold,
                COALESCE(SUM(sl.line_total), 0) AS revenue
         FROM sale_lines sl
         JOIN sales s
           ON s.business_id = sl.business_id AND s.id = sl.sale_id
         WHERE ${lineWhere.join(" AND ")}
         GROUP BY sl.item_name, sl.item_type
         ORDER BY revenue DESC
         LIMIT 10`,
        lineArgs
      );

      const voidWhere: string[] = ["business_id = ?", "status = 'VOID'"];
      const voidArgs: (string | number)[] = [businessId];
      appendRange(voidWhere, voidArgs, "created_at", from, to);

      const [voided] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS voidedCount
         FROM sales
         WHERE ${voidWhere.join(" AND ")}`,
        voidArgs
      );

      res.status(200).json({
        status: "success",
        data: {
          range: { from: from ?? null, to: to ?? null },
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
      const onlyWithBalance =
        req.query.only_with_balance === "true" ||
        req.query.only_with_balance === "1";

      const having = onlyWithBalance ? "HAVING outstandingBalance > 0" : "";

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM (
           SELECT c.id
           FROM customers c
           LEFT JOIN sales s
             ON s.business_id = c.business_id
            AND s.customer_id = c.id
            AND s.status <> 'VOID'
           LEFT JOIN (
             SELECT business_id, sale_id, SUM(amount) AS paid
             FROM payments
             GROUP BY business_id, sale_id
           ) p ON p.business_id = s.business_id AND p.sale_id = s.id
           WHERE c.business_id = ? AND c.is_active = TRUE
           GROUP BY c.id
           ${having}
         ) t`,
        [businessId]
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT c.id,
                c.name,
                c.phone,
                COALESCE(SUM(s.total_amount), 0) AS totalSales,
                COALESCE(SUM(p.paid), 0) AS totalPaid,
                COALESCE(SUM(s.total_amount), 0) - COALESCE(SUM(p.paid), 0)
                  AS outstandingBalance,
                MAX(s.created_at) AS lastSaleAt
         FROM customers c
         LEFT JOIN sales s
           ON s.business_id = c.business_id
          AND s.customer_id = c.id
          AND s.status <> 'VOID'
         LEFT JOIN (
           SELECT business_id, sale_id, SUM(amount) AS paid
           FROM payments
           GROUP BY business_id, sale_id
         ) p ON p.business_id = s.business_id AND p.sale_id = s.id
         WHERE c.business_id = ? AND c.is_active = TRUE
         GROUP BY c.id, c.name, c.phone
         ${having}
         ORDER BY outstandingBalance DESC, c.name ASC
         LIMIT ? OFFSET ?`,
        [businessId, pagination.limit, pagination.offset]
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

      const where: string[] = [
        "p.business_id = ?",
        "s.status <> 'VOID'",
      ];
      const args: (string | number)[] = [businessId];
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
         JOIN sales s ON s.business_id = p.business_id AND s.id = p.sale_id
         WHERE ${whereSql}`,
        args
      );

      const [totals] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(p.amount), 0) AS totalAmount,
                COUNT(*) AS paymentCount
         FROM payments p
         JOIN sales s ON s.business_id = p.business_id AND s.id = p.sale_id
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
         JOIN sales s ON s.business_id = p.business_id AND s.id = p.sale_id
         LEFT JOIN invoices i
           ON i.business_id = p.business_id AND i.sale_id = p.sale_id
         LEFT JOIN customers c
           ON c.business_id = s.business_id AND c.id = s.customer_id
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

export default router;
