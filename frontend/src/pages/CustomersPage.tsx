import { useState } from 'react'
import { ApiError } from '../api/client'
import {
  createCustomer,
  listCustomers,
  setCustomerActive,
  updateCustomer,
} from '../api/endpoints'
import type { Customer } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useDebounced, useQuery } from '../lib/hooks'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PaginationBar,
  TableWrap,
  Td,
  Textarea,
  Th,
} from '../components/ui'

interface CustomerForm {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

export function CustomersPage() {
  const { business, isOwner } = useAuth()
  const businessId = business?.id ?? ''

  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(1)

  const { data, error, loading, reload } = useQuery(
    (signal) =>
      listCustomers(
        businessId,
        {
          q: q || undefined,
          include_inactive: includeInactive,
          page,
          limit: 25,
        },
        { signal },
      ),
    [businessId, q, includeInactive, page],
  )

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<ApiError | null>(null)

  if (!business) return null

  const rows = data?.data ?? []
  const pagination = data?.pagination

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Customer name is required.')
      return
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError('Enter a valid email address.')
      return
    }
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await updateCustomer(business.id, editing.id, payload)
      } else {
        await createCustomer(business.id, payload)
      }
      setModalOpen(false)
      reload()
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not save the customer.',
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (c: Customer) => {
    setActionError(null)
    try {
      await setCustomerActive(business.id, c.id, !c.isActive)
      reload()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err
          : new ApiError(0, 'Could not update the customer.'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            People and businesses you sell to on credit.
          </p>
        </div>
        <Button onClick={openCreate}>+ New customer</Button>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="block min-w-52 flex-1">
          <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
            Search
          </span>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Name, phone or email…"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => {
              setIncludeInactive(e.target.checked)
              setPage(1)
            }}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Include inactive
        </label>
      </Card>

      {actionError && <ErrorBanner error={actionError} />}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading customers…" />}

      {!loading && !error && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title="No customers found"
              hint="Add customers so you can record credit sales."
              action={<Button onClick={openCreate}>+ New customer</Button>}
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>Email</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        <span className="block font-medium text-slate-800">
                          {c.name}
                        </span>
                        {c.notes && (
                          <span className="block max-w-56 truncate text-xs text-slate-500">
                            {c.notes}
                          </span>
                        )}
                      </Td>
                      <Td className="text-slate-600">{c.phone ?? '—'}</Td>
                      <Td className="text-slate-600">{c.email ?? '—'}</Td>
                      <Td>
                        <Badge tone={c.isActive ? 'green' : 'slate'}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 text-xs"
                            onClick={() => openEdit(c)}
                          >
                            Edit
                          </Button>
                          {isOwner && (
                            <Button
                              variant={c.isActive ? 'danger' : 'secondary'}
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void toggleActive(c)}
                            >
                              {c.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit customer' : 'New customer'}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Name"
            error={formError && !form.name.trim() ? formError : null}
          >
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              placeholder="Abebe Kebede"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone (optional)">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+251911222333"
              />
            </Field>
            <Field label="Email (optional)">
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="abebe@example.com"
              />
            </Field>
          </div>
          <Field label="Address (optional)">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Addis Ababa"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Prefers WhatsApp"
            />
          </Field>
          {formError && (
            <p className="text-sm font-medium text-rose-600">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              {editing ? 'Save changes' : 'Create customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
