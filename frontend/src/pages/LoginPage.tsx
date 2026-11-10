import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { authForgotPassword, authResetPassword } from '../api/endpoints'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'
import { Logo } from '../components/Logo'
import { useLanguage } from '../i18n/LanguageContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
type Mode = 'signin' | 'register' | 'forgot' | 'reset'

export function LoginPage() {
  
  const { token, signIn, registerAccount } = useAuth()
  const { t } = useLanguage()
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

  if (token) return <Navigate to="/dashboard" replace />

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
          setError(t('emailRequired'))
          setBusy(false)
          return
        }
        const res = await authForgotPassword({ email: email.trim() })
        const token = res?.resetToken
        if (token) {
          setResetToken(token)
          setInfo(t('resetTokenGenerated'))
          setMode('reset')
        } else {
          setInfo(t('resetEmailSent'))
        }
      } else if (mode === 'reset') {
        if (!resetToken.trim()) {
          setError(t('resetTokenRequired'))
          setBusy(false)
          return
        }
        if (!newPassword || newPassword.length < 8) {
          setError(t('passwordTooShort'))
          setBusy(false)
          return
        }
        await authResetPassword({ token: resetToken.trim(), password: newPassword })
        setInfo(t('passwordResetSuccess'))
        setMode('signin')
        setPassword('')
        setNewPassword('')
        setResetToken('')
      } else {
        if (!email.trim()) {
          setError(t('emailRequired'))
          setBusy(false)
          return
        }
        if (!password) {
          setError(t('passwordRequired'))
          setBusy(false)
          return
        }
        if (mode === 'register' && password.length < 8) {
          setError(t('passwordTooShort'))
          setBusy(false)
          return
        }
        if (mode === 'register') {
          await registerAccount(email.trim(), password, name.trim() || undefined)
        } else {
          await signIn(email.trim(), password)
        }
        setEmail('')
        setPassword('')
        setName('')
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : mode === 'forgot'
            ? t('requestFailed')
            : mode === 'reset'
              ? t('resetFailed')
              : mode === 'register'
                ? t('registrationFailed')
                : t('signInFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-800 px-4 py-10">
     <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-lg">
              <div className="mb-3 flex justify-center">
        <Logo />
      </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {mode === 'signin'
  ? t('loginDescription')
  : mode === 'register'
    ? t('registerDescription')
    : mode === 'forgot'
      ? t('forgotDescription')
      : t('resetDescription')}
          </p>

        <Card className="p-6">
          {info && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <Field label={t('yourName')}>
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
              <Field label={t('email')} error={mode === 'forgot' ? error ?? undefined : undefined}>
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
                label={t('password')}
                error={error}
                hint={
                  mode === 'register'
                    ? t('passwordHint')
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
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
                <Field label={t('resetToken')}>
                  <Input
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder={t('pasteResetToken')}
                    autoFocus
                  />
                </Field>
                <Field label={t('newPassword')} error={error} hint={t('passwordHint')}>
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
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
                  ? t('createAccount')
                  : mode === 'forgot'
                    ? t('sendResetLink')
                    : mode === 'reset'
                      ? t('resetPassword')
                      : t('login')}
            </Button>
          </form>

          {mode === 'signin' && (
            <p className="mt-2 text-center text-sm">
              <button
                type="button"
                className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                onClick={() => switchMode('forgot')}
              >
                {t('forgotPassword')}
              </button>
            </p>
          )}
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-300">
            {mode === 'signin' ? (
              <>
               {t('newHere')}
                <button
                  type="button"
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                  onClick={() => switchMode('register')}
                >
                  {t('createAnAccount')}
                </button>
              </>
            ) : mode === 'forgot' || mode === 'reset' ? (
              <>
                <button
                  type="button"
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                  onClick={() => switchMode('signin')}
                >
                  {t('alreadyHaveAccount')}
                </button>
              </>
            ) : (
              <>
               {t('alreadyHaveAccount')}
                <button
                  type="button"
                  className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
                  onClick={() => switchMode('signin')}
                >
                  {t('backToSignIn')}
                </button>
              </>
            )}
          </p>
        </Card>

        {import.meta.env.DEV && (
          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            <Link to="/login/dev" className="hover:text-slate-500 dark:text-slate-400">
              {t('developerTokenLogin')}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
