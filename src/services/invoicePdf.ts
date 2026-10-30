import PDFDocument from 'pdfkit';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { Lang, t } from '../lib/i18n';
import { formatMoney, fromDb } from '../lib/money';
import { storage } from '../lib/storage';

export async function loadInvoice(where: { id: string; businessId?: string }) {
  return prisma.invoice.findFirst({
    where,
    include: {
      business: true,
      sale: { include: { items: true, customer: true, payments: { orderBy: { receivedAt: 'asc' } } } },
    },
  });
}
type InvoiceData = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;

export async function renderInvoicePdf(inv: InvoiceData, lang: Lang): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  // Amharic needs a font with Ethiopic glyphs (see README); default Helvetica covers English.
  if (env.INVOICE_FONT_PATH) doc.font(env.INVOICE_FONT_PATH);

  const { business: b, sale: s } = inv;
  const cur = b.currency;
  const L = (k: string) => t(lang, `invoice.${k}`);
  const left = 48;
  const right = doc.page.width - 48;

  if (b.logoFile) {
    try { doc.image(await storage.read(b.logoFile), left, 48, { fit: [80, 60] }); } catch { /* missing logo is not fatal */ }
  }
  doc.fontSize(18).text(b.name, left + 95, 48, { width: 260 });
  doc.fontSize(9).fillColor('#444');
  [b.address, b.phone, b.email, b.tin ? `TIN: ${b.tin}` : null].filter(Boolean).forEach((x) => doc.text(String(x), left + 95, doc.y, { width: 260 }));
  doc.fillColor('#000').fontSize(20).text(L('title'), 360, 48, { width: right - 360, align: 'right' });
  doc.fontSize(10)
    .text(`${L('number')} ${inv.number}`, 360, 76, { width: right - 360, align: 'right' })
    .text(`${L('date')}: ${inv.issuedAt.toISOString().slice(0, 10)}`, 360, doc.y, { width: right - 360, align: 'right' });
  if (s.dueDate) doc.text(`${L('due')}: ${s.dueDate.toISOString().slice(0, 10)}`, 360, doc.y, { width: right - 360, align: 'right' });
  if (s.status === 'VOIDED') doc.fillColor('#b00020').fontSize(16).text(L('voided'), 360, doc.y + 4, { width: right - 360, align: 'right' }).fillColor('#000');

  let y = Math.max(doc.y, 140) + 16;
  doc.fontSize(10).text(L('billTo'), left, y);
  doc.fontSize(11).text(s.customer?.name ?? L('walkIn'), left, doc.y);
  if (s.customer?.phone) doc.fontSize(9).text(s.customer.phone, left, doc.y);
  y = doc.y + 18;

  const cols = { item: left, qty: 270, price: 320, disc: 390, tax: 450, amt: 495 };
  doc.fontSize(9).fillColor('#555');
  doc.text(L('item'), cols.item, y, { width: 215 });
  doc.text(L('qty'), cols.qty, y, { width: 45, align: 'right' });
  doc.text(L('price'), cols.price, y, { width: 65, align: 'right' });
  doc.text(L('discount'), cols.disc, y, { width: 55, align: 'right' });
  doc.text(L('tax'), cols.tax, y, { width: 40, align: 'right' });
  doc.text(L('amount'), cols.amt, y, { width: right - cols.amt, align: 'right' });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').stroke();
  y += 6;
  doc.fillColor('#000').fontSize(10);
  for (const i of s.items) {
    if (y > 740) { doc.addPage(); y = 60; }
    const h = doc.heightOfString(i.name, { width: 215 });
    doc.text(i.name, cols.item, y, { width: 215 });
    doc.text(i.quantity.toString().replace(/\.?0+$/, ''), cols.qty, y, { width: 45, align: 'right' });
    doc.text(formatMoney(fromDb(i.unitPrice)), cols.price, y, { width: 65, align: 'right' });
    doc.text(formatMoney(fromDb(i.discount)), cols.disc, y, { width: 55, align: 'right' });
    doc.text(formatMoney(fromDb(i.taxAmount)), cols.tax, y, { width: 40, align: 'right' });
    doc.text(formatMoney(fromDb(i.lineTotal)), cols.amt, y, { width: right - cols.amt, align: 'right' });
    y += Math.max(h, 12) + 6;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').stroke();
  y += 10;

  const row = (label: string, v: string, bold = false) => {
    doc.fontSize(bold ? 12 : 10).text(label, 330, y, { width: 100 }).text(`${v} ${cur}`, 430, y, { width: right - 430, align: 'right' });
    y += bold ? 20 : 16;
  };
  row(L('subtotal'), formatMoney(fromDb(s.subtotal)));
  row(L('totalDiscount'), formatMoney(fromDb(s.discountTotal)));
  row(L('totalTax'), formatMoney(fromDb(s.taxTotal)));
  row(L('total'), formatMoney(fromDb(s.total)), true);
  row(L('paid'), formatMoney(fromDb(s.amountPaid)));
  row(L('balance'), formatMoney(fromDb(s.total).minus(fromDb(s.amountPaid))), true);
  doc.end();
  return done;
}
