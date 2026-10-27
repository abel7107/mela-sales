import { randomUUID } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../validators/customerValidator.js";
import {
  getBooleanParam,
  getPagination,
  paginated,
  requireParam,
} from "../utils/http.js";

const router = Router({ mergeParams: true });

interface CustomerRow extends RowDataPacket {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: number;
  created_at: Date;
  updated_at: Date;
  // Derived: only present on list/balance queries.
  outstanding_balance?: string;
  total_credit_sales?: string;
  total_payments?: string;
}

const SELECT_COLUMNS = `
  id, business_id, name, phone, email, address, notes,
  is_active, created_at, updated_at
`;

async function findCustomer(
  businessId: string,
  customerId: string
): Promise<CustomerRow | undefined> {
  const [rows] = await pool.execute<CustomerRow[]>(
    `SELECT ${SELECT_COLUMNS}
     FROM customers
     WHERE business_id = ? AND id = ?
     LIMIT 1`,
    [businessId, customerId]
  );

  return rows[0];
}

function toApi(row: CustomerRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.outstanding_balance !== undefined
      ? {
          outstandingBalance: row.outstanding_balance,
          totalCreditSales: row.total_credit_sales,
          totalPayments: row.total_payments,
        }
      : {}),
  };
}

router.use(requireAuth);

// GET /api/v1/businesses/:businessId/customers
// OWNER and CASHIER can list customers.
router.get(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const pagination = getPagination(req);

      const includeInactive = getBooleanParam(req, "include_inactive") ?? false;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      const where: string[] = ["business_id = ?"];
      const args: (string | number)[] = [businessId];

      if (!includeInactive) {
        where.push("is_active = TRUE");
      }

      if (q) {
        where.push("(name LIKE ? OR phone LIKE ? OR email LIKE ?)");
        const like = `%${q}%`;
        args.push(like, like, like);
      }

      const whereSql = where.join(" AND ");

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM customers WHERE ${whereSql}`,
        args
      );

      const [rows] = await pool.execute<CustomerRow[]>(
        `SELECT ${SELECT_COLUMNS}
         FROM customers
         WHERE ${whereSql}
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        [...args, pagination.limit, pagination.offset]
      );

      res.status(200).json(
        paginated(rows.map(toApi), Number(countRows[0].total), pagination)
      );
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/customers
// OWNER and CASHIER can create customers (cashiers need them for credit sales).
router.post(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const parsed = createCustomerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid customer data.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;
      const customerId = randomUUID();

      await pool.execute<ResultSetHeader>(
        `INSERT INTO customers
           (id, business_id, name, phone, email, address, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          businessId,
          input.name,
          input.phone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.notes ?? null,
          input.is_active ?? true,
        ]
      );

      const customer = await findCustomer(businessId, customerId);

      res.status(201).json({
        status: "success",
        message: "Customer created successfully.",
        data: toApi(customer!),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/customers/:customerId
router.get(
  "/:customerId",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const customerId = requireParam(req, "customerId");

      const customer = await findCustomer(businessId, customerId);

      if (!customer) {
        throw new HttpError(404, "Customer not found in this business.");
      }

      res.status(200).json({
        status: "success",
        data: toApi(customer),
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/v1/businesses/:businessId/customers/:customerId
router.patch(
  "/:customerId",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const customerId = requireParam(req, "customerId");

      const parsed = updateCustomerSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid customer update.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE customers
         SET
           name     = CASE WHEN ? THEN ? ELSE name END,
           phone    = CASE WHEN ? THEN ? ELSE phone END,
           email    = CASE WHEN ? THEN ? ELSE email END,
           address  = CASE WHEN ? THEN ? ELSE address END,
           notes    = CASE WHEN ? THEN ? ELSE notes END,
           is_active = CASE WHEN ? THEN ? ELSE is_active END
         WHERE business_id = ? AND id = ?`,
        [
          Object.hasOwn(input, "name"), input.name ?? null,
          Object.hasOwn(input, "phone"), input.phone ?? null,
          Object.hasOwn(input, "email"), input.email ?? null,
          Object.hasOwn(input, "address"), input.address ?? null,
          Object.hasOwn(input, "notes"), input.notes ?? null,
          Object.hasOwn(input, "is_active"), input.is_active ?? null,
          businessId,
          customerId,
        ]
      );

      if (result.affectedRows === 0) {
        throw new HttpError(404, "Customer not found in this business.");
      }

      const customer = await findCustomer(businessId, customerId);

      res.status(200).json({
        status: "success",
        message: "Customer updated successfully.",
        data: toApi(customer!),
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/v1/businesses/:businessId/customers/:customerId
// Soft delete: deactivate instead of physically removing the record.
router.delete(
  "/:customerId",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const customerId = requireParam(req, "customerId");

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE customers
         SET is_active = FALSE
         WHERE business_id = ? AND id = ?`,
        [businessId, customerId]
      );

      if (result.affectedRows === 0) {
        throw new HttpError(404, "Customer not found in this business.");
      }

      const customer = await findCustomer(businessId, customerId);

      res.status(200).json({
        status: "success",
        message: "Customer deactivated successfully.",
        data: toApi(customer!),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
