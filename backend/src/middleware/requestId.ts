import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

const HEADER = "x-request-id";
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Attaches a request id, echoing a client-supplied `X-Request-Id` when it is
 * well-formed so logs can be correlated end to end.
 */
export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers[HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;

  req.requestId =
    value && SAFE_ID.test(value) ? value : randomUUID();

  res.setHeader("X-Request-Id", req.requestId);
  next();
}
