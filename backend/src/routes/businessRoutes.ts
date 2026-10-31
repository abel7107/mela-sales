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
  addMemberSchema,
  createBusinessSchema,
  updateBusinessSchema,
  updateMemberSchema,
} from "../validators/businessValidator.js";
import { isDuplicateEntryError, requireParam } from "../utils/http.js";

const router = Router({ mergeParams: true });

interface AuthContext {
  userId: string;
}

interface MembershipRow extends RowDataPacket {
  id: string;
  business_id: string;
  auth_user_id: string;
  role: "OWNER" | "CASHIER";
  is_active: number;
  created_at: Date;
}

interface BusinessRow extends RowDataPacket {
  id: string;
  name: string;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

function toBusinessApi(row: BusinessRow) {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    phone: row.phone,
    email: row.email,
    address: row.address,
    logoUrl: row.logo_url,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveAuthUser(res: Response): string {
  const auth = res.locals.auth as AuthContext | undefined;

  if (!auth?.userId) {
    throw new HttpError(401, "Authentication is required.");
  }

  return auth.userId;
}

async function findBusiness(
  businessId: string
): Promise<BusinessRow | undefined> {
  const [rows] = await pool.execute<BusinessRow[]>(
    `SELECT id, name, currency, phone, email, address, logo_url,
            is_active, created_at, updated_at
     FROM businesses
     WHERE id = ?
     LIMIT 1`,
    [businessId]
  );

  return rows[0];
}

router.use(requireAuth);

// GET /api/v1/businesses
// Lists every business the authenticated user belongs to.
router.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = resolveAuthUser(res);

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT b.id, b.name, b.currency, b.phone, b.email, b.address,
                b.logo_url, b.is_active, b.created_at, b.updated_at,
                m.id AS membership_id, m.role AS membership_role
         FROM businesses b
         JOIN business_memberships m
           ON m.business_id = b.id
          AND m.auth_user_id = ?
          AND m.is_active = TRUE
         WHERE b.is_active = TRUE
         ORDER BY b.name ASC`,
        [userId]
      );

      res.status(200).json({
        status: "success",
        data: rows.map((row) => ({
          ...toBusinessApi(row as BusinessRow),
          membership: {
            id: row.membership_id,
            role: row.membership_role,
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses
// Creates a business; the creator becomes its OWNER.
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = resolveAuthUser(res);

      const parsed = createBusinessSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid business data.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;
      const businessId = randomUUID();
      const membershipId = randomUUID();

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        await connection.execute<ResultSetHeader>(
          `INSERT INTO businesses
             (id, name, currency, phone, email, address, logo_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            input.name,
            input.currency ?? "ETB",
            input.phone ?? null,
            input.email ?? null,
            input.address ?? null,
            input.logoUrl ?? null,
          ]
        );

        await connection.execute<ResultSetHeader>(
          `INSERT INTO business_memberships
             (id, business_id, auth_user_id, role)
           VALUES (?, ?, ?, 'OWNER')`,
          [membershipId, businessId, userId]
        );

        await connection.execute<ResultSetHeader>(
          `INSERT INTO invoice_sequences (business_id, next_number)
           VALUES (?, 1)`,
          [businessId]
        );

