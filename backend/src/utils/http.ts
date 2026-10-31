import type { Request } from "express";
import { HttpError } from "../middleware/errorMiddleware.js";

export function getParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requireParam(
  req: Request,
  name: string
): string {
  const value = getParam(req.params[name]);

  if (!value) {
    throw new HttpError(400, `${name} is required.`);
  }

  return value;
}

export interface Pagination {
  limit: number;
  offset: number;
  page: number;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/**
 * Reads `limit` and `page` (1-based) from the query string.
 * `offset` is also accepted as an alternative to `page`.
 */
export function getPagination(req: Request): Pagination {
  const rawLimit = req.query.limit;
  const rawPage = req.query.page;
  const rawOffset = req.query.offset;

  let limit = DEFAULT_LIMIT;

  if (typeof rawLimit === "string" && rawLimit !== "") {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw new HttpError(
        400,
        `limit must be an integer between 1 and ${MAX_LIMIT}.`
      );
    }
    limit = parsed;
  }

  let offset = 0;

  if (typeof rawOffset === "string" && rawOffset !== "") {
    const parsed = Number(rawOffset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new HttpError(400, "offset must be a non-negative integer.");
    }
    offset = parsed;
  } else if (typeof rawPage === "string" && rawPage !== "") {
    const parsed = Number(rawPage);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new HttpError(400, "page must be a positive integer.");
    }
    offset = (parsed - 1) * limit;
  }

  return { limit, offset, page: Math.floor(offset / limit) + 1 };
}

export function paginated<T>(
  data: T[],
  total: number,
  pagination: Pagination
) {
  return {
    status: "success" as const,
    data,
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      page: pagination.page,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
      hasMore: pagination.offset + data.length < total,
    },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates a `YYYY-MM-DD` query parameter and returns it.
 * Returns `undefined` when the parameter is absent.
 */
export function getDateParam(
  req: Request,
  name: string
): string | undefined {
  const raw = req.query[name];

  if (raw === undefined || raw === "") return undefined;

  if (typeof raw !== "string" || !DATE_RE.test(raw)) {
    throw new HttpError(400, `${name} must be a YYYY-MM-DD date.`);
  }

  const parsed = new Date(`${raw}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${name} is not a valid date.`);
  }

  return raw;
}

export function getBooleanParam(
  req: Request,
  name: string
): boolean | undefined {
  const raw = req.query[name];

  if (raw === undefined || raw === "") return undefined;

  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;

  throw new HttpError(400, `${name} must be true or false.`);
}

export function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ER_DUP_ENTRY"
  );
}
