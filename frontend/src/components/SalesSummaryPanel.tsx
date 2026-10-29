import { salesSummary } from '../api/endpoints'
import type { SaleSummary } from '../api/types'
import { useQuery } from '../lib/hooks'
import { formatMoney, formatQuantity } from '../lib/money'
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  TableWrap,
  Td,
  Th,
} from './ui'

export function SalesSummaryPanel({
  businessId,
  currency,
  from,
  to,
}: {
  businessId: string
  currency: string
  from?: string
  to?: string
}) {
  const { data, error, loading, reload } = useQuery<SaleSummary>(
    (signal) => salesSummary(businessId, { from, to }, { signal }),
    [businessId, from, to],
  )

  if (loading && !data) return <LoadingBlock label="Loading summary…" />
  if (error) return <ErrorBanner error={error} onRetry={reload} />
  if (!data) return null

  const { totals, daily, topProducts } = data

  const stats: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Total sales', value: formatMoney(totals.totalAmount, currency) },
    { label: 'Sales count', value: String(totals.saleCount) },
    {
      label: 'Cash',
      value: formatMoney(totals.cashAmount, currency),
      tone: 'text-emerald-600',
    },
    {
      label: 'Credit',
      value: formatMoney(totals.creditAmount, currency),
      tone: 'text-amber-600',
    },
    {
      label: 'Outstanding',
      value: formatMoney(totals.outstandingAmount, currency),
      tone: 'text-rose-600',
    },
    { label: 'Tax', value: formatMoney(totals.taxAmount, currency) },
    {
      label: 'Discounts',
      value: formatMoney(totals.discountAmount, currency),
    },
    { label: 'Voided', value: String(totals.voidedCount) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {s.label}
            </p>
            <p className={`mt-1 text-lg font-semibold ${s.tone ?? 'text-slate-900'}`}>
              {s.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Daily breakdown
            </h3>
          </div>
          {daily.length === 0 ? (
            <EmptyState title="No sales in this range" />
          ) : (
            <TableWrap>
              <thead>
                <tr className="bg-slate-50">
                  <Th>Day</Th>
                  <Th className="text-right">Sales</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Cash</Th>
                  <Th className="text-right">Credit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {daily.map((d) => (
                  <tr key={d.day} className="hover:bg-slate-50">
                    <Td className="font-medium">{d.day}</Td>
                    <Td className="text-right">{d.saleCount}</Td>
                    <Td className="text-right font-medium">
                      {formatMoney(d.totalAmount, currency)}
                    </Td>
                    <Td className="text-right">
                      {formatMoney(d.cashAmount, currency)}
                    </Td>
                    <Td className="text-right">
                      {formatMoney(d.creditAmount, currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Top products
            </h3>
          </div>
          {topProducts.length === 0 ? (
            <EmptyState title="No product sales in this range" />
          ) : (
            <TableWrap>
              <thead>
                <tr className="bg-slate-50">
                  <Th>Product</Th>
                  <Th>Qty sold</Th>
                  <Th className="text-right">Revenue</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topProducts.map((p) => (
                  <tr key={`${p.name}-${p.type}`} className="hover:bg-slate-50">
                    <Td className="font-medium">{p.name}</Td>
                    <Td>{formatQuantity(p.quantitySold)}</Td>
                    <Td className="text-right font-medium">
                      {formatMoney(p.revenue, currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </div>
  )
}
