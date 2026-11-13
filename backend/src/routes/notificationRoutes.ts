import { Router, type Request, type Response, type NextFunction } from "express";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

import pool from "../config/database.js";
import { HttpError } from "../middleware/errorMiddleware.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getPagination, paginated, requireParam } from "../utils/http.js";

const router = Router({ mergeParams: true });

interface NotificationRow extends RowDataPacket {
  id: string;
  business_id: string;
  recipient_membership_id: string;
  installment_id: string;
  type: "UPCOMING" | "DUE_TODAY" | "OVERDUE";
  message: string;
  is_read: number;
  created_at: Date;
  read_at: Date | null;
}

interface MembershipContext {
  id: string;
  businessId: string;
  role: "OWNER" | "CASHIER";
}

router.use(requireAuth);

router.get(
  "/",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const membership = res.locals.businessMembership as MembershipContext | undefined;

      if (!membership || membership.businessId !== businessId) {
        throw new HttpError(403, "A valid business membership is required.");
      }

      const pagination = getPagination(req);
      const onlyUnread = req.query.unread === "true" || req.query.unread === "1";

      const [countRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM notifications
         WHERE business_id = ?
           AND recipient_membership_id = ?
           ${onlyUnread ? "AND is_read = FALSE" : ""}`,
        [businessId, membership.id]
      );

      const total = Number(countRows[0]?.total ?? 0);

      const [rows] = await pool.execute<NotificationRow[]>(
        `SELECT id, business_id, recipient_membership_id, installment_id,
                type, message, is_read, created_at, read_at
         FROM notifications
         WHERE business_id = ?
           AND recipient_membership_id = ?
           ${onlyUnread ? "AND is_read = FALSE" : ""}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [businessId, membership.id, pagination.limit, pagination.offset]
      );

      const data = rows.map((row) => ({
        id: row.id,
        businessId: row.business_id,
        recipientMembershipId: row.recipient_membership_id,
        installmentId: row.installment_id,
        type: row.type,
        message: row.message,
        isRead: row.is_read === 1,
        createdAt: row.created_at,
        readAt: row.read_at,
      }));

      res.status(200).json(paginated(data, total, pagination));
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/:notificationId/read",
  requireRole("OWNER", "CASHIER"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const businessId = requireParam(req, "businessId");
      const notificationId = requireParam(req, "notificationId");
      const membership = res.locals.businessMembership as MembershipContext | undefined;

      if (!membership || membership.businessId !== businessId) {
        throw new HttpError(403, "A valid business membership is required.");
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE notifications
         SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
         WHERE business_id = ?
           AND id = ?
           AND recipient_membership_id = ?
           AND is_read = FALSE`,
        [businessId, notificationId, membership.id]
      );

      if (result.affectedRows === 0) {
        const [existing] = await pool.execute<RowDataPacket[]>(
          `SELECT id
           FROM notifications
           WHERE business_id = ? AND id = ? AND recipient_membership_id = ?
           LIMIT 1`,
          [businessId, notificationId, membership.id]
        );

        if (existing.length === 0) {
          throw new HttpError(404, "Notification not found.");
        }
      }

      res.status(200).json({
        status: "success",
        message: "Notification marked as read.",
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
