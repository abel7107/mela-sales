import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  getInvoicePrintHtml,
  getSale,
  recordPayment,
  voidSale,
} from '../api/endpoints'
import { PAYMENT_METHODS } from '../api/types'
import type { PaymentMethod, Sale } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useQuery } from '../lib/hooks'
import { formatDateTime, formatMoney, normalizeMoney, toCents } from '../lib/money'
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  TableWrap,
  Td,
  Textarea,
  Th,
} from '../components/ui'

function statusTone(status: string) {
  if (status === 'PAID') return 'green' as const
  if (status === 'OPEN') return 'amber' as const
  return 'rose' as const
}

export function SaleDetailPage() {
  const { saleId = '' } = useParams()
  const { business, isOwner } = useAuth()
  const navigate = useNavigate()
  const businessId = business?.id ?? ''

  const { data: sale, error, loading, reload } = useQuery<Sale>(
    (signal) => getSale(businessId, saleId, { signal }),
    [businessId, saleId],
  )

  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [payError, setPayError] = useState<ApiError | null>(null)
  const [payBusy, setPayBusy] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState<ApiError | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)

  const [printBusy, setPrintBusy] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  if (!business) return null
  const currency = business.currency
  if (loading && !sale) return <LoadingBlock label="Loading sale…" />
  if (error && !sale) return <ErrorBanner error={error} onRetry={reload} />
  if (!sale) return null

  const openPayment = () => {
    setPayAmount(sale.balanceDue)
    setPayMethod('CASH')
    setPayReference('')
    setPayNotes('')
    setPayError(null)
    setPayOpen(true)
  }

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setPayError(null)
    const amount = normalizeMoney(payAmount)
    if (!amount || toCents(amount) <= 0) {
      setPayError(new ApiError(400, 'Enter an amount greater than zero.'))
      return
    }
    if (toCents(amount) > toCents(sale.balanceDue)) {
      setPayError(
        new ApiError(400, 'Amount cannot exceed the remaining balance.'),
      )
      return
    }
    setPayBusy(true)
    try {
      await recordPayment(
        business.id,
        sale.id,
        {
          amount,
          method: payMethod,
          reference: payReference.trim() || null,
          notes: payNotes.trim() || null,
        },
        crypto.randomUUID(),
      )
      setPayOpen(false)
      reload()
    } catch (err) {
      setPayError(
        err instanceof ApiError ? err : new ApiError(0, 'Payment failed.'),
      )
    } finally {
      setPayBusy(false)
    }
  }

  const submitVoid = async (e: React.FormEvent) => {
    e.preventDefault()
    setVoidError(null)
    const reason = voidReason.trim()
    if (reason.length < 3) {
      setVoidError(new ApiError(400, 'Reason must be at least 3 characters.'))
      return
    }
    setVoidBusy(true)
    try {
      await voidSale(business.id, sale.id, reason)
      setVoidOpen(false)
      reload()
    } catch (err) {
      setVoidError(
        err instanceof ApiError ? err : new ApiError(0, 'Void failed.'),
      )
    } finally {
      setVoidBusy(false)
    }
  }

  const openPrint = async () => {
    setPrintBusy(true)
    setPrintError(null)
    try {
      const html = await getInvoicePrintHtml(business.id, sale.id)
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setPrintError(
        err instanceof ApiError ? err.message : 'Could not load the invoice.',
      )
    } finally {
      setPrintBusy(false)
    }
  }

  const canPay = sale.status === 'OPEN'
  const canVoid = isOwner && sale.status !== 'VOID'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate('/sales')}>
            ← Sales
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">
                {sale.invoice?.invoiceNumber ?? 'Sale'}
              </h1>
              <Badge tone={statusTone(sale.status)}>{sale.status}</Badge>
              <Badge tone={sale.saleType === 'CASH' ? 'sky' : 'amber'}>
                {sale.saleType}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              {formatDateTime(sale.createdAt)}
              {sale.customerName ? ` · ${sale.customerName}` : ' · Walk-in'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={printBusy} onClick={openPrint}>
            Print invoice
          </Button>
          {canPay && <Button onClick={openPayment}>Record payment</Button>}
          {canVoid && (
            <Button variant="danger" onClick={() => setVoidOpen(true)}>
              Void sale
            </Button>
          )}
        </div>
      </div>

      {printError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {printError}
        </div>
      )}

      {sale.status === 'VOID' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p className="font-semibold">This sale was voided</p>
          <p className="mt-0.5">
            {sale.voidReason ?? 'No reason recorded.'}
            {sale.voidedAt ? ` · ${formatDateTime(sale.voidedAt)}` : ''}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Items</h2>
            </div>
            <TableWrap>
              <thead>
                <tr className="bg-slate-50">
                  <Th>Product</Th>
                  <Th>SKU</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Discount</Th>
                  <Th className="text-right">Line total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(sale.items ?? []).map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50">
                    <Td className="font-medium">{line.name}</Td>
                    <Td className="text-slate-500">{line.sku ?? '—'}</Td>
                    <Td className="text-right">{line.quantity}</Td>
                    <Td className="text-right">
                      {formatMoney(line.unitPrice, currency)}
                    </Td>
                    <Td className="text-right">
                      {formatMoney(line.discountAmount, currency)}
                    </Td>
                    <Td className="text-right font-medium">
                      {formatMoney(line.lineTotal, currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Payments ({(sale.payments ?? []).length})
              </h2>
            </div>
            {(sale.payments ?? []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No payments recorded yet.
              </p>
            ) : (
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Date</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th>Notes</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(sale.payments ?? []).map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td>{formatDateTime(p.receivedAt)}</Td>
                      <Td>
                        <Badge tone="sky">{p.method.replace('_', ' ')}</Badge>
                      </Td>
                      <Td className="text-slate-500">{p.reference ?? '—'}</Td>
                      <Td className="max-w-40 truncate text-slate-500">
                        {p.notes ?? '—'}
                      </Td>
                      <Td className="text-right font-medium">
                        {formatMoney(p.amount, currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>

          {sale.notes && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {sale.notes}
              </p>
            </Card>
          )}
        </div>

        <Card className="h-fit space-y-3 p-4">
          <div className="space-y-2 text-sm">
            <SummaryRow label="Subtotal" value={formatMoney(sale.subtotal, currency)} />
            <SummaryRow
              label="Discount"
              value={`− ${formatMoney(sale.discountAmount, currency)}`}
            />
            <SummaryRow
              label="Tax"
              value={`+ ${formatMoney(sale.taxAmount, currency)}`}
            />
            <div className="border-t border-slate-200 pt-2">
              <SummaryRow
                label="Total"
                value={formatMoney(sale.totalAmount, currency)}
                strong
              />
            </div>
            <SummaryRow
              label="Paid"
              value={formatMoney(sale.amountPaid, currency)}
            />
            <SummaryRow
              label="Balance due"
              value={formatMoney(sale.balanceDue, currency)}
              strong
              tone={sale.balanceDue !== '0.00' ? 'text-rose-600' : undefined}
            />
          </div>
          <div className="border-t border-slate-200 pt-3 text-xs text-slate-500">
            <p>
              Invoice:{' '}
              {sale.invoice?.invoiceNumber ? (
                <span className="font-medium text-slate-700">
                  {sale.invoice.invoiceNumber}
                </span>
              ) : (
                '—'
              )}
            </p>
            <p className="mt-1">
              Created by membership{' '}
              <span className="font-mono">{sale.createdByMembershipId.slice(0, 8)}…</span>
            </p>
            <p className="mt-2">
              <Link
                to="/sales"
                className="font-medium text-indigo-600 hover:text-indigo-500"
              >
                Back to sales list
              </Link>
            </p>
          </div>
        </Card>
      </div>

      {/* Payment modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
      >
        <form onSubmit={submitPayment} className="space-y-4">
          <p className="text-sm text-slate-600">
            Remaining balance:{' '}
            <span className="font-semibold text-slate-900">
              {formatMoney(sale.balanceDue, currency)}
            </span>
          </p>
          <Field label="Amount">
            <Input
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
          </Field>
          <Field label="Method">
            <Select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference (optional)">
            <Input
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="MP123"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              rows={2}
            />
          </Field>
          {payError && (
            <p className="text-sm font-medium text-rose-600">
              {payError.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPayOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" busy={payBusy}>
              Record payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Void modal */}
      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void sale"
      >
        <form onSubmit={submitVoid} className="space-y-4">
          <p className="text-sm text-slate-600">
            Voiding excludes this sale from reports and blocks further
            payments. This cannot be undone.
          </p>
          <Field label="Reason (min 3 characters)">
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Customer cancelled the order"
            />
          </Field>
          {voidError && (
            <p className="text-sm font-medium text-rose-600">
              {voidError.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setVoidOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" busy={voidBusy}>
              Void sale
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: string
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? 'font-semibold text-slate-900' : 'text-slate-600'
      } ${tone ?? ''}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
