
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
import {
  getBooleanParam,
  getPagination,
  isDuplicateEntryError,
  paginated,
  requireParam,
} from "../utils/http.js";
import {
  createProductSchema,
  updateProductSchema,
} from "../validators/productValidator.js";

const router = Router({ mergeParams: true });

interface ProductServiceRow extends RowDataPacket {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  type: "PRODUCT" | "SERVICE";
  price: string;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

async function findProduct(
  businessId: string,
  productId: string
): Promise<ProductServiceRow | undefined> {
  const [rows] = await pool.execute<ProductServiceRow[]>(
    `SELECT id, business_id, name, description, sku, type, price,
            is_active, created_at, updated_at
     FROM product_services
     WHERE business_id = ? AND id = ?
     LIMIT 1`,
    [businessId, productId]
  );

  return rows[0];
}

function toApi(row: ProductServiceRow) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    type: row.type,
    price: row.price,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// All endpoints require a valid Mela Auth access token.
router.use(requireAuth);

// GET /api/v1/businesses/:businessId/products-services
// OWNER and CASHIER can list products/services.
// Query params: q, include_inactive, limit, page.
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

      const includeInactive =
        getBooleanParam(req, "include_inactive") ?? false;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      const where: string[] = ["business_id = ?"];
      const args: (string | number)[] = [businessId];

      if (!includeInactive) {
        where.push("is_active = TRUE");
      }

      if (q) {
        where.push("(name LIKE ? OR sku LIKE ? OR description LIKE ?)");
        const like = `%${q}%`;
        args.push(like, like, like);
      }

      const whereSql = where.join(" AND ");

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM product_services WHERE ${whereSql}`,
        args
      );

      const [products] = await pool.execute<ProductServiceRow[]>(
        `SELECT id, business_id, name, description, sku, type, price,
                is_active, created_at, updated_at
         FROM product_services
         WHERE ${whereSql}
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        [...args, pagination.limit, pagination.offset]
      );

      res.status(200).json(
        paginated(products.map(toApi), Number(countRows[0].total), pagination)
      );
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/products-services/:productId
router.get(
  "/:productId",
  requireRole("OWNER", "CASHIER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const productId = requireParam(req, "productId");

      const product = await findProduct(businessId, productId);

      if (!product) {
        throw new HttpError(
          404,
          "Product/service not found in this business."
        );
      }

      res.status(200).json({
        status: "success",
        data: toApi(product),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/products-services
// Only OWNER can create products/services.
router.post(
  "/",
  requireRole("OWNER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const parsed = createProductSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid product/service data.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;
      const productId = randomUUID();

      await pool.execute<ResultSetHeader>(
        `INSERT INTO product_services
          (id, business_id, name, description, sku, type, price, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId,
          businessId,
          input.name,
          input.description ?? null,
          input.sku ?? null,
          input.type,
          input.price,
          input.is_active ?? true,
        ]
      );

      const product = await findProduct(businessId, productId);

      res.status(201).json({
        status: "success",
        message: "Product/service created successfully.",
        data: toApi(product!),
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "A product/service with this SKU already exists in this business.",
        });
        return;
      }

      next(error);
    }
  }
);

// PATCH /api/v1/businesses/:businessId/products-services/:productId
// Only OWNER can update products/services.
router.patch(
  "/:productId",
  requireRole("OWNER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const productId = requireParam(req, "productId");

      const parsed = updateProductSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid product/service update.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE product_services
         SET
           name = CASE WHEN ? THEN ? ELSE name END,
           description = CASE WHEN ? THEN ? ELSE description END,
           sku = CASE WHEN ? THEN ? ELSE sku END,
           type = CASE WHEN ? THEN ? ELSE type END,
           price = CASE WHEN ? THEN ? ELSE price END,
           is_active = CASE WHEN ? THEN ? ELSE is_active END
         WHERE business_id = ? AND id = ?`,
        [
          Object.hasOwn(input, "name"), input.name ?? null,
          Object.hasOwn(input, "description"), input.description ?? null,
          Object.hasOwn(input, "sku"), input.sku ?? null,
          Object.hasOwn(input, "type"), input.type ?? null,
          Object.hasOwn(input, "price"), input.price ?? null,
          Object.hasOwn(input, "is_active"), input.is_active ?? null,
          businessId,
          productId,
        ]
      );

      if (result.affectedRows === 0) {
        throw new HttpError(
          404,
          "Product/service not found in this business."
        );
      }

      const product = await findProduct(businessId, productId);

      res.status(200).json({
        status: "success",
        message: "Product/service updated successfully.",
        data: toApi(product!),
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "A product/service with this SKU already exists in this business.",
        });
        return;
      }

      next(error);
    }
  }
);

// DELETE /api/v1/businesses/:businessId/products-services/:productId
// Soft delete: deactivate instead of physically removing the record.
router.delete(
  "/:productId",
  requireRole("OWNER"),
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const productId = requireParam(req, "productId");

      await pool.execute<ResultSetHeader>(
        `UPDATE product_services
         SET is_active = FALSE
         WHERE business_id = ? AND id = ?`,
        [businessId, productId]
      );

      const product = await findProduct(businessId, productId);

      if (!product) {
        res.status(404).json({
          status: "error",
          message: "Product/service not found in this business.",
        });
        return;
      }

      res.status(200).json({
        status: "success",
        message: "Product/service deactivated successfully.",
        data: toApi(product!),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
