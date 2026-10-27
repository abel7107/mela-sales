
import type { RowDataPacket } from "mysql2";
import pool from "../config/database.js";

export type BusinessRole = "OWNER" | "CASHIER";

export interface BusinessMembership {
  id: string;
  businessId: string;
  authUserId: string;
  role: BusinessRole;
}

interface MembershipRow extends RowDataPacket {
  id: string;
  business_id: string;
  auth_user_id: string;
  role: BusinessRole;
}

export async function findActiveBusinessMembership(
  authUserId: string,
  businessId: string
): Promise<BusinessMembership | null> {
  const [rows] = await pool.execute<MembershipRow[]>(
    `SELECT id, business_id, auth_user_id, role
     FROM business_memberships
     WHERE auth_user_id = ?
       AND business_id = ?
       AND is_active = TRUE
     LIMIT 1`,
    [authUserId, businessId]
  );

  const membership = rows[0];

  if (!membership) {
    return null;
  }

  return {
    id: membership.id,
    businessId: membership.business_id,
    authUserId: membership.auth_user_id,
    role: membership.role,
  };
}
