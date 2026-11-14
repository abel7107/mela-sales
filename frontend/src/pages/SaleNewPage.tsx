import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import {
  createCustomer,
  createSale,
  listBranches,
  listCustomers,
  listProducts,
} from '../api/endpoints'
import { PAYMENT_METHODS } from '../api/types'
import type { Branch, Customer, PaymentMethod, Product, Sale } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { useDebounced } from '../lib/hooks'
import {
  addMoney,
  formatMoney,
  fromCents,
  lineTotal,
  normalizeMoney,
  normalizeQuantity,
  subMoney,
  toCents,
} from '../lib/money'
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '../components/ui'

interface CartItem {
  key: string
  productServiceId: string
  name: string
  sku: string | null
  unitPrice: string
  quantity: string
}
interface CustomerForm {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

const emptyCustomerForm: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}
export function SaleNewPage() {
  const { business } = useAuth()
  const navigate = useNavigate()
  const businessId = business?.id ?? ''
  const currency = business?.currency ?? 'ETB'

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')

  const [productSearch, setProductSearch] = useState('')
  const debouncedProductSearch = useDebounced(productSearch, 300)
  const [productResults, setProductResults] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  const [cart, setCart] = useState<CartItem[]>([])
  const [cartError, setCartError] = useState<string | null>(null)

  const [saleType, setSaleType] = useState<'CASH' | 'CREDIT'>('CASH')
  const [customerSearch, setCustomerSearch] = useState('')
  const debouncedCustomerSearch = useDebounced(customerSearch, 300)
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [customersLoading, setCustomersLoading] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)

  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [customerForm, setCustomerForm] =
  useState<CustomerForm>(emptyCustomerForm)
  const [customerFormError, setCustomerFormError] =
    useState<string | null>(null)
  const [customerSaving, setCustomerSaving] = useState(false)
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [notes, setNotes] = useState('')
  const [initialPayment, setInitialPayment] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [paymentReference, setPaymentReference] = useState('')

  const [error, setError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    listBranches(businessId)
      .then((items) => {
        const active = items.filter((b) => b.isActive)
        setBranches(active)
        if (active.length > 0) setBranchId((prev) => prev || active[0].id)
      })
      .catch(() => setBranches([]))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    const controller = new AbortController()
    setProductsLoading(true)
    listProducts(
      businessId,
      { q: debouncedProductSearch || undefined, limit: 20 },
      { signal: controller.signal },
    )
      .then((env) => setProductResults(env.data))
      .catch(() => {
        if (!controller.signal.aborted) setProductResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setProductsLoading(false)
      })
    return () => controller.abort()
  }, [businessId, debouncedProductSearch])

  useEffect(() => {
    if (!businessId || saleType !== 'CREDIT') return
    const controller = new AbortController()
    setCustomersLoading(true)
    listCustomers(
      businessId,
      { q: debouncedCustomerSearch || undefined, limit: 10 },
      { signal: controller.signal },
    )
      .then((env) => setCustomerResults(env.data))
      .catch(() => {
        if (!controller.signal.aborted) setCustomerResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setCustomersLoading(false)
      })
    return () => controller.abort()
  }, [businessId, debouncedCustomerSearch, saleType])

  const addToCart = (product: Product) => {
    setCartError(null)
    setCart((prev) => {
      const existing = prev.find((i) => i.productServiceId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productServiceId === product.id
            ? { ...i, quantity: String(Number(i.quantity) + 1) }
            : i,
        )
      }
      return [
        ...prev,
        {
          key: product.id,
          productServiceId: product.id,
          name: product.name,
          sku: product.sku,
          unitPrice: product.price,
          quantity: '1',
        },
      ]
    })
  }

  const setQty = (key: string, quantity: string) => {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, quantity } : i)),
    )
  }

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((i) => i.key !== key))
  }
  const handleCreateCustomer = async (e: React.FormEvent) => {
  e.preventDefault()
  setCustomerFormError(null)

  if (!customerForm.name.trim()) {
    setCustomerFormError('Customer name is required.')
    return
  }

  if (
    customerForm.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim())
  ) {
    setCustomerFormError('Enter a valid email address.')
    return
  }

  setCustomerSaving(true)

  try {
    const newCustomer = await createCustomer(businessId, {
      name: customerForm.name.trim(),
      phone: customerForm.phone.trim() || null,
      email: customerForm.email.trim() || null,
      address: customerForm.address.trim() || null,
      notes: customerForm.notes.trim() || null,
    })

    setCustomer(newCustomer)
    setCustomerSearch('')
    setCustomerModalOpen(false)
    setCustomerForm(emptyCustomerForm)
  } catch (err) {
    setCustomerFormError(
      err instanceof ApiError
        ? err.message
        : 'Could not create the customer.',
    )
  } finally {
    setCustomerSaving(false)
  }
}

  const subtotal = addMoney(
    ...cart.map((i) => lineTotal(i.unitPrice, i.quantity || '0')),
  )
  const discountNorm = normalizeMoney(discount)
  const taxNorm = normalizeMoney(tax)
  const discountValue = discountNorm ?? '0.00'
  const taxValue = taxNorm ?? '0.00'
  const total = fromCents(
    Math.max(0, toCents(subtotal) - toCents(discountValue)) +
      toCents(taxValue),
  )
  const initialNorm =
    saleType === 'CREDIT' ? normalizeMoney(initialPayment) : null
  const initialPaymentValue = initialNorm ?? '0.00'
  const balanceDue = subMoney(total, initialPaymentValue)

  const cartValid =
    cart.length > 0 &&
    cart.every((i) => normalizeQuantity(i.quantity) !== null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!business) return
    setError(null)
    setCartError(null)

    if (!cartValid) {
      setCartError('Every line needs a quantity greater than zero.')
      return
    }
    if ((discount && !discountNorm) || (tax && !taxNorm)) {
      setError(
        new ApiError(400, 'Discount and tax must be amounts like 12.50.'),
      )
      return
    }
    if (initialPayment && !initialNorm) {
      setError(
        new ApiError(400, 'Initial payment must be an amount like 50.00.'),
      )
      return
    }
    if (saleType === 'CREDIT' && !customer) {
      setError(
        new ApiError(400, 'Credit sales require a customer — pick one below.'),
      )
      return
    }
    if (initialNorm && toCents(initialNorm) > toCents(total)) {
      setError(new ApiError(400, 'Initial payment cannot exceed the total.'))
      return
    }
    if (saleType === 'CASH' && toCents(total) <= 0) {
      setError(new ApiError(400, 'Cash sale total must be greater than zero.'))
      return
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID()
    }

    const hasInitialPayment = initialNorm !== null && toCents(initialNorm) > 0
    const needsPaymentMethod = saleType === 'CASH' || hasInitialPayment

    const body = {
      ...(branchId ? { branchId } : {}),
      saleType,
      items: cart.map((i) => ({
        productServiceId: i.productServiceId,
        quantity: normalizeQuantity(i.quantity) as string,
      })),
      customerId: saleType === 'CREDIT' ? customer?.id ?? null : null,
      discountAmount: discountValue,
      taxAmount: taxValue,
      notes: notes.trim() || null,
      ...(hasInitialPayment
        ? {
            initialPaymentAmount: initialNorm as string,
            paymentReference: paymentReference.trim() || null,
          }
        : {}),
      ...(needsPaymentMethod ? { paymentMethod } : {}),
    }

    setSubmitting(true)
    try {
      const sale: Sale = await createSale(
        business.id,
        body,
        idempotencyKey.current,
      )
      idempotencyKey.current = null
      navigate(`/sales/${sale.id}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err)
      else setError(new ApiError(0, 'Could not create the sale.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!business) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">New sale</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Prices are loaded from the server — only quantities are sent.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/sales')}>
          Cancel
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <Field label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card className="p-4">
            <Field label="Add product or service">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by name, SKU…"
                autoFocus
              />
            </Field>
            <div className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {productsLoading && (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Searching…</p>
              )}
              {!productsLoading && productResults.length === 0 && (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
                  No active products match.
                </p>
              )}
              {!productsLoading &&
                productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-indigo-50 dark:bg-indigo-900/30"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {p.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {p.sku ?? 'No SKU'} · {p.type}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatMoney(p.price, currency)}
                    </span>
                  </button>
                ))}
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cart ({cart.length})
              </h2>
            </div>
            {cart.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Search above and tap a product to add it.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((item) => {
                  const qty = normalizeQuantity(item.quantity)
                  const lineError = item.quantity !== '' && qty === null
                  return (
                    <li
                      key={item.key}
                      className="flex flex-wrap items-center gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatMoney(item.unitPrice, currency)} each
                          {item.sku ? ` · ${item.sku}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          className="h-7 w-7 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900"
                          onClick={() =>
                            setQty(
                              item.key,
                              String(
                                Math.max(1, Number(item.quantity || 1) - 1),
                              ),
                            )
                          }
                        >
                          −
                        </button>
                        <Input
                          value={item.quantity}
                          onChange={(e) => setQty(item.key, e.target.value)}
                          inputMode="decimal"
                          className={`!w-16 text-center ${lineError ? '!border-rose-400' : ''}`}
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          className="h-7 w-7 rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900"
                          onClick={() =>
                            setQty(
                              item.key,
                              String(Number(item.quantity || 0) + 1),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      <div className="w-24 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(
                          lineTotal(item.unitPrice, qty ?? '0'),
                          currency,
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeLine(item.key)}
                        className="rounded p-1 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:bg-rose-900/30 hover:text-rose-600 dark:text-rose-400"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.75 1A2.75 2.75 0 006 3.75V4H3.75a.75.75 0 000 1.5h.628l.84 10.55A2.75 2.75 0 007.966 19h4.068a2.75 2.75 0 002.747-2.95l.84-10.55h.628a.75.75 0 000-1.5H14v-.25A2.75 2.75 0 0011.25 1h-2.5zM10 4.5h-.25V3.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V4.5H10z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {lineError && (
                        <p className="w-full text-xs font-medium text-rose-600 dark:text-rose-400">
                          Quantity must be greater than zero (up to 3 decimals).
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {cartError && (
              <p className="border-t border-slate-100 px-4 py-2 text-sm font-medium text-rose-600 dark:text-rose-400">
                {cartError}
              </p>
            )}
          </Card>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Card className="space-y-4 p-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                Sale type
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSaleType('CASH')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    saleType === 'CASH'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900'
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setSaleType('CREDIT')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    saleType === 'CREDIT'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-900'
                  }`}
                >
                  Credit
                </button>
              </div>
            </div>

            {saleType === 'CREDIT' && (
              <Field label="Customer (required for credit)">
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2">
                    <span className="truncate text-sm font-medium text-indigo-900">
                      {customer.name}
                    </span>
                    <button
                      type="button"
                      className="ml-2 shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                      onClick={() => {
                        setCustomer(null)
                        setCustomerSearch('')
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search by name or phone…"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-2 w-full"
                      onClick={() => {
                        setCustomerForm(emptyCustomerForm)
                        setCustomerFormError(null)
                        setCustomerModalOpen(true)
                      }}
                    >
                      + Add New Customer
                    </Button>
                    <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      {customersLoading && (
                        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          Searching…
                        </p>
                      )}
                      {!customersLoading && customerResults.length === 0 && (
                        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                          No active customers match.
                        </p>
                      )}
                      {!customersLoading &&
                        customerResults
                          .filter((c) => c.isActive)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setCustomer(c)}
                              className="block w-full px-3 py-2 text-left hover:bg-indigo-50 dark:bg-indigo-900/30"
                            >
                              <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                                {c.name}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {c.phone ?? c.email ?? 'No contact'}
                              </span>
                            </button>
                          ))}
                    </div>
                  </>
                )}
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Discount">
                <Input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </Field>
              <Field label="Tax">
                <Input
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </Field>
            </div>

            <Field label="Notes (optional)">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Wedding order…"
              />
            </Field>

            {saleType === 'CREDIT' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Initial payment">
                  <Input
                    value={initialPayment}
                    onChange={(e) => setInitialPayment(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Method">
                  <Select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="col-span-2">
                  <Field label="Payment reference (optional)">
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="MP123"
                    />
                  </Field>
                </div>
              </div>
            )}

            {saleType === 'CASH' && (
              <Field label="Payment method">
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Card>

          <Card className="space-y-2 p-4">
            <Row label="Subtotal" value={formatMoney(subtotal, currency)} />
            <Row
              label="Discount"
              value={`− ${formatMoney(discountValue, currency)}`}
            />
            <Row label="Tax" value={`+ ${formatMoney(taxValue, currency)}`} />
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
              <Row label="Total" value={formatMoney(total, currency)} strong />
            </div>
            {saleType === 'CREDIT' && (
              <>
                <Row
                  label="Initial payment"
                  value={formatMoney(initialPaymentValue, currency)}
                />
                <Row
                  label="Balance due"
                  value={formatMoney(balanceDue, currency)}
                  strong
                />
              </>
            )}
          </Card>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/30 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
              <p className="font-medium">{error.message}</p>
              {error.errors.length > 0 && (
                <ul className="mt-1 list-inside list-disc">
                  {error.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button
            type="submit"
            busy={submitting}
            disabled={!cartValid}
            className="w-full"
          >
            {saleType === 'CASH' ? 'Complete cash sale' : 'Record credit sale'}
          </Button>
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Duplicate-submit protection is on (idempotency key).
                    </p>
        </form>
      </div>

      <Modal
        open={customerModalOpen}
        onClose={() => {
          if (!customerSaving) setCustomerModalOpen(false)
        }}
        title="Add New Customer"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <Field label="Name">
            <Input
              value={customerForm.name}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, name: e.target.value })
              }
              autoFocus
              placeholder="Abebe Kebede"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone (optional)">
              <Input
                value={customerForm.phone}
                onChange={(e) =>
                  setCustomerForm({ ...customerForm, phone: e.target.value })
                }
                placeholder="+251911222333"
              />
            </Field>

            <Field label="Email (optional)">
              <Input
                value={customerForm.email}
                onChange={(e) =>
                  setCustomerForm({ ...customerForm, email: e.target.value })
                }
                placeholder="abebe@example.com"
              />
            </Field>
          </div>

          <Field label="Address (optional)">
            <Input
              value={customerForm.address}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, address: e.target.value })
              }
              placeholder="Dire Dawa"
            />
          </Field>

          <Field label="Notes (optional)">
            <Textarea
              value={customerForm.notes}
              onChange={(e) =>
                setCustomerForm({ ...customerForm, notes: e.target.value })
              }
              rows={2}
              placeholder="Additional customer information"
            />
          </Field>

          {customerFormError && (
            <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
              {customerFormError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={customerSaving}
              onClick={() => setCustomerModalOpen(false)}
            >
              Cancel
            </Button>

            <Button type="submit" busy={customerSaving}>
              Create Customer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${
        strong ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
      }`}
    >
      <span>{label}</span>
      <span>{value}</span>
     
    </div>
    
  )
}
