import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listSales } from '../api/endpoints'
import type { SaleListRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useDebounced, useQuery } from '../lib/hooks'
import { formatDateTime, formatMoney } from '../lib/money'
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

function statusTone(status: string) {
  if (status === 'PAID') return 'green' as const
  if (status === 'OPEN') return 'amber' as const
  return 'rose' as const
}

export function SalesListPage() {
  const { business } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const invoice = useDebounced(search.trim(), 400)
  const [status, setStatus] = useState('')
  const [saleType, setSaleType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const businessId = business?.id ?? ''

  const { data, error, loading, reload } = useQuery(
    (signal) =>
      listSales(
        businessId,
        {
          invoice: invoice || undefined,
          status: status ? [status] : undefined,
          saleType: saleType ? [saleType] : undefined,
          from: from || undefined,
          to: to || undefined,
          page,
          limit: 25,
        },
        { signal },
      ),
    [businessId, invoice, status, saleType, from, to, page],
  )

  if (!business) return null
  const currency = business.currency

  const rows = data?.data ?? []
  const pagination = data?.pagination

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sales</h1>
          <p className="text-sm text-slate-500">
            Record payments, print invoices, void sales.
          </p>
        </div>
        <Link to="/sales/new">
          <Button>+ New sale</Button>
        </Link>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Invoice #
            </span>
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="INV-000001"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Status
            </span>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Void</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Type
            </span>
            <Select
              value={saleType}
              onChange={(e) => {
                setSaleType(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              <option value="CASH">Cash</option>
              <option value="CREDIT">Credit</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              From
            </span>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              To
            </span>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
            />
          </label>
        </div>
      </Card>

      {error && <ErrorBanner error={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading sales…" />}

      {!loading && !error && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title="No sales found"
              hint="Try adjusting the filters, or record your first sale."
              action={
                <Link to="/sales/new">
                  <Button>+ New sale</Button>
                </Link>
              }
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Invoice</Th>
                    <Th>Date</Th>
                    <Th>Customer</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Paid</Th>
                    <Th className="text-right">Balance</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row: SaleListRow) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-indigo-50/40"
                      onClick={() => navigate(`/sales/${row.id}`)}
                    >
                      <Td className="font-medium text-indigo-700">
                        {row.invoiceNumber}
                      </Td>
                      <Td>{formatDateTime(row.createdAt)}</Td>
                      <Td>{row.customerName ?? <span className="text-slate-400">—</span>}</Td>
                      <Td>
                        <Badge tone={row.saleType === 'CASH' ? 'sky' : 'amber'}>
                          {row.saleType}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                      </Td>
                      <Td className="text-right font-medium">
                        {formatMoney(row.totalAmount, currency)}
                      </Td>
                      <Td className="text-right">
                        {formatMoney(row.amountPaid, currency)}
                      </Td>
                      <Td
                        className={`text-right font-medium ${
                          row.balanceDue !== '0.00' ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {formatMoney(row.balanceDue, currency)}
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
        </Card>
      )}
    </div>
  )
}
