import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { HttpError } from "../../src/middleware/errorMiddleware.js";
import {
  DEFAULT_LIMIT,
  getDateParam,
  getPagination,
  requireParam,
} from "../../src/utils/http.js";

function request(query: Record<string, unknown>, params: Record<string, string> = {}): Request {
  return { query, params } as unknown as Request;
}

describe("getPagination", () => {
  it("returns defaults when no params are given", () => {
    const result = getPagination(request({}));
    expect(result).toEqual({ limit: DEFAULT_LIMIT, offset: 0, page: 1 });
  });

  it("computes offset from page", () => {
    expect(getPagination(request({ page: "3", limit: "10" }))).toEqual({
      limit: 10,
      offset: 20,
      page: 3,
    });
  });

  it("accepts a direct offset", () => {
    expect(getPagination(request({ offset: "25", limit: "5" }))).toEqual({
      limit: 5,
      offset: 25,
      page: 6,
    });
  });

  it("prefers offset over page", () => {
    expect(getPagination(request({ offset: "7", page: "99" })).offset).toBe(7);
  });

  it("rejects an out-of-range limit", () => {
    expect(() => getPagination(request({ limit: "0" }))).toThrow(HttpError);
    expect(() => getPagination(request({ limit: "9999" }))).toThrow(HttpError);
    expect(() => getPagination(request({ limit: "abc" }))).toThrow(HttpError);
    expect(() => getPagination(request({ page: "0" }))).toThrow(HttpError);
    expect(() => getPagination(request({ offset: "-1" }))).toThrow(HttpError);
  });
});

describe("getDateParam", () => {
  it("returns undefined when absent", () => {
    expect(getDateParam(request({}), "from")).toBeUndefined();
    expect(getDateParam(request({ from: "" }), "from")).toBeUndefined();
  });

  it("accepts a YYYY-MM-DD value", () => {
    expect(getDateParam(request({ from: "2026-01-31" }), "from")).toBe(
      "2026-01-31"
    );
  });

  it("rejects malformed dates", () => {
    expect(() => getDateParam(request({ from: "31/01/2026" }), "from")).toThrow(
      HttpError
    );
    expect(() => getDateParam(request({ from: "2026-13-01" }), "from")).toThrow(
      HttpError
    );
    expect(() => getDateParam(request({ from: "2026-01-31T00:00:00Z" }), "from")).toThrow(
      HttpError
    );
  });
});

describe("requireParam", () => {
  it("returns the param when present", () => {
    expect(requireParam(request({}, { businessId: "abc" }), "businessId")).toBe(
      "abc"
    );
  });

  it("returns the first value when the param is an array", () => {
    expect(
      requireParam(
        request({}, { businessId: ["first", "second"] as never }),
        "businessId"
      )
    ).toBe("first");
  });

  it("throws when missing", () => {
    expect(() => requireParam(request({}, {}), "businessId")).toThrow(HttpError);
  });
});
