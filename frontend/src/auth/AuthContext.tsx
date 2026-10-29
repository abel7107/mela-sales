import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ApiError,
  clearSession,
  getRefreshToken,
  getToken,
  onSessionRefresh,
  refreshAccessToken,
  saveSession,
  setToken,
} from '../api/client'
import { authLogin, authLogout, authMe, authRegister, listBusinesses } from '../api/endpoints'
import type { AuthSession, AuthUser, Business, Role } from '../api/types'

const BUSINESS_KEY = 'mela_business_id'

interface AuthContextValue {
  token: string | null
  user: AuthUser | null
  businesses: Business[]
  business: Business | null
  role: Role | null
  isOwner: boolean
  loading: boolean
  error: ApiError | null
  signIn: (email: string, password: string) => Promise<void>
  registerAccount: (email: string, password: string, name?: string) => Promise<void>
  login: (devToken: string) => Promise<void>
  logout: () => Promise<void>
  switchBusiness: (businessId: string) => void
  refreshBusinesses: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeTokenExp(token: string): number | null {
  try {
    const part = token.split('.')[1] ?? ''
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(
    () => getToken() !== null || getRefreshToken() !== null,
  )
  const [error, setError] = useState<ApiError | null>(null)
  const bootstrapped = useRef(false)

  const applyBusinesses = useCallback((list: Business[]) => {
    setBusinesses(list)
    const storedId = localStorage.getItem(BUSINESS_KEY)
    const selected =
      list.find((b) => b.id === storedId) ?? list[0] ?? null
    setBusiness(selected)
    if (selected) {
      localStorage.setItem(BUSINESS_KEY, selected.id)
    } else {
      localStorage.removeItem(BUSINESS_KEY)
    }
  }, [])

  const refreshBusinesses = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listBusinesses()
      applyBusinesses(list)
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return
      setError(
        err instanceof ApiError
          ? err
          : new ApiError(0, 'Failed to load businesses.'),
      )
    } finally {
      setLoading(false)
    }
  }, [applyBusinesses])

  // Keep React state in sync when a silent refresh happens mid-session.
  useEffect(() => {
    return onSessionRefresh(({ accessToken }) => {
      setTokenState(accessToken)
    })
  }, [])

  // Restore a session that only has a refresh token stored.
  useEffect(() => {
    let cancelled = false
    if (!getToken() && getRefreshToken()) {
      void refreshAccessToken().then((fresh) => {
        if (cancelled) return
        if (fresh) {
          setTokenState(fresh)
        } else {
          clearSession()
          setLoading(false)
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Load the signed-in user and their businesses once per session.
  useEffect(() => {
    if (!token) {
      bootstrapped.current = false
      setBusinesses([])
      setBusiness(null)
      setUser(null)
      setLoading(false)
      setError(null)
      return
    }

    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      setLoading(true)
      try {
        const me = await authMe()
        setUser(me)
      } catch (err) {
        if (err instanceof ApiError && err.status !== 401) setError(err)
      }
      try {
        const list = await listBusinesses()
        applyBusinesses(list)
        setError(null)
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(0, 'Failed to load businesses.'),
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [token, applyBusinesses])

  // Refresh the access token a minute before it expires.
  useEffect(() => {
    if (!token) return
    const exp = decodeTokenExp(token)
    if (!exp) return

    const delay = Math.max(exp * 1000 - Date.now() - 60_000, 5_000)
    const timer = window.setTimeout(() => {
      void refreshAccessToken().then((fresh) => {
        if (fresh) setTokenState(fresh)
        else {
          clearSession()
          setTokenState(null)
        }
      })
    }, delay)

    return () => window.clearTimeout(timer)
  }, [token])

  const beginSession = useCallback(
    (accessToken: string, refreshToken: string | null) => {
      if (refreshToken) {
        saveSession({ accessToken, refreshToken })
      } else {
        clearSession()
        setToken(accessToken)
      }
      bootstrapped.current = false
      setTokenState(accessToken)
      setLoading(true)
    },
    [],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session: AuthSession = await authLogin({ email, password })
      beginSession(session.accessToken, session.refreshToken)
      setUser(session.user)
    },
    [beginSession],
  )

  const registerAccount = useCallback(
    async (email: string, password: string, name?: string) => {
      const session: AuthSession = await authRegister({
        email,
        password,
        ...(name ? { name } : {}),
      })
      beginSession(session.accessToken, session.refreshToken)
      setUser(session.user)
    },
    [beginSession],
  )

  // Dev-token login (paste page) — no refresh token for this session.
  const login = useCallback(
    async (devToken: string) => {
      beginSession(devToken.trim(), null)
    },
    [beginSession],
  )

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await authLogout(refreshToken)
      } catch {
        /* local sign-out proceeds even if the server call fails */
      }
    }
    clearSession()
    localStorage.removeItem(BUSINESS_KEY)
    setTokenState(null)
    setUser(null)
    setBusinesses([])
    setBusiness(null)
  }, [])

  const switchBusiness = useCallback(
    (businessId: string) => {
      const found = businesses.find((b) => b.id === businessId)
      if (!found) return
      localStorage.setItem(BUSINESS_KEY, businessId)
      setBusiness(found)
    },
    [businesses],
  )

  const role = business?.membership?.role ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      businesses,
      business,
      role,
      isOwner: role === 'OWNER',
      loading,
      error,
      signIn,
      registerAccount,
      login,
      logout,
      switchBusiness,
      refreshBusinesses,
    }),
    [
      token,
      user,
      businesses,
      business,
      role,
      loading,
      error,
      signIn,
      registerAccount,
      login,
      logout,
      switchBusiness,
      refreshBusinesses,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
