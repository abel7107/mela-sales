/** All money values are decimal strings with 2 places ("125.50"). */

export function toCents(value: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${value}`)
  return Math.round(n * 100)
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function addMoney(...values: (string | null | undefined)[]): string {
  return fromCents(
    values.reduce<number>(
      (sum, v) => sum + (v ? toCents(v) : 0),
      0,
    ),
  )
}

export function subMoney(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b))
}

export function isPositiveMoney(value: string): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return false
  return toCents(value) > 0
}

/** Normalize a money input like "45", "45.5" → "45.00". Returns null if invalid. */
export function normalizeMoney(value: string): string | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return fromCents(toCents(trimmed))
}

/** Normalize a quantity input like "2.500" → "2.5". Returns null if invalid. */
export function normalizeQuantity(value: string): string | null {
  const trimmed = value.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null
  if (Number(trimmed) <= 0) return null
  return String(Number(trimmed))
}

/** Client-side line total (display only — the server computes authoritative totals). */
export function lineTotal(unitPrice: string, quantity: string): string {
  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty <= 0) return '0.00'
  return fromCents(Math.round(toCents(unitPrice) * qty))
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(value: string | number, currency = 'ETB'): string {
  const num =
    typeof value === 'number' ? value : Number(value)
  const amount = Number.isFinite(num) ? num : 0
  return `${currency} ${currencyFormatter.format(amount)}`
}

export function formatQuantity(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
