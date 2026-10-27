import { describe, expect, it } from "vitest";
import { createSaleSchema } from "../../src/validators/salesValidator.js";
import { createProductSchema } from "../../src/validators/productValidator.js";
import { createCustomerSchema } from "../../src/validators/customerValidator.js";

describe("createSaleSchema", () => {
  const validItem = {
    productServiceId: "11111111-1111-4111-8111-111111111111",
    quantity: "2",
  };

  it("accepts a minimal cash sale", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CASH",
      items: [validItem],
      paymentMethod: "CASH",
    });
    expect(result.success).toBe(true);
  });

  it("defaults discounts and tax", () => {
    const result = createSaleSchema.parse({
      saleType: "CASH",
      items: [validItem],
      paymentMethod: "CASH",
    });
    expect(result.discountAmount).toBe("0.00");
    expect(result.taxAmount).toBe("0.00");
    expect(result.items[0].discountAmount).toBe("0.00");
  });

  it("requires a customer for credit sales", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CREDIT",
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it("requires a payment method for cash sales", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CASH",
      items: [validItem],
    });
    expect(result.success).toBe(false);
  });

  it("requires a payment method for an initial credit payment", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CREDIT",
      customerId: "22222222-2222-4222-8222-222222222222",
      items: [validItem],
      initialPaymentAmount: "5.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero and negative quantities", () => {
    for (const quantity of ["0", "0.000", "-1"]) {
      const result = createSaleSchema.safeParse({
        saleType: "CASH",
        items: [{ ...validItem, quantity }],
        paymentMethod: "CASH",
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects unknown fields", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CASH",
      items: [validItem],
      paymentMethod: "CASH",
      totalAmount: "999.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty item list", () => {
    const result = createSaleSchema.safeParse({
      saleType: "CASH",
      items: [],
      paymentMethod: "CASH",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 100 items", () => {
    const items = Array.from({ length: 101 }, () => validItem);
    const result = createSaleSchema.safeParse({
      saleType: "CASH",
      items,
      paymentMethod: "CASH",
    });
    expect(result.success).toBe(false);
  });
});

describe("createProductSchema", () => {
  it("accepts a minimal product", () => {
    const result = createProductSchema.safeParse({
      name: "Coffee",
      type: "PRODUCT",
      price: "12.50",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = createProductSchema.safeParse({
      name: "Coffee",
      type: "PRODUCT",
      price: "-1.00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many decimal places", () => {
    const result = createProductSchema.safeParse({
      name: "Coffee",
      type: "PRODUCT",
      price: "12.505",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = createProductSchema.safeParse({
      name: "   ",
      type: "PRODUCT",
      price: "1.00",
    });
    expect(result.success).toBe(false);
  });
});

describe("createCustomerSchema", () => {
  it("accepts a minimal customer", () => {
    const result = createCustomerSchema.safeParse({ name: "Abebe Kebede" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createCustomerSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(
      createCustomerSchema.safeParse({ name: "x".repeat(151) }).success
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      createCustomerSchema.safeParse({ name: "A", email: "not-an-email" })
        .success
    ).toBe(false);
  });
});
