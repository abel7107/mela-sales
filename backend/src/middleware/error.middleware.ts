import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const globalErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload attributes.",
        details: err.issues.map(e => ({
          field: e.path.join("."),
          issue: e.message,
        })),
      },
    });
    return;
  }

  console.error(`[Server Error]:`, err);

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected server condition occurred."
          : err.message,
    },
  });
};
