import { useState } from 'react'
import { customerBalances, paymentsReport } from '../api/endpoints'
import type { PaymentMethod } from '../api/types'
import { PAYMENT_METHODS } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useQuery } from '../lib/hooks'
import { daysAgoIso, formatDateTime, formatMoney, todayIso } from '../lib/money'
import { SalesSummaryPanel } from '../components/SalesSummaryPanel'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  LoadingBlock,
  PaginationBar,
  Select,
  TableWrap,
  Td,
  Th,
} from '../components/ui'

type Tab = 'sales' | 'balances' | 'payments'

export function ReportsPage() {
  const { business } = useAuth()
  const [tab, setTab] = useState<Tab>('sales')

  if (!business) return null

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'sales', label: 'Sales summary' },
    { id: 'balances', label: 'Customer balances' },
    { id: 'payments', label: 'Payments' },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Sales, outstanding balances and payment history.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && <SalesSummaryTab />}
      {tab === 'balances' && <BalancesTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  )
}

function SalesSummaryTab() {
  const { business } = useAuth()
  const [from, setFrom] = useState(() => daysAgoIso(29))
  const [to, setTo] = useState(() => todayIso())

  if (!business) return null

  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="!w-auto"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          To
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="!w-auto"
          />
        </label>
        <Button variant="secondary" onClick={() => {
          setFrom(daysAgoIso(29))
          setTo(todayIso())
        }}>
          Last 30 days
        </Button>
      </div>
      <SalesSummaryPanel
        businessId={business.id}
        currency={business.currency}
        from={from}
        to={to}
      />
    </Card>
  )
}

function BalancesTab() {
  const { business } = useAuth()
  const businessId = business?.id ?? ''
  const [onlyWithBalance, setOnlyWithBalance] = useState(true)
  const [page, setPage] = useState(1)

  const { data, error, loading, reload } = useQuery(
    (signal) =>
      customerBalances(
        businessId,
        { only_with_balance: onlyWithBalance, page, limit: 25 },
        { signal },
      ),
    [businessId, onlyWithBalance, page],
  )

  if (!business) return null
  const currency = business.currency
  const rows = data?.data ?? []
  const pagination = data?.pagination

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Outstanding by customer
        </h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyWithBalance}
            onChange={(e) => {
              setOnlyWithBalance(e.target.checked)
              setPage(1)
            }}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Only with balance
        </label>
      </div>
      {error && <div className="p-4"><ErrorBanner error={error} onRetry={reload} /></div>}
      {loading && !data && <LoadingBlock label="Loading balances…" />}
      {!loading && !error && (
        <>
          {rows.length === 0 ? (
            <EmptyState
              title="No customers to show"
              hint="Balances appear once customers have credit sales."
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Customer</Th>
                    <Th>Phone</Th>
                    <Th className="text-right">Total sales</Th>
                    <Th className="text-right">Total paid</Th>
                    <Th className="text-right">Outstanding</Th>
                    <Th>Last sale</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.customerId} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-800">{r.name}</Td>
                      <Td className="text-slate-600">{r.phone ?? '—'}</Td>
                      <Td className="text-right">
                        {formatMoney(r.totalSales, currency)}
                      </Td>
                      <Td className="text-right">
                        {formatMoney(r.totalPaid, currency)}
                      </Td>
                      <Td
                        className={`text-right font-medium ${
                          r.outstandingBalance !== '0.00'
                            ? 'text-rose-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatMoney(r.outstandingBalance, currency)}
                      </Td>
                      <Td className="text-slate-500">
                        {formatDateTime(r.lastSaleAt)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {pagination && (
                <PaginationBar
                  pagination={pagination}
                  page={page}
                  onPage={setPage}
                />
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}

function PaymentsTab() {
  const { business } = useAuth()
  const businessId = business?.id ?? ''
  const [from, setFrom] = useState(() => daysAgoIso(29))
  const [to, setTo] = useState(() => todayIso())
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [page, setPage] = useState(1)

  const { data, error, loading, reload } = useQuery(
    (signal) =>
      paymentsReport(
        businessId,
        { from: from || undefined, to: to || undefined, method, page, limit: 25 },
        { signal },
      ),
    [businessId, from, to, method, page],
  )

  if (!business) return null
  const currency = business.currency
  const rows = data?.data ?? []
  const pagination = data?.pagination
  const totals = data?.totals

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3">
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
            className="!w-auto"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          To
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
            className="!w-auto"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          Method
          <Select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethod | '')
              setPage(1)
            }}
            className="!w-auto"
          >
            <option value="">All</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </label>
        {totals && (
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              {String(totals.paymentCount)} payment
              {Number(totals.paymentCount) === 1 ? '' : 's'}
            </span>
            <span className="font-semibold text-slate-900">
              {formatMoney(String(totals.totalAmount), currency)}
            </span>
          </div>
        )}
      </div>
      {error && <div className="p-4"><ErrorBanner error={error} onRetry={reload} /></div>}
      {loading && !data && <LoadingBlock label="Loading payments…" />}
      {!loading && !error && (
        <>
          {rows.length === 0 ? (
            <EmptyState title="No payments in this range" />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Date</Th>
                    <Th>Invoice</Th>
                    <Th>Customer</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td>{formatDateTime(r.receivedAt)}</Td>
                      <Td className="font-medium text-indigo-700">
                        {r.invoiceNumber}
                      </Td>
                      <Td>{r.customerName ?? <span className="text-slate-400">—</span>}</Td>
                      <Td>
                        <Badge tone="sky">{r.method.replace('_', ' ')}</Badge>
                      </Td>
                      <Td className="text-slate-500">{r.reference ?? '—'}</Td>
                      <Td className="text-right font-medium">
                        {formatMoney(r.amount, currency)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
              {pagination && (
                <PaginationBar
                  pagination={pagination}
                  page={page}
                  onPage={setPage}
                />
              )}
            </>
          )}
        </>
      )}
    </Card>
  )
}
