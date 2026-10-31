
import type { Request, Response, NextFunction } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

function statusFromError(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error
  ) {
    const status = (error as BodyParserError).status;
    if (typeof status === "number") return status;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error
  ) {
    const status = (error as BodyParserError).statusCode;
    if (typeof status === "number") return status;
  }

  return undefined;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof (error as BodyParserError).type === "string"
  );
}

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    status: "error",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  const withRequestId = (body: Record<string, unknown>) => ({
    ...body,
    ...(req.requestId ? { requestId: req.requestId } : {}),
  });

  if (error instanceof HttpError) {
    res.status(error.statusCode).json(
      withRequestId({
        status: "error",
        message: error.message,
        ...(error.details !== undefined ? { errors: error.details } : {}),
      })
    );
    return;
  }

  // Malformed JSON / payload errors raised by express.json().
  if (isBodyParserError(error) && error.type === "entity.parse.failed") {
    res.status(400).json(
      withRequestId({
        status: "error",
        message: "The request body is not valid JSON.",
      })
    );
    return;
  }

  if (isBodyParserError(error) && error.type === "entity.too.large") {
    res.status(413).json(
      withRequestId({
        status: "error",
        message: "The request body is too large.",
      })
    );
    return;
  }

  const status = statusFromError(error);
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json(
      withRequestId({
        status: "error",
        message: error instanceof Error ? error.message : "Bad request.",
      })
    );
    return;
  }

  console.error(error);

  res.status(500).json(
    withRequestId({
      status: "error",
      message: "Internal server error",
    })
  );
}
