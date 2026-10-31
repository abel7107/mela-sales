import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { addMember, listMembers, updateBusiness, updateMember } from '../api/endpoints'
import type { Member, Role } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useQuery } from '../lib/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Select,
  TableWrap,
  Td,
  Th,
} from '../components/ui'

export function SettingsPage() {
  const { business, isOwner, refreshBusinesses } = useAuth()

  if (!business) return null
  if (!isOwner) return <Navigate to="/dashboard" replace />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Business profile and team access.
        </p>
      </div>

      <ProfileCard
        businessId={business.id}
        initial={{
          name: business.name,
          currency: business.currency,
          phone: business.phone ?? '',
          email: business.email ?? '',
          address: business.address ?? '',
          logoUrl: business.logoUrl ?? '',
        }}
        onSaved={() => void refreshBusinesses()}
      />

      <MembersCard businessId={business.id} />
    </div>
  )
}

function ProfileCard({
  businessId,
  initial,
  onSaved,
}: {
  businessId: string
  initial: {
    name: string
    currency: string
    phone: string
    email: string
    address: string
    logoUrl: string
  }
  onSaved: () => void
}) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!form.name.trim()) {
      setError(new ApiError(400, 'Business name is required.'))
      return
    }
    const currency = form.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError(new ApiError(400, 'Currency must be a 3-letter code.'))
      return
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError(new ApiError(400, 'Enter a valid email address.'))
      return
    }
    setBusy(true)
    try {
      await updateBusiness(businessId, {
        name: form.name.trim(),
        currency,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        logoUrl: form.logoUrl.trim() || null,
      })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(0, 'Could not save.'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-slate-900">
        Business profile
      </h2>
      <form onSubmit={submit} className="mt-4 max-w-xl space-y-4">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <Input
              value={form.currency}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value.toUpperCase() })
              }
              maxLength={3}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+251911000001"
            />
          </Field>
        </div>
        <Field label="Email">
          <Input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="hello@example.com"
          />
        </Field>
        <Field label="Address">
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Addis Ababa"
          />
        </Field>
        <Field label="Logo URL" hint="Shown on printable invoices later.">
          <Input
            value={form.logoUrl}
            onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
            placeholder="https://…"
          />
        </Field>
        {error && (
          <p className="text-sm font-medium text-rose-600">{error.message}</p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" busy={busy}>
            Save profile
          </Button>
          {saved && (
            <span className="text-sm font-medium text-emerald-600">
              Saved.
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}

function MembersCard({ businessId }: { businessId: string }) {
  const { data, error, loading, reload } = useQuery(
    (signal) => listMembers(businessId, { signal }),
    [businessId],
  )

  const [memberRef, setMemberRef] = useState('')
  const [role, setRole] = useState<Role>('CASHIER')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<ApiError | null>(null)

  const members = data ?? []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const value = memberRef.trim()
    if (!value) {
      setFormError('Enter the member’s email or user ID.')
      return
    }
    setBusy(true)
    try {
      await addMember(
        businessId,
        value.includes('@') ? { email: value, role } : { authUserId: value, role },
      )
      setMemberRef('')
      reload()
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not add the member.',
      )
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (m: Member, newRole: Role) => {
    setActionError(null)
    try {
      await updateMember(businessId, m.id, { role: newRole })
      reload()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err : new ApiError(0, 'Update failed.'),
      )
    }
  }

  const toggleActive = async (m: Member) => {
    setActionError(null)
    try {
      await updateMember(businessId, m.id, { isActive: !m.isActive })
      reload()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err : new ApiError(0, 'Update failed.'),
      )
    }
  }

  return (
    <Card>
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Team members
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Invite your team by the email they sign up with (they need an
          account first).
        </p>
      </div>

      <form
        onSubmit={submit}
        className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3"
      >
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            Email or user ID
          </span>
          <Input
            value={memberRef}
            onChange={(e) => setMemberRef(e.target.value)}
            placeholder="cashier@business.com"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            Role
          </span>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="!w-36"
          >
            <option value="CASHIER">Cashier</option>
            <option value="OWNER">Owner</option>
          </Select>
        </label>
        <Button type="submit" busy={busy}>
          Add member
        </Button>
        {formError && (
          <p className="w-full text-sm font-medium text-rose-600">
            {formError}
          </p>
        )}
      </form>

      {actionError && (
        <div className="px-5 pt-3">
          <ErrorBanner error={actionError} />
        </div>
      )}
      {error && (
        <div className="px-5 pt-3">
          <ErrorBanner error={error} onRetry={reload} />
        </div>
      )}
      {loading && !data && <LoadingBlock label="Loading members…" />}

      {!loading && !error && (
        <>
          {members.length === 0 ? (
            <EmptyState title="No members yet" />
          ) : (
            <TableWrap>
              <thead>
                <tr className="bg-slate-50">
                  <Th>User ID</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-sm font-medium">
                      {m.authUserId}
                    </Td>
                    <Td>
                      <Select
                        value={m.role}
                        onChange={(e) =>
                          void changeRole(m, e.target.value as Role)
                        }
                        className="!w-32 !py-1 text-xs"
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="CASHIER">CASHIER</option>
                      </Select>
                    </Td>
                    <Td>
                      <Badge tone={m.isActive ? 'green' : 'slate'}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td className="text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant={m.isActive ? 'danger' : 'secondary'}
                        className="!px-2 !py-1 text-xs"
                        onClick={() => void toggleActive(m)}
                      >
                        {m.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </Card>
  )
}
