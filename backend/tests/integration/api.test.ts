import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

import { startAuthServer, type AuthTestServer } from "../helpers/authServer.js";
import { cleanupBusiness, closePool } from "../helpers/db.js";

// Environment must be configured before the app (and its DB pool) is imported.
const OWNER_USER = "test-user-owner";
const CASHIER_USER = "test-user-cashier";
const OUTSIDER_USER = "test-user-outsider";

let auth: AuthTestServer;
let app: Express;
let server: ReturnType<Express["listen"]>;
let baseUrl: string;

const createdBusinessIds: string[] = [];

async function mintAll(): Promise<Record<string, string>> {
  return {
    owner: await auth.mintToken(OWNER_USER),
    cashier: await auth.mintToken(CASHIER_USER),
    outsider: await auth.mintToken(OUTSIDER_USER),
  };
}

let tokens: Record<string, string>;

function authed(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function api(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; json: any; text: string }> {
  const headers: Record<string, string> = {
    ...(options.token ? authed(options.token) : {}),
    ...(options.headers ?? {}),
  };

  let body: string | undefined;

  if (options.rawBody !== undefined) {
    body = options.rawBody;
    headers["Content-Type"] = "application/json";
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });

  const text = await response.text();

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

beforeAll(async () => {
  auth = await startAuthServer();

  process.env.MELA_AUTH_ISSUER = auth.issuer;
  process.env.MELA_AUTH_AUDIENCE = auth.audience;
  process.env.MELA_AUTH_JWKS_URL = auth.jwksUrl;
  process.env.NODE_ENV = "test";

  ({ default: app } = await import("../../src/server.js"));

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });

  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  tokens = await mintAll();
});

afterAll(async () => {
  for (const businessId of createdBusinessIds) {
    await cleanupBusiness(businessId);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await auth.close();
  await closePool();
});

describe("health", () => {
  it("responds on /health", async () => {
    const res = await api("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.json.status).toBe("ok");
  });

  it("responds on /health/db", async () => {
    const res = await api("GET", "/health/db");
    expect(res.status).toBe(200);
    expect(res.json.database).toBe("connected");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await api("GET", "/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.json.status).toBe("error");
    expect(res.json.requestId).toBeTruthy();
  });

  it("sets an X-Request-Id header", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("echoes a well-formed client X-Request-Id", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { "X-Request-Id": "trace-abc-123" },
    });
    expect(response.headers.get("x-request-id")).toBe("trace-abc-123");
  });

  it("replaces an unsafe client X-Request-Id", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { "X-Request-Id": "bad id with spaces" },
    });
    expect(response.headers.get("x-request-id")).not.toBe(
      "bad id with spaces"
    );
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});