        await connection.execute<ResultSetHeader>(
          `INSERT INTO audit_events
             (id, business_id, actor_membership_id, action, entity_type,
              entity_id, details)
           VALUES (?, ?, ?, 'BUSINESS_CREATED', 'BUSINESS', ?, ?)`,
          [
            randomUUID(),
            businessId,
            membershipId,
            businessId,
            JSON.stringify({ name: input.name }),
          ]
        );

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }

      const business = await findBusiness(businessId);

      res.status(201).json({
        status: "success",
        message: "Business created successfully.",
        data: {
          ...toBusinessApi(business!),
          membership: { id: membershipId, role: "OWNER" },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId
router.get(
  "/:businessId",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const business = await findBusiness(businessId);

      if (!business || business.is_active !== 1) {
        throw new HttpError(404, "Business not found.");
      }

      const membership = res.locals.businessMembership as {
        id: string;
        role: string;
      };

      res.status(200).json({
        status: "success",
        data: {
          ...toBusinessApi(business),
          membership: { id: membership.id, role: membership.role },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PATCH /api/v1/businesses/:businessId
// Only OWNER can update business profile.
router.patch(
  "/:businessId",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const parsed = updateBusinessSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid business update.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE businesses
         SET
           name     = CASE WHEN ? THEN ? ELSE name END,
           currency = CASE WHEN ? THEN ? ELSE currency END,
           phone    = CASE WHEN ? THEN ? ELSE phone END,
           email    = CASE WHEN ? THEN ? ELSE email END,
           address  = CASE WHEN ? THEN ? ELSE address END,
           logo_url = CASE WHEN ? THEN ? ELSE logo_url END
         WHERE id = ?`,
        [
          Object.hasOwn(input, "name"), input.name ?? null,
          Object.hasOwn(input, "currency"), input.currency ?? null,
          Object.hasOwn(input, "phone"), input.phone ?? null,
          Object.hasOwn(input, "email"), input.email ?? null,
          Object.hasOwn(input, "address"), input.address ?? null,
          Object.hasOwn(input, "logoUrl"), input.logoUrl ?? null,
          businessId,
        ]
      );

      if (result.affectedRows === 0) {
        throw new HttpError(404, "Business not found.");
      }

      const business = await findBusiness(businessId);

      res.status(200).json({
        status: "success",
        message: "Business updated successfully.",
        data: toBusinessApi(business!),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/businesses/:businessId/members
router.get(
  "/:businessId/members",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const [rows] = await pool.execute<MembershipRow[]>(
        `SELECT id, business_id, auth_user_id, role, is_active, created_at
         FROM business_memberships
         WHERE business_id = ?
         ORDER BY created_at ASC`,
        [businessId]
      );

      res.status(200).json({
        status: "success",
        data: rows.map((row) => ({
          id: row.id,
          authUserId: row.auth_user_id,
          role: row.role,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/members
// OWNER can grant an existing Mela Auth user access to the business.
router.post(
  "/:businessId/members",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const parsed = addMemberSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid member data.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

       const input = parsed.data;

       let authUserId = input.authUserId;

       if (!authUserId && input.email) {
         const [userRows] = await pool.execute<RowDataPacket[]>(
           `SELECT id FROM auth_users WHERE email = ? AND is_active = TRUE LIMIT 1`,
           [input.email]
         );

         if (userRows.length === 0) {
           res.status(404).json({
             status: "error",
             message: "No active user found with that email.",
           });
           return;
         }

         authUserId = String(userRows[0].id);
       }

       if (!authUserId) {
         res.status(400).json({
           status: "error",
           message: "Either authUserId or email is required.",
         });
         return;
       }

       const membershipId = randomUUID();

       await pool.execute<ResultSetHeader>(
         `INSERT INTO business_memberships
            (id, business_id, auth_user_id, role)
          VALUES (?, ?, ?, ?)`,
         [membershipId, businessId, authUserId, input.role]
       );

       res.status(201).json({
         status: "success",
         message: "Member added successfully.",
         data: {
           id: membershipId,
           authUserId,
           role: input.role,
           isActive: true,
         },
       });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "This user is already a member of this business.",
        });
        return;
      }

      next(error);
    }
  }
);

// PATCH /api/v1/businesses/:businessId/members/:membershipId
// OWNER can change a member's role or deactivate them.
router.patch(
  "/:businessId/members/:membershipId",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const membershipId = requireParam(req, "membershipId");

      const parsed = updateMemberSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid member update.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;
      const actor = res.locals.businessMembership as { id: string };

      if (membershipId === actor.id && input.isActive === false) {
        res.status(400).json({
          status: "error",
          message: "You cannot deactivate your own membership.",
        });
        return;
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE business_memberships
         SET role = CASE WHEN ? THEN ? ELSE role END,
             is_active = CASE WHEN ? THEN ? ELSE is_active END
         WHERE business_id = ? AND id = ?`,
        [
          Object.hasOwn(input, "role"), input.role ?? null,
          Object.hasOwn(input, "isActive"), input.isActive ?? null,
          businessId,
          membershipId,
        ]
      );

      if (result.affectedRows === 0) {
        throw new HttpError(404, "Membership not found in this business.");
      }

      const [rows] = await pool.execute<MembershipRow[]>(
        `SELECT id, business_id, auth_user_id, role, is_active, created_at
         FROM business_memberships
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, membershipId]
      );

      const row = rows[0];

      res.status(200).json({
        status: "success",
        message: "Member updated successfully.",
        data: {
          id: row.id,
          authUserId: row.auth_user_id,
          role: row.role,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
