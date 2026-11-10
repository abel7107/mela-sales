import { useNavigate } from 'react-router-dom'
import { listInstallmentPlans } from '../api/endpoints'
import type { InstallmentPlanSummary } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useQuery } from '../lib/hooks'
import { formatDate, formatMoney } from '../lib/money'
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  TableWrap,
  Td,
  Th,
} from '../components/ui'

export function InstallmentsPage() {
  const { business } = useAuth()
  const navigate = useNavigate()
  const businessId = business?.id ?? ''

  const { data, error, loading, reload } = useQuery<InstallmentPlanSummary[]>(
    (signal) => listInstallmentPlans(businessId, { signal }),
    [businessId],
  )

  if (!business) return null
  if (loading && !data) return <LoadingBlock label="Loading installments…" />
  if (error && !data) return <ErrorBanner error={error} onRetry={reload} />

  const plans = data ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Installments</h1>
        <p className="text-sm text-slate-500">
          Installment plans and their payment progress.
        </p>
      </div>

      <Card>
        {plans.length === 0 ? (
          <EmptyState
            title="No installment plans"
            hint="Create an installment plan from a credit sale's detail page."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="bg-slate-50">
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Sale</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Allocated</Th>
                <Th>Installments</Th>
                <Th>Next due</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((plan) => (
                <tr
                  key={plan.planId}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/sales/${plan.saleId}`)}
                >
                  <Td className="font-medium">{plan.customerName ?? 'Walk-in'}</Td>
                  <Td>
                    <Badge tone={plan.status === 'ACTIVE' ? 'green' : 'slate'}>
                      {plan.status}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">{plan.saleStatus}</Td>
                  <Td className="text-right">
                    {formatMoney(plan.totalAmount, business.currency)}
                  </Td>
                  <Td className="text-right">
                    {formatMoney(plan.allocatedTotal, business.currency)}
                  </Td>
                  <Td>{plan.installmentCount}</Td>
                  <Td>{plan.nextDueDate ? formatDate(plan.nextDueDate) : '—'}</Td>
                  <Td>{formatDate(plan.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