describe("authentication", () => {
  it("rejects a missing token", async () => {
    const res = await api("GET", "/api/v1/businesses");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await api("GET", "/api/v1/businesses", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a token signed by the wrong key", async () => {
    const other = await startAuthServer();
    try {
      const token = await other.mintToken(OWNER_USER);
      const res = await api("GET", "/api/v1/businesses", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
    } finally {
      await other.close();
    }
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await api("POST", "/api/v1/businesses", {
      token: tokens.owner,
      rawBody: "{ not json",
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/valid JSON/i);
  });
});

describe("end-to-end sales workflow", () => {
  let businessId: string;
  let productId: string;
  let customerId: string;
  let saleId: string;
  let invoiceNumber: string;

  it("creates a business with the creator as OWNER", async () => {
    const res = await api("POST", "/api/v1/businesses", {
      token: tokens.owner,
      body: { name: "Test Cafe", currency: "ETB", phone: "+251911000001" },
    });

    expect(res.status).toBe(201);
    expect(res.json.data.name).toBe("Test Cafe");
    expect(res.json.data.currency).toBe("ETB");
    expect(res.json.data.membership.role).toBe("OWNER");

    businessId = res.json.data.id;
    createdBusinessIds.push(businessId);
  });

  it("grants the cashier an early membership", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/members`,
      {
        token: tokens.owner,
        body: { authUserId: CASHIER_USER, role: "CASHIER" },
      }
    );
    expect(res.status).toBe(201);
  });

  it("lists the caller's businesses", async () => {
    const res = await api("GET", "/api/v1/businesses", {
      token: tokens.owner,
    });

    expect(res.status).toBe(200);
    const found = res.json.data.find((b: any) => b.id === businessId);
    expect(found).toBeTruthy();
    expect(found.membership.role).toBe("OWNER");
  });

  it("hides the business from non-members", async () => {
    const res = await api("GET", `/api/v1/businesses/${businessId}`, {
      token: tokens.outsider,
    });
    expect(res.status).toBe(403);
  });

  it("updates the business profile", async () => {
    const res = await api("PATCH", `/api/v1/businesses/${businessId}`, {
      token: tokens.owner,
      body: { name: "Test Cafe Updated", address: "Addis Ababa" },
    });

    expect(res.status).toBe(200);
    expect(res.json.data.name).toBe("Test Cafe Updated");
    expect(res.json.data.address).toBe("Addis Ababa");
  });

  it("rejects an empty business update", async () => {
    const res = await api("PATCH", `/api/v1/businesses/${businessId}`, {
      token: tokens.owner,
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it("creates a product as OWNER", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/products-services`,
      {
        token: tokens.owner,
        body: {
          name: "Macchiato",
          type: "PRODUCT",
          price: "45.00",
          sku: "MCH-1",
        },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.price).toBe("45.00");
    // Products use the same camelCase envelope as every other resource.
    expect(res.json.data).toMatchObject({
      businessId,
      name: "Macchiato",
      sku: "MCH-1",
      type: "PRODUCT",
      isActive: true,
    });
    expect(res.json.data).not.toHaveProperty("business_id");
    productId = res.json.data.id;
  });

  it("rejects a duplicate SKU", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/products-services`,
      {
        token: tokens.owner,
        body: { name: "Other", type: "PRODUCT", price: "10.00", sku: "MCH-1" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("lists products with pagination metadata", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/products-services`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    expect(res.json.data).toHaveLength(1);
    expect(res.json.pagination.total).toBe(1);
    expect(res.json.pagination.page).toBe(1);
  });

  it("searches products by name", async () => {
    const hit = await api(
      "GET",
      `/api/v1/businesses/${businessId}/products-services?q=macchi`,
      { token: tokens.owner }
    );
    expect(hit.json.data).toHaveLength(1);

    const miss = await api(
      "GET",
      `/api/v1/businesses/${businessId}/products-services?q=zzzz`,
      { token: tokens.owner }
    );
    expect(miss.json.data).toHaveLength(0);
  });

  it("fetches a single product", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/products-services/${productId}`,
      { token: tokens.owner }
    );
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(productId);
  });

  it("creates a customer", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/customers`,
      {
        token: tokens.cashier,
        body: { name: "Abebe Kebede", phone: "+251911222333" },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.name).toBe("Abebe Kebede");
    customerId = res.json.data.id;
  });

  it("rejects a credit sale without a customer", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales`,
      {
        token: tokens.cashier,
        body: {
          saleType: "CREDIT",
          items: [{ productServiceId: productId, quantity: "2" }],
        },
      }
    );
    expect(res.status).toBe(400);
  });

  it("prices sales from the database, not the client", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales`,
      {
        token: tokens.cashier,
        body: {
          saleType: "CASH",
          paymentMethod: "CASH",
          items: [{ productServiceId: productId, quantity: "2" }],
        },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.totalAmount).toBe("90.00");
    expect(res.json.data.items[0].unitPrice).toBe("45.00");
    expect(res.json.data.status).toBe("PAID");
  });

  it("rejects unknown item fields", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales`,
      {
        token: tokens.cashier,
        body: {
          saleType: "CASH",
          paymentMethod: "CASH",
          items: [
            { productServiceId: productId, quantity: "1", unitPrice: "0.01" },
          ],
        },
      }
    );
    expect(res.status).toBe(400);
  });

  it("creates a credit sale with an initial payment", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales`,
      {
        token: tokens.cashier,
        body: {
          saleType: "CREDIT",
          customerId,
          items: [{ productServiceId: productId, quantity: "3" }],
          taxAmount: "13.50",
          initialPaymentAmount: "50.00",
          paymentMethod: "CASH",
          notes: "Wedding order",
        },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.status).toBe("OPEN");
    // 45 * 3 = 135, + 13.50 tax = 148.50; paid 50 => balance 98.50
    expect(res.json.data.totalAmount).toBe("148.50");
    expect(res.json.data.amountPaid).toBe("50.00");
    expect(res.json.data.balanceDue).toBe("98.50");
    expect(res.json.data.invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(res.json.data.items).toHaveLength(1);

    saleId = res.json.data.id;
    invoiceNumber = res.json.data.invoice.invoiceNumber;
  });

  it("does not leak sales of a business the caller cannot access", async () => {
    const res = await api(
      "GET",
      "/api/v1/businesses/00000000-0000-4000-8000-000000000000/sales/00000000-0000-4000-8000-000000000000",
      { token: tokens.owner }
    );
    expect(res.status).toBe(403);
  });

  it("lists sales with filters", async () => {
    const all = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales`,
      { token: tokens.owner }
    );
    expect(all.status).toBe(200);
    expect(all.json.pagination.total).toBeGreaterThanOrEqual(2);

    const open = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales?status=OPEN`,
      { token: tokens.owner }
    );
    expect(open.json.data.every((s: any) => s.status === "OPEN")).toBe(true);

    const credit = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales?saleType=CREDIT`,
      { token: tokens.owner }
    );
    expect(credit.json.data.every((s: any) => s.saleType === "CREDIT")).toBe(
      true
    );

    const byCustomer = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales?customerId=${customerId}`,
      { token: tokens.owner }
    );
    expect(byCustomer.json.data).toHaveLength(1);
    expect(byCustomer.json.data[0].id).toBe(saleId);

    const byInvoice = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales?invoice=${invoiceNumber}`,
      { token: tokens.owner }
    );
    expect(byInvoice.json.data).toHaveLength(1);
  });

  it("rejects an invalid filter value", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales?status=BOGUS`,
      { token: tokens.owner }
    );
    expect(res.status).toBe(400);
  });

  it("fetches a single sale with lines and payments", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales/${saleId}`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(saleId);
    expect(res.json.data.customerName).toBe("Abebe Kebede");
    expect(res.json.data.items).toHaveLength(1);
    expect(res.json.data.payments).toHaveLength(1);
    expect(res.json.data.invoice.invoiceNumber).toBe(invoiceNumber);
  });

  it("rejects a payment larger than the balance", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "98.51", method: "CASH" },
      }
    );
    expect(res.status).toBe(400);
    expect(res.json.message).toMatch(/exceeds the remaining balance/i);
  });

  it("rejects a zero payment", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "0.00", method: "CASH" },
      }
    );
    expect(res.status).toBe(400);
  });

  it("records a partial payment", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "48.50", method: "MOBILE_MONEY", reference: "MP123" },
        headers: { "Idempotency-Key": "pay-key-1" },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.sale.status).toBe("OPEN");
    expect(res.json.data.sale.balanceDue).toBe("50.00");
    expect(res.json.data.sale.payments).toHaveLength(2);
  });

  it("rejects a reused idempotency key", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "10.00", method: "CASH" },
        headers: { "Idempotency-Key": "pay-key-1" },
      }
    );
    expect(res.status).toBe(409);
    expect(res.json.message).toMatch(/Idempotency-Key/);
  });

  it("marks the sale PAID when the balance is settled", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "50.00", method: "BANK_TRANSFER" },
      }
    );

    expect(res.status).toBe(201);
    expect(res.json.data.sale.status).toBe("PAID");
    expect(res.json.data.sale.balanceDue).toBe("0.00");
  });

  it("rejects a payment on an already paid sale", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "1.00", method: "CASH" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("returns the invoice as JSON", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales/${saleId}/invoice`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    expect(res.json.data.invoiceNumber).toBe(invoiceNumber);
    expect(res.json.data.business.name).toBe("Test Cafe Updated");
    expect(res.json.data.sale.items).toHaveLength(1);
  });

  it("returns a printable invoice", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/sales/${saleId}/invoice/print`,
      { headers: authed(tokens.owner) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    // The document is self-contained, so inline styles must be permitted.
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);

    const html = await response.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain(invoiceNumber);
    expect(html).toContain("Abebe Kebede");
    expect(html).toContain("Macchiato");
  });

  it("builds a sales summary report", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/reports/sales/summary`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    expect(res.json.data.totals.saleCount).toBeGreaterThanOrEqual(2);
    expect(Number(res.json.data.totals.totalAmount)).toBeGreaterThan(0);
    expect(res.json.data.daily.length).toBeGreaterThanOrEqual(1);
    expect(res.json.data.topProducts[0].name).toBe("Macchiato");
  });

  it("builds a customer balance report", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/reports/customers/balances`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    const row = res.json.data.find((c: any) => c.customerId === customerId);
    expect(row).toBeTruthy();
    expect(Number(row.outstandingBalance)).toBe(0);
  });

  it("builds a payments report", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/reports/payments`,
      { token: tokens.owner }
    );

    expect(res.status).toBe(200);
    expect(res.json.totals.paymentCount).toBeGreaterThanOrEqual(3);
    expect(res.json.pagination.total).toBeGreaterThanOrEqual(3);
  });

  it("lets a CASHIER record a sale but not manage products", async () => {
    const denied = await api(
      "POST",
      `/api/v1/businesses/${businessId}/products-services`,
      {
        token: tokens.cashier,
        body: { name: "Nope", type: "PRODUCT", price: "1.00" },
      }
    );
    expect(denied.status).toBe(403);

    const allowed = await api(
      "POST",
      `/api/v1/businesses/${businessId}/customers`,
      {
        token: tokens.cashier,
        body: { name: "Walk In" },
      }
    );
    expect(allowed.status).toBe(201);
  });

  it("refuses voiding without a reason", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/void`,
      { token: tokens.owner, body: {} }
    );
    expect(res.status).toBe(400);
  });

  it("refuses voiding by a CASHIER", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/void`,
      {
        token: tokens.cashier,
        body: { reason: "Duplicate entry" },
      }
    );
    expect(res.status).toBe(403);
  });

  it("voids a sale as OWNER", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/void`,
      {
        token: tokens.owner,
        body: { reason: "Customer cancelled the order" },
      }
    );

    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("VOID");
    expect(res.json.data.voidReason).toBe("Customer cancelled the order");
  });

  it("refuses to void twice", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/void`,
      {
        token: tokens.owner,
        body: { reason: "Trying again" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("refuses payments on a voided sale", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/sales/${saleId}/payments`,
      {
        token: tokens.cashier,
        body: { amount: "1.00", method: "CASH" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("excludes voided sales from the summary totals", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/reports/sales/summary`,
      { token: tokens.owner }
    );
    expect(res.json.data.totals.voidedCount).toBe(1);
    // Only the cash sale remains non-voided.
    expect(res.json.data.totals.saleCount).toBe(1);
  });

  it("excludes voided sales from the payments report", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/reports/payments`,
      { token: tokens.owner }
    );
    expect(
      res.json.data.every((p: any) => p.saleId !== saleId)
    ).toBe(true);
  });
});

describe("memberships", () => {
  let businessId: string;

  beforeAll(async () => {
    const res = await api("POST", "/api/v1/businesses", {
      token: tokens.owner,
      body: { name: "Membership Test Co" },
    });
    businessId = res.json.data.id;
    createdBusinessIds.push(businessId);
  });

  it("starts with a single OWNER member", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/members`,
      { token: tokens.owner }
    );
    expect(res.status).toBe(200);
    expect(res.json.data).toHaveLength(1);
    expect(res.json.data[0].role).toBe("OWNER");
  });

  it("grants a CASHIER membership", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/members`,
      {
        token: tokens.owner,
        body: { authUserId: CASHIER_USER, role: "CASHIER" },
      }
    );
    expect(res.status).toBe(201);

    const access = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales`,
      { token: tokens.cashier }
    );
    expect(access.status).toBe(200);
  });

  it("rejects a duplicate membership", async () => {
    const res = await api(
      "POST",
      `/api/v1/businesses/${businessId}/members`,
      {
        token: tokens.owner,
        body: { authUserId: CASHIER_USER, role: "CASHIER" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("prevents members from listing other members", async () => {
    const res = await api(
      "GET",
      `/api/v1/businesses/${businessId}/members`,
      { token: tokens.cashier }
    );
    expect(res.status).toBe(403);
  });

  it("deactivates a member", async () => {
    const list = await api(
      "GET",
      `/api/v1/businesses/${businessId}/members`,
      { token: tokens.owner }
    );
    const cashier = list.json.data.find(
      (m: any) => m.authUserId === CASHIER_USER
    );

    const res = await api(
      "PATCH",
      `/api/v1/businesses/${businessId}/members/${cashier.id}`,
      { token: tokens.owner, body: { isActive: false } }
    );
    expect(res.status).toBe(200);
    expect(res.json.data.isActive).toBe(false);

    const access = await api(
      "GET",
      `/api/v1/businesses/${businessId}/sales`,
      { token: tokens.cashier }
    );
    expect(access.status).toBe(403);

    // Restore so later tests are unaffected.
    await api(
      "PATCH",
      `/api/v1/businesses/${businessId}/members/${cashier.id}`,
      { token: tokens.owner, body: { isActive: true } }
    );
  });

  it("prevents an OWNER from deactivating themselves", async () => {
    const list = await api(
      "GET",
      `/api/v1/businesses/${businessId}/members`,
      { token: tokens.owner }
    );
    const owner = list.json.data.find(
      (m: any) => m.authUserId === OWNER_USER
    );

    const res = await api(
      "PATCH",
      `/api/v1/businesses/${businessId}/members/${owner.id}`,
      { token: tokens.owner, body: { isActive: false } }
    );
    expect(res.status).toBe(400);
  });
});
