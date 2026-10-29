import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SalesSummaryPanel } from '../components/SalesSummaryPanel'
import { Button, Card } from '../components/ui'
import { daysAgoIso, todayIso } from '../lib/money'

export function DashboardPage() {
  const { business, isOwner } = useAuth()
  const [from, setFrom] = useState(() => daysAgoIso(29))
  const [to, setTo] = useState(() => todayIso())

  if (!business) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Sales overview for {business.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <Button variant="secondary" onClick={() => {
            setFrom(daysAgoIso(29))
            setTo(todayIso())
          }}>
            Last 30 days
          </Button>
          <Link to="/sales/new">
            <Button>+ New sale</Button>
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <SalesSummaryPanel
          businessId={business.id}
          currency={business.currency}
          from={from}
          to={to}
        />
      </Card>

      {isOwner && (
        <p className="text-xs text-slate-400">
          Tip: manage products, members and your business profile under
          Settings.
        </p>
      )}
    </div>
  )
}
