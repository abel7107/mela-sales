import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { authForgotPassword, authResetPassword } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'

type Mode = 'signin' | 'register' | 'forgot' | 'reset'

export function LoginPage() {
  const { token, signIn, registerAccount } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (token) return <Navigate to="/" replace />

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setInfo(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'forgot') {
        if (!email.trim()) {
          setError('Email is required.')
          setBusy(false)
          return
        }
        const res = await authForgotPassword({ email: email.trim() })
        const token = res?.resetToken
        if (token) {
          setResetToken(token)
          setInfo('Reset token generated (dev). Use it below to set a new password.')
          setMode('reset')
        } else {
          setInfo('If an account with that email exists, a reset link has been sent.')
        }
      } else if (mode === 'reset') {
        if (!resetToken.trim()) {
          setError('Reset token is required.')
          setBusy(false)
          return
        }
        if (!newPassword || newPassword.length < 8) {
          setError('Password must be at least 8 characters.')
          setBusy(false)
          return
        }
        await authResetPassword({ token: resetToken.trim(), password: newPassword })
        setInfo('Password reset successfully. You can now sign in.')
        setMode('signin')
        setPassword('')
        setNewPassword('')
        setResetToken('')
      } else {
        if (!email.trim()) {
          setError('Email is required.')
          setBusy(false)
          return
        }
        if (!password) {
          setError('Password is required.')
          setBusy(false)
          return
        }
        if (mode === 'register' && password.length < 8) {
          setError('Password must be at least 8 characters.')
          setBusy(false)
          return
        }
        if (mode === 'register') {
          await registerAccount(email.trim(), password, name.trim() || undefined)
        } else {
          await signIn(email.trim(), password)
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : mode === 'forgot'
            ? 'Could not process your request.'
            : mode === 'reset'
              ? 'Could not reset your password.'
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
              : mode === 'register'
                ? 'Create your account to get started'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : 'Choose a new password'}
          </p>
        </div>

        <Card className="p-6">
          {info && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}
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
            {(mode === 'signin' || mode === 'register' || mode === 'forgot') && (
              <Field label="Email" error={mode === 'forgot' ? error ?? undefined : undefined}>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                  autoComplete="email"
                  autoFocus={mode === 'signin' || mode === 'forgot'}
                  spellCheck={false}
                />
              </Field>
            )}
            {(mode === 'signin' || mode === 'register') && (
              <Field
                label="Password"
                error={error}
                hint={
                  mode === 'register'
                    ? 'At least 8 characters.'
                    : undefined
                }
              >
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    className="pr-16"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </Field>
            )}
            {mode === 'reset' && (
              <>
                <Field label="Reset token">
                  <Input
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="paste reset token"
                    autoFocus
                  />
                </Field>
                <Field label="New password" error={error} hint="At least 8 characters.">
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pr-16"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-700"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                    </button>
                  </div>
                </Field>
              </>
            )}

            <Button type="submit" busy={busy} className="w-full">
              {mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'reset'
                    ? 'Reset password'
                    : 'Sign in'}
            </Button>
          </form>

          {mode === 'signin' && (
            <p className="mt-2 text-center text-sm">
              <button
                type="button"
                className="font-medium text-indigo-600 hover:text-indigo-500"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
            </p>
          )}
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
            ) : mode === 'forgot' || mode === 'reset' ? (
              <>
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                  onClick={() => switchMode('signin')}
                >
                  Back to sign in
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
