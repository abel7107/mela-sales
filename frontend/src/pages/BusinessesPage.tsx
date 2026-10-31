import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { createBusiness, updateBusiness } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Spinner,
} from '../components/ui'

export function BusinessesPage() {
  const {
    businesses,
    business,
    loading,
    error,
    logout,
    switchBusiness,
    refreshBusinesses,
  } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('ETB')
  const [phone, setPhone] = useState('')

  const openCreate = () => {
    setName('')
    setCurrency('ETB')
    setPhone('')
    setFormError(null)
    setCreating(true)
  }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Business name is required.')
      return
    }
    const cur = currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(cur)) {
      setFormError('Currency must be a 3-letter code (e.g. ETB).')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const created = await createBusiness({
        name: name.trim(),
        currency: cur,
        phone: phone.trim() || null,
      })
      await refreshBusinesses()
      switchBusiness(created.id)
      setCreating(false)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not create business.',
      )
    } finally {
      setBusy(false)
    }
  }

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!business) return
    if (!name.trim()) {
      setFormError('Business name is required.')
      return
    }
    const cur = currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(cur)) {
      setFormError('Currency must be a 3-letter code (e.g. ETB).')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      await updateBusiness(business.id, {
        name: name.trim(),
        currency: cur,
        phone: phone.trim() || null,
      })
      await refreshBusinesses()
      setEditing(false)
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not update business.',
      )
    } finally {
      setBusy(false)
    }
  }

  const openEditFor = (id: string) => {
    const b = businesses.find((x) => x.id === id)
    if (!b) return
    setName(b.name)
    setCurrency(b.currency)
    setPhone(b.phone ?? '')
    setFormError(null)
    setEditing(true)
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Your businesses
            </h1>
            <p className="text-sm text-slate-500">
              Pick a business to work in, or create a new one.
            </p>
          </div>
          <Button variant="ghost" onClick={handleLogout}>
            Sign out
          </Button>
        </div>

        {loading && (
          <div className="flex justify-center py-16 text-slate-500">
            <Spinner size="lg" />
          </div>
        )}

        {!loading && error && (
          <Card className="mb-4 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error.message}
          </Card>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {businesses.map((b) => (
              <Card
                key={b.id}
                className={`flex items-center justify-between gap-3 p-4 transition hover:border-indigo-300 ${
                  business?.id === b.id ? 'border-indigo-400 ring-1 ring-indigo-200' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-900">
                      {b.name}
                    </p>
                    <Badge tone="indigo">{b.membership?.role}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {b.currency}
                    {b.phone ? ` · ${b.phone}` : ''}
                    {b.address ? ` · ${b.address}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      switchBusiness(b.id)
                      navigate('/dashboard')
                    }}
                  >
                    Open
                  </Button>
                  {b.membership?.role === 'OWNER' && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        switchBusiness(b.id)
                        openEditFor(b.id)
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </Card>
            ))}

            {businesses.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No businesses yet
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Create your first business to start recording sales.
                </p>
              </Card>
            )}

            <Button className="w-full" onClick={openCreate}>
              + New business
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create business"
      >
        <form onSubmit={submitCreate} className="space-y-4">
          <Field label="Name" error={formError && !name.trim() ? formError : null}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Test Cafe"
              autoFocus
            />
          </Field>
          <Field label="Currency">
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="ETB"
            />
          </Field>
          <Field label="Phone (optional)">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+251911000001"
            />
          </Field>
          {formError && (
            <p className="text-sm font-medium text-rose-600">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setCreating(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit business"
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Currency">
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+251911000001"
            />
          </Field>
          {formError && (
            <p className="text-sm font-medium text-rose-600">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
