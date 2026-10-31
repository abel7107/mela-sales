import { randomUUID } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { loadSaleDetail } from "../services/saleService.js";
import { requireParam } from "../utils/http.js";
import { renderInvoiceHtml } from "../utils/invoiceHtml.js";

const router = Router({ mergeParams: true });

interface MembershipContext {
  id: string;
  businessId: string;
  role: "OWNER" | "CASHIER";
}

interface BusinessRow extends RowDataPacket {
  id: string;
  name: string;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
}

router.use(requireAuth);

async function loadBusiness(businessId: string): Promise<BusinessRow> {
  const [rows] = await pool.execute<BusinessRow[]>(
    `SELECT id, name, currency, phone, email, address, logo_url
     FROM businesses
     WHERE id = ? AND is_active = TRUE
     LIMIT 1`,
    [businessId]
  );

  if (!rows[0]) {
    throw new HttpError(404, "Business not found.");
  }

  return rows[0];
}

// GET /api/v1/businesses/:businessId/sales/:saleId
router.get(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const saleId = requireParam(req, "saleId");

      const sale = await loadSaleDetail(businessId, saleId);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      res.status(200).json({
        status: "success",
        data: sale,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/sales/:saleId/void
// Only OWNER can void a sale.
router.post(
  "/void",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const businessId = requireParam(req, "businessId");
    const saleId = requireParam(req, "saleId");

    const membership = res.locals.businessMembership as
      | MembershipContext
      | undefined;

    if (!membership) {
      res.status(403).json({
        status: "error",
        message: "A valid business membership is required.",
      });
      return;
    }

    const body =
      typeof req.body === "object" && req.body !== null ? req.body : {};

    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (reason.length < 3) {
      res.status(400).json({
        status: "error",
        message: "A void reason of at least 3 characters is required.",
      });
      return;
    }

    if (reason.length > 500) {
      res.status(400).json({
        status: "error",
        message: "The void reason cannot exceed 500 characters.",
      });
      return;
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const sale = await loadSaleDetail(businessId, saleId);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (sale.status === "VOID") {
        throw new HttpError(409, "This sale has already been voided.");
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE sales
         SET status = 'VOID',
             void_reason = ?,
             voided_at = CURRENT_TIMESTAMP,
             voided_by_membership_id = ?
         WHERE business_id = ?
           AND id = ?
           AND status <> 'VOID'`,
        [reason, membership.id, businessId, saleId]
      );

      await connection.execute<ResultSetHeader>(
        `INSERT INTO audit_events (
          id,
          business_id,
          actor_membership_id,
          action,
          entity_type,
          entity_id,
          reason,
          details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          businessId,
          membership.id,
          "SALE_VOIDED",
          "SALE",
          saleId,
          reason,
          JSON.stringify({
            previousStatus: sale.status,
            totalAmount: sale.totalAmount,
            amountPaid: sale.amountPaid,
          }),
        ]
      );

      await connection.commit();

      const updated = await loadSaleDetail(businessId, saleId);

      res.status(200).json({
        status: "success",
        message: "Sale voided successfully.",
        data: updated,
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Void rollback failed:", rollbackError);
        }
      }

      next(error);
    } finally {
      connection?.release();
    }
  }
);

// GET /api/v1/businesses/:businessId/sales/:saleId/invoice
router.get(
  "/invoice",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const saleId = requireParam(req, "saleId");

      const sale = await loadSaleDetail(businessId, saleId);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (!sale.invoice) {
        throw new HttpError(404, "No invoice has been issued for this sale.");
      }

      const business = await loadBusiness(businessId);

      res.status(200).json({
        status: "success",
        data: {
          id: sale.invoice.id,
          invoiceNumber: sale.invoice.invoiceNumber,
          issuedAt: sale.invoice.issuedAt,
          business: {
            id: business.id,
            name: business.name,
            currency: business.currency,
            phone: business.phone,
            email: business.email,
            address: business.address,
            logoUrl: business.logo_url,
          },
          sale,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/sales/:saleId/invoice/print
// Returns a self-contained HTML document suitable for printing or sharing.
router.get(
  "/invoice/print",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const saleId = requireParam(req, "saleId");

      const sale = await loadSaleDetail(businessId, saleId);

      if (!sale) {
        throw new HttpError(404, "Sale not found in this business.");
      }

      if (!sale.invoice) {
        throw new HttpError(404, "No invoice has been issued for this sale.");
      }

      const business = await loadBusiness(businessId);
      const html = renderInvoiceHtml(business, sale);

      res.status(200)
        .set("Content-Type", "text/html; charset=utf-8")
        .set(
          "Content-Disposition",
          `inline; filename="${sale.invoice.invoiceNumber}.html"`
        )
        .send(html);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
