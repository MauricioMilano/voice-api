import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Register() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await register(email, name, password)
      nav('/')
    } catch (e: any) {
      setErr(e?.message || 'Registration failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-ink-950">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="text-xl font-semibold">Create your account</div>
          <div className="text-sm text-zinc-400">First registered user becomes admin.</div>
        </div>
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name}
                 onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email}
                 onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password (min 8 chars)</label>
          <input className="input" type="password" required minLength={8} value={password}
                 onChange={e => setPassword(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <div className="text-sm text-center text-zinc-400">
          Already have an account? <Link to="/login" className="text-accent-400 hover:underline">Sign in</Link>
        </div>
      </form>
    </div>
  )
}
