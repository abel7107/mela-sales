import type { AuthSession, Pagination } from './types'

const TOKEN_KEY = 'mela_token'
const REFRESH_KEY = 'mela_refresh_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token)
}

export function saveSession(session: {
  accessToken: string
  refreshToken: string
}): void {
  setToken(session.accessToken)
  setRefreshToken(session.refreshToken)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

type SessionRefreshListener = (session: {
  accessToken: string
  refreshToken: string
}) => void

const sessionListeners = new Set<SessionRefreshListener>()

/** Notified whenever a silent refresh yields a new token pair. */
export function onSessionRefresh(listener: SessionRefreshListener): () => void {
  sessionListeners.add(listener)
  return () => {
    sessionListeners.delete(listener)
  }
}

let refreshInFlight: Promise<string | null> | null = null

/**
 * Exchanges the stored refresh token for a new token pair (single flight).
 * Returns the new access token, or null when the session is dead.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null

    refreshInFlight = (async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return null

        const body = (await res.json()) as { data?: Partial<AuthSession> }
        const data = body.data
        if (!data?.accessToken || !data?.refreshToken) return null

        saveSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        })
        for (const listener of sessionListeners) {
          listener({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          })
        }
        return data.accessToken
      } catch {
        return null
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }

  return refreshInFlight
}

export class ApiError extends Error {
  readonly status: number
  readonly errors: string[]
  readonly requestId?: string

  constructor(
    status: number,
    message: string,
    errors: string[] = [],
    requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
    this.requestId = requestId
  }
}

export interface Envelope<T> {
  status: string
  message?: string
  data: T
  pagination?: Pagination
  totals?: Record<string, string | number>
}

interface ErrorBody {
  status?: string
  message?: string
  errors?: string[]
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  asText = false,
  isRetry = false,
): Promise<Envelope<T>> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'Network error — is the API running on port 5000?')
  }

  const requestId = res.headers.get('X-Request-Id') ?? undefined

  if (res.status === 401) {
    // Credential endpoints return 401 for a wrong password — that is an
    // expected answer, not a dead session.
    const isCredentialPath =
      path.startsWith('/auth/login') || path.startsWith('/auth/register')

    if (!isCredentialPath) {
      if (!isRetry) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          return request<T>(path, init, asText, true)
        }
      }

      clearSession()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }

    let message = 'Your session is invalid or expired.'
    try {
      const body = (await res.json()) as ErrorBody
      if (body.message) message = body.message
    } catch {
      /* keep default */
    }
    throw new ApiError(401, message, [], requestId)
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`
    let errors: string[] = []
    try {
      const body = (await res.json()) as ErrorBody
      if (body.message) message = body.message
      if (Array.isArray(body.errors)) {
        errors = body.errors.map((e) => {
          if (typeof e === 'string') return e
          if (e && typeof e === 'object') {
            const obj = e as { message?: unknown; field?: unknown }
            const msg = typeof obj.message === 'string' ? obj.message : ''
            const field = typeof obj.field === 'string' ? obj.field : ''
            return field ? `${field}: ${msg}` : msg || JSON.stringify(e)
          }
          return String(e)
        })
      }
    } catch {
      /* keep defaults */
    }
    throw new ApiError(res.status, message, errors, requestId)
  }

  if (asText) {
    const text = await res.text()
    return { status: 'success', data: text as unknown as T }
  }

  try {
    return (await res.json()) as Envelope<T>
  } catch {
    throw new ApiError(0, 'Invalid response from server.', [], requestId)
  }
}

export interface RequestOptions {
  signal?: AbortSignal
}

export async function apiGet<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<Envelope<T>> {
  return request<T>(path, { signal: opts.signal })
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  idempotencyKey?: string,
  opts: RequestOptions = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  return request<T>(path, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  })
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<Envelope<T>> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    signal: opts.signal,
  })
}

export async function apiDelete<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<Envelope<T>> {
  return request<T>(path, { method: 'DELETE', signal: opts.signal })
}

/** Fetches a raw text/HTML resource (e.g. the printable invoice). */
export async function apiGetText(
  path: string,
  opts: RequestOptions = {},
): Promise<string> {
  const env = await request<string>(path, { signal: opts.signal }, true)
  return env.data
}

export function buildQuery(
  params: Record<string, unknown>,
): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    sp.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}
