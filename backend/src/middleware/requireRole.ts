
import type { Request, Response, NextFunction } from "express";
import {
  findActiveBusinessMembership,
  type BusinessRole,
} from "../services/businessMembershipService.js";

export function requireRole(...allowedRoles: BusinessRole[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const auth = res.locals.auth as
      | { userId?: string }
      | undefined;

    if (!auth?.userId) {
      res.status(401).json({
        status: "error",
        message: "Authentication is required.",
      });
      return;
    }

    // The business ID must come from the route parameter.
          const rawBusinessId = req.params.businessId;
      const businessId = Array.isArray(rawBusinessId)
        ? rawBusinessId[0]
        : rawBusinessId;

    if (!businessId) {
      res.status(400).json({
        status: "error",
        message: "Business ID is required in the route.",
      });
      return;
    }

    try {
      const membership = await findActiveBusinessMembership(
        auth.userId,
        businessId
      );

      if (!membership) {
        res.status(403).json({
          status: "error",
          message: "You do not have an active membership in this business.",
        });
        return;
      }

      if (!allowedRoles.includes(membership.role)) {
        res.status(403).json({
          status: "error",
          message: "You do not have permission to perform this action.",
        });
        return;
      }

      res.locals.businessMembership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}
