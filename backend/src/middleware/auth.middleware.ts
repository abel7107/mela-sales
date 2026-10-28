import { Request, Response, NextFunction } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    authSubject: string;
    businessId: string;
  };
}

export const requireTenantAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  // Temporary mock implementation mimicking Mela Auth pipeline for early repository tracking
  const mockSubject = "user-auth-subject-12345";
  const mockBusinessId = "business-uuid-placeholder";

  req.user = {
    authSubject: mockSubject,
    businessId: mockBusinessId,
  };

  next();
};
