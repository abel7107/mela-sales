import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'

type Mode = 'signin' | 'register'

export function LoginPage() {
  const { token, signIn, registerAccount } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (token) return <Navigate to="/" replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!password) {
      setError('Password is required.')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') {
        await registerAccount(email.trim(), password, name.trim() || undefined)
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : mode === 'register'
            ? 'Could not create your account.'
            : 'Could not sign you in.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            M
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Mela Sales</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'signin'
              ? 'Sign in to manage your business'
              : 'Create your account to get started'}
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Field label="Your name (optional)">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Abebe Kebede"
                  autoComplete="name"
                  autoFocus
                />
              </Field>
            )}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                autoComplete="email"
                autoFocus={mode === 'signin'}
                spellCheck={false}
              />
            </Field>
            <Field
              label="Password"
              error={error}
              hint={
                mode === 'register'
                  ? 'At least 8 characters.'
                  : undefined
              }
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
              />
            </Field>

            <Button type="submit" busy={busy} className="w-full">
              {mode === 'register' ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-600">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                  onClick={() => switchMode('register')}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </Card>

        {import.meta.env.DEV && (
          <p className="mt-4 text-center text-xs text-slate-400">
            <Link to="/login/dev" className="hover:text-slate-500">
              Developer token login
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
