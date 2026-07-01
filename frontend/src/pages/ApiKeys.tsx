import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, Keys, type ApiKey, type ApiKeyCreated } from '../lib/api'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d: any = e.detail
    if (d && typeof d === 'object' && typeof d.detail === 'string') return d.detail
    return typeof d === 'string' ? d : e.message
  }
  return (e as Error)?.message || 'Request failed'
}

export default function ApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState('stt:transcribe')
  const [revealed, setRevealed] = useState<ApiKeyCreated | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = () => Keys.list().then(setKeys).catch(e => setErr(errMessage(e)))

  useEffect(() => { reload() }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const created = await Keys.create(name.trim(), scopes.split(',').map(s => s.trim()).filter(Boolean))
      setRevealed(created)
      setName('')
      await reload()
    } catch (e) {
      setErr(errMessage(e))
    } finally { setBusy(false) }
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this key? It cannot be undone.')) return
    await Keys.revoke(id).catch(e => setErr(errMessage(e)))
    reload()
  }
  const rotate = async (id: number) => {
    try {
      const created = await Keys.rotate(id)
      setRevealed(created); reload()
    } catch (e) { setErr(errMessage(e)) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <p className="text-sm text-zinc-400">Mint and revoke API keys. The full key is shown only once.</p>
      </div>

      {revealed && (
        <div className="card border-amber-500/40 bg-amber-500/5">
          <div className="text-sm font-medium text-amber-300">Save this key now — it won't be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-ink-800 px-3 py-2 rounded break-all">{revealed.key}</code>
            <button className="btn-secondary"
                    onClick={() => navigator.clipboard.writeText(revealed.key)}>Copy</button>
          </div>
          <button className="mt-3 text-xs text-zinc-400 hover:text-zinc-200"
                  onClick={() => setRevealed(null)}>Dismiss</button>
        </div>
      )}

      <form onSubmit={create} className="card grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={e => setName(e.target.value)}
                 placeholder="e.g. prod-mobile" />
        </div>
        <div>
          <label className="label">Scopes (comma-separated)</label>
          <input className="input" value={scopes} onChange={e => setScopes(e.target.value)}
                 placeholder="stt:transcribe, tts:synthesize" />
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create key'}</button>
      </form>

      {err && <div className="card text-red-300 text-sm">{err}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2">Name</th>
              <th className="py-2">Prefix</th>
              <th className="py-2">Scopes</th>
              <th className="py-2">Status</th>
              <th className="py-2">Last used</th>
              <th className="py-2">Created</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {keys.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-zinc-500">No keys yet.</td></tr>
            )}
            {keys.map(k => (
              <tr key={k.id} className="text-zinc-200">
                <td className="py-2.5 font-medium">{k.name}</td>
                <td className="py-2.5 font-mono text-xs text-zinc-400">{k.prefix}…</td>
                <td className="py-2.5">
                  {k.scopes.length === 0
                    ? <span className="pill-accent">all</span>
                    : k.scopes.map(s => <span key={s} className="pill-zinc mr-1">{s}</span>)}
                </td>
                <td className="py-2.5">
                  {k.is_active
                    ? <span className="pill-green">● active</span>
                    : <span className="pill-red">● revoked</span>}
                </td>
                <td className="py-2.5 text-zinc-400">{fmt(k.last_used_at)}</td>
                <td className="py-2.5 text-zinc-400">{fmt(k.created_at)}</td>
                <td className="py-2.5 text-right space-x-2">
                  {k.is_active && (
                    <>
                      <button className="btn-secondary !py-1 !px-2 text-xs" onClick={() => rotate(k.id)}>Rotate</button>
                      <button className="btn-danger !py-1 !px-2 text-xs" onClick={() => revoke(k.id)}>Revoke</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
