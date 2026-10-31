import type { RowDataPacket } from "mysql2";
import pool from "../config/database.js";

export interface SaleLine {
  id: string;
  productServiceId: string | null;
  name: string;
  type: "PRODUCT" | "SERVICE";
  sku: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
}

export interface SalePayment {
  id: string;
  amount: string;
  method: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER";
  reference: string | null;
  notes: string | null;
  receivedAt: Date;
  receivedByMembershipId: string;
}

export interface SaleDetail {
  id: string;
  businessId: string;
  customerId: string | null;
  customerName: string | null;
  createdByMembershipId: string;
  saleType: "CASH" | "CREDIT";
  status: "OPEN" | "PAID" | "VOID";
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  notes: string | null;
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  invoice:
    | {
        id: string;
        invoiceNumber: string;
        issuedAt: Date;
      }
    | undefined;
  items: SaleLine[];
  payments: SalePayment[];
}

interface SaleHeaderRow extends RowDataPacket {
  id: string;
  business_id: string;
  customer_id: string | null;
  customer_name: string | null;
  created_by_membership_id: string;
  sale_type: "CASH" | "CREDIT";
  status: "OPEN" | "PAID" | "VOID";
  subtotal: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  notes: string | null;
  void_reason: string | null;
  voided_at: Date | null;
  created_at: Date;
  updated_at: Date;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_issued_at: Date | null;
}

interface LineRow extends RowDataPacket {
  id: string;
  product_service_id: string | null;
  item_name: string;
  item_type: "PRODUCT" | "SERVICE";
  sku_snapshot: string | null;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  line_total: string;
}

interface PaymentRow extends RowDataPacket {
  id: string;
  amount: string;
  method: "CASH" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER";
  reference: string | null;
  notes: string | null;
  received_at: Date;
  received_by_membership_id: string;
}

function subtractMoney(total: string, paid: string): string {
  const toCents = (value: string): bigint => {
    const [whole, fraction = "0"] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  };

  const cents = toCents(total) - toCents(paid);
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;

  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Loads a single sale with its lines, payments and invoice.
 * Returns null when the sale does not exist in this business.
 */
export async function loadSaleDetail(
  businessId: string,
  saleId: string
): Promise<SaleDetail | null> {
  const [headers] = await pool.execute<SaleHeaderRow[]>(
    `SELECT s.id,
            s.business_id,
            s.customer_id,
            c.name AS customer_name,
            s.created_by_membership_id,
            s.sale_type,
            s.status,
            s.subtotal,
            s.discount_amount,
            s.tax_amount,
            s.total_amount,
            s.notes,
            s.void_reason,
            s.voided_at,
            s.created_at,
            s.updated_at,
            i.id AS invoice_id,
            i.invoice_number,
            i.issued_at AS invoice_issued_at,
            (SELECT COALESCE(SUM(p.amount), 0)
             FROM payments p
             WHERE p.business_id = s.business_id
               AND p.sale_id = s.id) AS amount_paid
     FROM sales s
     LEFT JOIN customers c
       ON c.business_id = s.business_id AND c.id = s.customer_id
     LEFT JOIN invoices i
       ON i.business_id = s.business_id AND i.sale_id = s.id
     WHERE s.business_id = ? AND s.id = ?
     LIMIT 1`,
    [businessId, saleId]
  );

  const header = headers[0];

  if (!header) return null;

  const [lineRows] = await pool.execute<LineRow[]>(
    `SELECT id, product_service_id, item_name, item_type, sku_snapshot,
            quantity, unit_price, discount_amount, line_total
     FROM sale_lines
     WHERE business_id = ? AND sale_id = ?
     ORDER BY created_at ASC, id ASC`,
    [businessId, saleId]
  );

  const [paymentRows] = await pool.execute<PaymentRow[]>(
    `SELECT id, amount, method, reference, notes, received_at,
            received_by_membership_id
     FROM payments
     WHERE business_id = ? AND sale_id = ?
     ORDER BY received_at ASC, id ASC`,
    [businessId, saleId]
  );

  return {
    id: header.id,
    businessId: header.business_id,
    customerId: header.customer_id,
    customerName: header.customer_name,
    createdByMembershipId: header.created_by_membership_id,
    saleType: header.sale_type,
    status: header.status,
    subtotal: header.subtotal,
    discountAmount: header.discount_amount,
    taxAmount: header.tax_amount,
    totalAmount: header.total_amount,
    amountPaid: header.amount_paid,
    balanceDue: subtractMoney(header.total_amount, header.amount_paid),
    notes: header.notes,
    voidReason: header.void_reason,
    voidedAt: header.voided_at,
    createdAt: header.created_at,
    updatedAt: header.updated_at,
    invoice: header.invoice_id
      ? {
          id: header.invoice_id,
          invoiceNumber: header.invoice_number!,
          issuedAt: header.invoice_issued_at!,
        }
      : undefined,
    items: lineRows.map((row) => ({
      id: row.id,
      productServiceId: row.product_service_id,
      name: row.item_name,
      type: row.item_type,
      sku: row.sku_snapshot,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      discountAmount: row.discount_amount,
      lineTotal: row.line_total,
    })),
    payments: paymentRows.map((row) => ({
      id: row.id,
      amount: row.amount,
      method: row.method,
      reference: row.reference,
      notes: row.notes,
      receivedAt: row.received_at,
      receivedByMembershipId: row.received_by_membership_id,
    })),
  };
}
