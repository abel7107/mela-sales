import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'

export function DevLoginPage() {
  const { token, login, loading } = useAuth()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (token && !loading) return <Navigate to="/dashboard" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Paste a JWT access token first.')
      return
    }
    if (trimmed.split('.').length !== 3) {
      setError('That does not look like a JWT (expected 3 dot-separated parts).')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await login(trimmed)
      navigate('/businesses', { replace: true })
    } catch {
      setError('Could not start a session with that token.')
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
            Sign in with a dev access token
          </p>
        </div>

        <Card className="p-6">
          <ol className="mb-5 space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <li>
              <span className="font-medium text-slate-800">1.</span> Start the
              API: <code className="rounded bg-slate-200 px-1">cd backend
              && npm run dev</code>
            </li>
            <li>
              <span className="font-medium text-slate-800">2.</span> Mint a
              token: <code className="rounded bg-slate-200 px-1">npm run
              dev:auth -- --user your-name</code> (leave it running)
            </li>
            <li>
              <span className="font-medium text-slate-800">3.</span> Copy the
              printed <code className="rounded bg-slate-200 px-1">MELA_AUTH_*</code>{' '}
              lines into <code className="rounded bg-slate-200 px-1">backend/.env</code>{' '}
              and restart the API, then paste the token below.
            </li>
          </ol>

          <form onSubmit={submit} className="space-y-4">
            <Field
              label="Access token"
              error={error}
              hint="Stored in this browser only (localStorage). Never sent anywhere except the local API."
            >
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIs…"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" busy={busy} className="w-full">
              Continue
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-400">
          Development only — for curl/API testing with{' '}
          <code className="rounded bg-slate-200 px-1">npm run dev:auth</code>.
          Prefer the normal{' '}
          <Link to="/login" className="hover:text-slate-500">
            sign-in page
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
