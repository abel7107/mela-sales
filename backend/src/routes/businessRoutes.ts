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
  createBranchSchema,
  updateBranchSchema,
  assignBranchMemberSchema,
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
interface BranchRow extends RowDataPacket {
  id: string;
  business_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: number;
  created_at: Date;
  updated_at: Date;
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
// GET /api/v1/businesses/:businessId/branches
// OWNER can list all branches in the business.
router.get(
  "/:businessId/branches",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const [rows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ?
         ORDER BY created_at ASC`,
        [businessId]
      );

      res.status(200).json({
        status: "success",
        data: rows.map((row) => ({
          id: row.id,
          businessId: row.business_id,
          name: row.name,
          address: row.address,
          phone: row.phone,
          isActive: row.is_active === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/businesses/:businessId/branches
// OWNER can create a branch.
router.post(
  "/:businessId/branches",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");

      const parsed = createBranchSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid branch data.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;
      const branchId = randomUUID();

      await pool.execute<ResultSetHeader>(
        `INSERT INTO branches
           (id, business_id, name, address, phone)
         VALUES (?, ?, ?, ?, ?)`,
        [
          branchId,
          businessId,
          input.name,
          input.address ?? null,
          input.phone ?? null,
        ]
      );

      const [rows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, branchId]
      );

      const branch = rows[0];

      res.status(201).json({
        status: "success",
        message: "Branch created successfully.",
        data: {
          id: branch.id,
          businessId: branch.business_id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          isActive: branch.is_active === 1,
          createdAt: branch.created_at,
          updatedAt: branch.updated_at,
        },
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "A branch with this name already exists.",
        });
        return;
      }

      next(error);
    }
  }
);// PATCH /api/v1/businesses/:businessId/branches/:branchId
// OWNER can update or deactivate a branch.
router.patch(
  "/:businessId/branches/:branchId",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const branchId = requireParam(req, "branchId");

      const parsed = updateBranchSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid branch update.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const input = parsed.data;

      const [existingRows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, branchId]
      );

      if (existingRows.length === 0) {
        throw new HttpError(404, "Branch not found.");
      }

      await pool.execute<ResultSetHeader>(
        `UPDATE branches
         SET name = CASE WHEN ? THEN ? ELSE name END,
             address = CASE WHEN ? THEN ? ELSE address END,
             phone = CASE WHEN ? THEN ? ELSE phone END,
             is_active = CASE WHEN ? THEN ? ELSE is_active END
         WHERE business_id = ? AND id = ?`,
        [
          Object.hasOwn(input, "name"), input.name ?? null,
          Object.hasOwn(input, "address"), input.address ?? null,
          Object.hasOwn(input, "phone"), input.phone ?? null,
          Object.hasOwn(input, "isActive"), input.isActive ?? null,
          businessId,
          branchId,
        ]
      );

      const [rows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, branchId]
      );

      const branch = rows[0];

      res.status(200).json({
        status: "success",
        message: "Branch updated successfully.",
        data: {
          id: branch.id,
          businessId: branch.business_id,
          name: branch.name,
          address: branch.address,
          phone: branch.phone,
          isActive: branch.is_active === 1,
          createdAt: branch.created_at,
          updatedAt: branch.updated_at,
        },
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "A branch with this name already exists.",
        });
        return;
      }

      next(error);
    }
  }
);
// GET /api/v1/businesses/:businessId/branches/:branchId/members
// OWNER can list employees assigned to a branch.
router.get(
  "/:businessId/branches/:branchId/members",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const branchId = requireParam(req, "branchId");

      const [branchRows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, branchId]
      );

      if (branchRows.length === 0) {
        throw new HttpError(404, "Branch not found.");
      }

      const [members] = await pool.execute<RowDataPacket[]>(
        `SELECT
           bm.membership_id AS membershipId,
           m.auth_user_id AS authUserId,
           m.role,
           m.is_active AS isActive,
           bm.created_at AS assignedAt
         FROM branch_memberships bm
         INNER JOIN business_memberships m
           ON m.id = bm.membership_id
          AND m.business_id = bm.business_id
         WHERE bm.business_id = ?
           AND bm.branch_id = ?
         ORDER BY bm.created_at DESC`,
        [businessId, branchId]
      );

      res.status(200).json({
        status: "success",
        message: "Branch members retrieved successfully.",
        data: members.map((member) => ({
          membershipId: member.membershipId,
          authUserId: member.authUserId,
          role: member.role,
          isActive: member.isActive === 1,
          assignedAt: member.assignedAt,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);
// POST /api/v1/businesses/:businessId/branches/:branchId/members
// OWNER assigns an existing CASHIER to a branch.
router.post(
  "/:businessId/branches/:branchId/members",
  requireRole("OWNER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const branchId = requireParam(req, "branchId");

      const parsed = assignBranchMemberSchema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          status: "error",
          message: "Invalid branch member assignment.",
          errors: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }

      const { membershipId } = parsed.data;

      // Confirm the branch belongs to this business and is active.
      const [branchRows] = await pool.execute<BranchRow[]>(
        `SELECT id, business_id, name, address, phone,
                is_active, created_at, updated_at
         FROM branches
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, branchId]
      );

      if (branchRows.length === 0) {
        throw new HttpError(404, "Branch not found.");
      }

      if (branchRows[0].is_active !== 1) {
        throw new HttpError(400, "Cannot assign employees to an inactive branch.");
      }

      // Confirm the employee belongs to this business.
      const [memberRows] = await pool.execute<MembershipRow[]>(
        `SELECT id, business_id, auth_user_id, role,
                is_active, created_at
         FROM business_memberships
         WHERE business_id = ? AND id = ?
         LIMIT 1`,
        [businessId, membershipId]
      );

      if (memberRows.length === 0) {
        throw new HttpError(404, "Business member not found.");
      }

      const member = memberRows[0];

      if (member.role !== "CASHIER") {
        throw new HttpError(400, "Only CASHIER employees can be assigned to branches.");
      }

      if (member.is_active !== 1) {
        throw new HttpError(400, "Cannot assign an inactive employee.");
      }

      // Create the branch assignment.
      const assignmentId = randomUUID();

      await pool.execute<ResultSetHeader>(
        `INSERT INTO branch_memberships
           (id, business_id, branch_id, membership_id)
         VALUES (?, ?, ?, ?)`,
        [assignmentId, businessId, branchId, membershipId]
      );

      res.status(201).json({
        status: "success",
        message: "Employee assigned to branch successfully.",
        data: {
          id: assignmentId,
          businessId,
          branchId,
          membershipId,
          authUserId: member.auth_user_id,
          role: member.role,
        },
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        res.status(409).json({
          status: "error",
          message: "This employee is already assigned to this branch.",
        });
        return;
      }

      next(error);
    }
  }
);
export default router;
