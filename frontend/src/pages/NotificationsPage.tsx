import { useAuth } from '../auth/AuthContext'
import { markNotificationRead, listNotifications } from '../api/endpoints'
import { useQuery } from '../lib/hooks'
import { formatDate } from '../lib/money'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
} from '../components/ui'

export function NotificationsPage() {
  const { business } = useAuth()
  const businessId = business?.id ?? ''

  const { data, error, loading, reload } = useQuery(
    (signal) => listNotifications(businessId, { signal }),
    [businessId],
  )

  if (!business) return null
  if (loading && !data) return <LoadingBlock label="Loading notifications…" />
  if (error && !data) return <ErrorBanner error={error} onRetry={reload} />

  const notifications = data ?? []

  const markRead = async (id: string) => {
    try {
      await markNotificationRead(businessId, id)
      reload()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Notifications</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Installment reminders and alerts.
        </p>
      </div>

      <Card>
        {notifications.length === 0 ? (
          <EmptyState title="No notifications" hint="You are all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={n.type === 'OVERDUE' ? 'rose' : n.type === 'DUE_TODAY' ? 'amber' : 'slate'}>
                      {n.type.replace('_', ' ')}
                    </Badge>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-indigo-500" />}
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{n.message}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => void markRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
