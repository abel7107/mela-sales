import type { RowDataPacket } from "mysql2";
import type { SaleDetail } from "../services/saleService.js";

export interface InvoiceBusiness extends RowDataPacket {
  id: string;
  name: string;
  currency: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return "";

  return `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

/**
 * Renders a self-contained, printable invoice document.
 * No external assets are referenced so it works offline and when shared.
 */
export function renderInvoiceHtml(
  business: InvoiceBusiness,
  sale: SaleDetail
): string {
  const invoiceNumber = sale.invoice?.invoiceNumber ?? "INV";
  const statusClass = sale.status.toLowerCase();

  const lineRows = sale.items
    .map(
      (item) => `
      <tr>
        <td class="left">${escapeHtml(item.name)}${
          item.sku
            ? `<div class="muted">${escapeHtml(item.sku)}</div>`
            : ""
        }</td>
        <td class="center">${escapeHtml(item.quantity)}</td>
        <td class="right">${escapeHtml(item.unitPrice)}</td>
        <td class="right">${escapeHtml(item.discountAmount)}</td>
        <td class="right">${escapeHtml(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const paymentRows = sale.payments
    .map(
      (payment) => `
      <tr>
        <td class="left">${escapeHtml(formatDate(payment.receivedAt))}</td>
        <td class="left">${escapeHtml(
          payment.method.replaceAll("_", " ")
        )}</td>
        <td class="left">${escapeHtml(payment.reference ?? "—")}</td>
        <td class="right">${escapeHtml(payment.amount)}</td>
      </tr>`
    )
    .join("");

  const outstanding =
    sale.status === "VOID"
      ? "0.00"
      : sale.balanceDue.startsWith("-")
        ? "0.00"
        : sale.balanceDue;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(invoiceNumber)} · ${escapeHtml(business.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem 1rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
    background: #f3f4f6;
  }
  .sheet {
    max-width: 800px;
    margin: 0 auto;
    background: #fff;
    padding: 2.5rem;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,.1);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    border-bottom: 2px solid #111827;
    padding-bottom: 1.25rem;
    margin-bottom: 1.5rem;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .35rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  .muted { color: #6b7280; font-size: .85rem; }
  .badge {
    display: inline-block;
    padding: .2rem .6rem;
    border-radius: 999px;
    font-size: .75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .badge.paid { background: #d1fae5; color: #065f46; }
  .badge.open { background: #fef3c7; color: #92400e; }
  .badge.void { background: #fee2e2; color: #991b1b; }
  .grid { display: flex; flex-wrap: wrap; gap: 2rem; margin-bottom: 1.75rem; }
  .block { flex: 1 1 240px; }
  .meta-row { display: flex; gap: .75rem; font-size: .9rem; margin-bottom: .25rem; }
  .meta-label { color: #6b7280; min-width: 92px; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; margin-bottom: 1.5rem; }
  th, td { padding: .6rem .5rem; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; text-align: left; font-weight: 600; }
  .right { text-align: right; }
  .center { text-align: center; }
  .left { text-align: left; }
  .totals { display: flex; justify-content: flex-end; }
  .totals table { width: auto; min-width: 300px; margin-left: auto; }
  .totals tr:last-child td { border-bottom: none; font-weight: 700; font-size: 1rem; }
  .section-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin: 1.5rem 0 .5rem; }
  footer { margin-top: 2rem; font-size: .8rem; color: #6b7280; text-align: center; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; max-width: none; padding: 0; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div>
        <h1>${escapeHtml(business.name)}</h1>
        <div class="muted">${escapeHtml(business.address ?? "")}</div>
        <div class="muted">${escapeHtml(business.phone ?? "")}${
          business.phone && business.email ? " · " : ""
        }${escapeHtml(business.email ?? "")}</div>
      </div>
      <div style="text-align:right">
        <h2>INVOICE</h2>
        <div style="font-size:1.1rem;font-weight:700">${escapeHtml(invoiceNumber)}</div>
        <div class="muted">${escapeHtml(formatDate(sale.invoice?.issuedAt ?? sale.createdAt))}</div>
        <div style="margin-top:.5rem">
          <span class="badge ${statusClass}">${escapeHtml(sale.status)}</span>
        </div>
      </div>
    </header>

    <div class="grid">
      <div class="block">
        <div class="section-title">Bill to</div>
        ${
          sale.customerName
            ? `<div style="font-weight:600">${escapeHtml(sale.customerName)}</div>`
            : `<div class="muted">Walk-in customer</div>`
        }
        ${row("Sale type", sale.saleType === "CREDIT" ? "Credit" : "Cash")}
        ${row("Sale date", formatDate(sale.createdAt))}
        ${row("Notes", sale.notes)}
      </div>
      <div class="block">
        <div class="section-title">Summary</div>
        ${row("Subtotal", sale.subtotal)}
        ${row("Discount", sale.discountAmount)}
        ${row("Tax", sale.taxAmount)}
        ${row("Total", sale.totalAmount)}
        ${row("Paid", sale.amountPaid)}
        ${row("Balance due", outstanding)}
      </div>
    </div>

    <div class="section-title">Items</div>
    <table>
      <thead>
        <tr>
          <th class="left">Item</th>
          <th class="center">Qty</th>
          <th class="right">Unit price</th>
          <th class="right">Discount</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    ${
      paymentRows
        ? `<div class="section-title">Payments received</div>
    <table>
      <thead>
        <tr>
          <th class="left">Date</th>
          <th class="left">Method</th>
          <th class="left">Reference</th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>${paymentRows}</tbody>
    </table>`
        : ""
    }

    ${
      sale.status === "VOID"
        ? `<p style="color:#991b1b"><strong>This invoice has been voided.</strong> ${escapeHtml(
            sale.voidReason ?? ""
          )}</p>`
        : ""
    }

    <footer>
      ${escapeHtml(business.name)} · Invoice ${escapeHtml(invoiceNumber)} ·
      Generated ${escapeHtml(formatDate(new Date()))}
    </footer>
  </div>
</body>
</html>`;
}
