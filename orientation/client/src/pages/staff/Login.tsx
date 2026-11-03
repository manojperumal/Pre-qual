import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setDevStaffToken, supabase } from '@/lib/supabase'
import { ErrorNote, MojoMark, Spinner } from '@/components/ui'

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/staff'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [devToken, setDevToken] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <MojoMark className="text-lg" />
        <h1 className="mt-4 text-xl font-bold">Orientation — staff sign in</h1>
        <p className="mt-1 text-sm text-gray-600">Use your Safety Mojo account (same as Pre-Qual).</p>
        <div className="mt-4">
          <ErrorNote error={error} />
        </div>
        {supabase ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError(null)
              const { error } = await supabase!.auth.signInWithPassword({ email, password })
              setBusy(false)
              if (error) setError(error)
              else navigate(next, { replace: true })
            }}
          >
            <div>
              <label className="label">Email</label>
              <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />} Sign in
            </button>
          </form>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setDevStaffToken(devToken.trim())
              navigate(next, { replace: true })
            }}
          >
            <p className="rounded bg-yellow-50 p-2 text-xs text-yellow-900">
              Supabase is not configured (VITE_SUPABASE_URL). For local development, paste a staff access token (see orientation/README.md).
            </p>
            <textarea className="input-field font-mono text-xs" rows={4} value={devToken} onChange={(e) => setDevToken(e.target.value)} required />
            <button className="btn-primary w-full">Continue</button>
          </form>
        )}
      </div>
    </div>
  )
}
