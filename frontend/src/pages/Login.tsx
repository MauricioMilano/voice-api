import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await login(email, password)
      nav('/')
    } catch (e: any) {
      setErr(e?.message || 'Login failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-ink-950">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-xl font-semibold">Welcome back</div>
          <div className="text-sm text-zinc-400">Sign in to your VoiceAPI dashboard.</div>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email}
                 onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={password}
                 onChange={e => setPassword(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="text-sm text-center text-zinc-400">
          No account? <Link to="/register" className="text-accent-400 hover:underline">Create one</Link>
        </div>
      </form>
    </div>
  )
}
