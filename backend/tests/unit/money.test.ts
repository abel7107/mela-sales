import { describe, expect, it } from "vitest";
import {
  assertMoneyRange,
  centsToMoney,
  extendPrice,
  moneyToCents,
  quantityToThousandths,
} from "../../src/utils/money.js";
import { HttpError } from "../../src/middleware/errorMiddleware.js";

describe("moneyToCents", () => {
  it("converts whole amounts", () => {
    expect(moneyToCents("10")).toBe(1000n);
    expect(moneyToCents("0")).toBe(0n);
  });

  it("converts decimal amounts", () => {
    expect(moneyToCents("10.5")).toBe(1050n);
    expect(moneyToCents("10.05")).toBe(1005n);
    expect(moneyToCents("0.01")).toBe(1n);
  });

  it("pads a single decimal digit", () => {
    expect(moneyToCents("12.3")).toBe(1230n);
  });

  it("rejects invalid input", () => {
    expect(() => moneyToCents("")).toThrow(HttpError);
    expect(() => moneyToCents("-1")).toThrow(HttpError);
    expect(() => moneyToCents("1.234")).toThrow(HttpError);
    expect(() => moneyToCents("abc")).toThrow(HttpError);
  });
});

describe("centsToMoney", () => {
  it("renders two decimal places", () => {
    expect(centsToMoney(0n)).toBe("0.00");
    expect(centsToMoney(5n)).toBe("0.05");
    expect(centsToMoney(1050n)).toBe("10.50");
    expect(centsToMoney(100n)).toBe("1.00");
  });

  it("round-trips with moneyToCents", () => {
    for (const value of ["0.00", "0.99", "12.34", "9999999999.99"]) {
      expect(centsToMoney(moneyToCents(value))).toBe(value);
    }
  });

  it("renders negative amounts", () => {
    expect(centsToMoney(-105n)).toBe("-1.05");
  });
});

describe("quantityToThousandths", () => {
  it("converts quantities", () => {
    expect(quantityToThousandths("1")).toBe(1000n);
    expect(quantityToThousandths("2.5")).toBe(2500n);
    expect(quantityToThousandths("0.125")).toBe(125n);
  });

  it("rejects invalid input", () => {
    expect(() => quantityToThousandths("0.1234")).toThrow(HttpError);
    expect(() => quantityToThousandths("-2")).toThrow(HttpError);
  });
});

describe("extendPrice", () => {
  it("multiplies and rounds to the nearest cent", () => {
    // 10.00 * 3 = 30.00
    expect(extendPrice(1000n, 3000n)).toBe(3000n);
    // 0.05 * 1 = 0.05
    expect(extendPrice(5n, 1000n)).toBe(5n);
    // 0.10 * 0.333 = 0.0333 -> 0.03
    expect(extendPrice(10n, 333n)).toBe(3n);
    // 19.99 * 1.5 = 29.985 -> 29.99 (round half up)
    expect(extendPrice(1999n, 1500n)).toBe(2999n);
    // 10.005 * 1 -> unit prices only have 2dp, so not reachable in practice
    expect(extendPrice(1n, 1n)).toBe(0n); // 0.01 * 0.001 = 0.00001 -> 0
  });

  it("never introduces floating point error", () => {
    // 0.10 * 3 should be exactly 0.30, not 0.30000000000000004
    expect(extendPrice(10n, 3000n)).toBe(30n);
  });
});

describe("assertMoneyRange", () => {
  it("accepts values inside the range", () => {
    expect(() => assertMoneyRange(0n)).not.toThrow();
    expect(() => assertMoneyRange(999999999999n)).not.toThrow();
  });

  it("rejects values outside the range", () => {
    expect(() => assertMoneyRange(-1n)).toThrow(HttpError);
    expect(() => assertMoneyRange(1000000000000n)).toThrow(HttpError);
  });
});
