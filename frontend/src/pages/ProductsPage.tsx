import { useState } from 'react'
import { ApiError } from '../api/client'
import {
  createProduct,
  listProducts,
  setProductActive,
  updateProduct,
} from '../api/endpoints'
import type { Product, ProductType } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useDebounced, useQuery } from '../lib/hooks'
import { formatMoney } from '../lib/money'
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
  Select,
  TableWrap,
  Td,
  Textarea,
  Th,
} from '../components/ui'

interface ProductForm {
  name: string
  type: ProductType
  price: string
  sku: string
  description: string
}

const emptyForm: ProductForm = {
  name: '',
  type: 'PRODUCT',
  price: '',
  sku: '',
  description: '',
}

export function ProductsPage() {
  const { business, isOwner } = useAuth()
  const businessId = business?.id ?? ''

  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [page, setPage] = useState(1)

  const { data, error, loading, reload } = useQuery(
    (signal) =>
      listProducts(
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
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm)
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

  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name,
      type: p.type,
      price: p.price,
      sku: p.sku ?? '',
      description: p.description ?? '',
    })
    setFormError(null)
    setModalOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Product name is required.')
      return
    }
    if (!/^\d+(\.\d{1,2})?$/.test(form.price.trim())) {
      setFormError('Price must be an amount like 45.00 (max 2 decimals).')
      return
    }
    setBusy(true)
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        price: form.price.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
      }
      if (editing) {
        await updateProduct(business.id, editing.id, payload)
      } else {
        await createProduct(business.id, payload)
      }
      setModalOpen(false)
      reload()
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not save the product.',
      )
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (p: Product) => {
    setActionError(null)
    try {
      await setProductActive(business.id, p.id, !p.isActive)
      reload()
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err
          : new ApiError(0, 'Could not update the product.'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Products & services
          </h1>
          <p className="text-sm text-slate-500">
            {isOwner
              ? 'Create, price and deactivate what you sell.'
              : 'Read-only catalog for cashiers.'}
          </p>
        </div>
        {isOwner && <Button onClick={openCreate}>+ New product</Button>}
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
            placeholder="Name, SKU or description…"
          />
        </label>
        {isOwner && (
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
        )}
      </Card>

      {actionError && <ErrorBanner error={actionError} />}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading products…" />}

      {!loading && !error && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title="No products found"
              hint={
                isOwner
                  ? 'Add your first product to start recording sales.'
                  : 'Nothing matches this search.'
              }
              action={
                isOwner ? (
                  <Button onClick={openCreate}>+ New product</Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr className="bg-slate-50">
                    <Th>Name</Th>
                    <Th>SKU</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Price</Th>
                    <Th>Status</Th>
                    {isOwner && <Th className="text-right">Actions</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <Td>
                        <span className="block font-medium text-slate-800">
                          {p.name}
                        </span>
                        {p.description && (
                          <span className="block max-w-64 truncate text-xs text-slate-500">
                            {p.description}
                          </span>
                        )}
                      </Td>
                      <Td className="font-mono text-xs text-slate-500">
                        {p.sku ?? '—'}
                      </Td>
                      <Td>
                        <Badge tone={p.type === 'PRODUCT' ? 'indigo' : 'sky'}>
                          {p.type}
                        </Badge>
                      </Td>
                      <Td className="text-right font-medium">
                        {formatMoney(p.price, business.currency)}
                      </Td>
                      <Td>
                        <Badge tone={p.isActive ? 'green' : 'slate'}>
                          {p.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      {isOwner && (
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              className="!px-2 !py-1 text-xs"
                              onClick={() => openEdit(p)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={p.isActive ? 'danger' : 'secondary'}
                              className="!px-2 !py-1 text-xs"
                              onClick={() => void toggleActive(p)}
                            >
                              {p.isActive ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          </div>
                        </Td>
                      )}
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
        title={editing ? 'Edit product' : 'New product'}
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" error={formError && !form.name.trim() ? formError : null}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              placeholder="Macchiato"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as ProductType })
                }
              >
                <option value="PRODUCT">Product</option>
                <option value="SERVICE">Service</option>
              </Select>
            </Field>
            <Field label="Price">
              <Input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                inputMode="decimal"
                placeholder="45.00"
              />
            </Field>
          </div>
          <Field label="SKU (optional, unique per business)">
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="MCH-1"
            />
          </Field>
          <Field label="Description (optional)">
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
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
              {editing ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
