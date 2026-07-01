import { useEffect, useState, type FormEvent } from 'react'
import { Admin, ApiError, type AdminBulkGrantResultItem, type AdminGrant, type AdminUser } from '../lib/api'
import { useAuth } from '../lib/auth'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function fmtVox(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d: any = e.detail
    if (d && typeof d === 'object' && typeof d.detail === 'string') return d.detail
    return typeof d === 'string' ? d : e.message
  }
  return (e as Error)?.message || 'Request failed'
}

const PRESETS = [
  { label: '500 Vox (≈ 50 min STT)',  value: 500 },
  { label: '1.000 Vox (≈ 1h40 STT)', value: 1000 },
  { label: '5.000 Vox (≈ 8h STT)',   value: 5000 },
  { label: '10.000 Vox (≈ 16h STT)', value: 10000 },
]

export default function AdminCredits() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [grants, setGrants] = useState<AdminGrant[]>([])

  // Single grant form
  const [email, setEmail] = useState('')
  const [vox, setVox] = useState(1000)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Bulk grant
  const [bulkText, setBulkText] = useState('user1@example.com 1000\nuser2@example.com 2000 Renovação')
  const [bulkResults, setBulkResults] = useState<AdminBulkGrantResultItem[] | null>(null)

  const reload = () => {
    Admin.listUsers().then(setUsers).catch(e => setErr(errMessage(e)))
    Admin.listGrants(50).then(setGrants).catch(e => setErr(errMessage(e)))
  }
  useEffect(reload, [])

  if (user && !user.is_admin) {
    return (
      <div className="card text-amber-300 text-sm">
        Esta página é restrita ao admin do gateway.
      </div>
    )
  }

  const onGrant = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null); setOk(null); setBulkResults(null)
    try {
      const r = await Admin.grantVox(email.trim().toLowerCase(), vox, note.trim() || undefined)
      setOk(`Grant #${r.id} criado: +${r.vox_amount} Vox para ${email}.`)
      setEmail(''); setNote(''); setVox(1000)
      reload()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const onBulk = async () => {
    setBusy(true); setErr(null); setOk(null)
    try {
      const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
      const grants = lines.map(line => {
        const parts = line.split(/\s+/)
        const user_email = parts[0]
        const vox_amount = parseInt(parts[1] || '0', 10)
        const note = parts.slice(2).join(' ') || undefined
        return { user_email, vox_amount, note }
      }).filter(g => g.user_email && g.vox_amount > 0)

      const r = await Admin.grantBulk(grants)
      setBulkResults(r.results)
      reload()
    } catch (e) {
      setErr(errMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin · Créditos Vox</h1>
        <p className="text-sm text-zinc-400">
          Conceda Vox para usuários. Cada grant gera um registro imutável no ledger.
        </p>
      </div>

      {err && <div className="card text-red-300 text-sm">{err}</div>}
      {ok && <div className="card text-emerald-300 text-sm">{ok}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onGrant} className="card space-y-3">
          <div className="text-base font-semibold">Concessão unitária</div>
          <div>
            <label className="label">Email do usuário</label>
            <input className="input" required type="email" value={email}
                   onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <label className="label">Quantidade de Vox</label>
            <div className="flex gap-2">
              <input className="input" required type="number" min={1} max={10_000_000}
                     value={vox} onChange={e => setVox(parseInt(e.target.value, 10) || 0)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button key={p.value} type="button"
                        className="text-xs px-2 py-1 rounded bg-ink-700 hover:bg-ink-600 text-zinc-300 border border-ink-600"
                        onClick={() => setVox(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Motivo (opcional)</label>
            <input className="input" value={note}
                   onChange={e => setNote(e.target.value)}
                   placeholder="Ex: Renovação mensal contrato WhatsApp" maxLength={500} />
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Concedendo…' : `Conceder ${vox} Vox`}
          </button>
        </form>

        <div className="card space-y-3">
          <div className="text-base font-semibold">Concessão em lote</div>
          <p className="text-xs text-zinc-400">
            Cole uma lista. Formato por linha: <code className="text-zinc-300">email quantidade motivo</code>.
            Exemplo: <code className="text-zinc-300">ze@x.com 1000 Renovação set</code>.
          </p>
          <textarea className="input min-h-[140px] font-mono text-xs"
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)} />
          <button className="btn-secondary" onClick={onBulk} disabled={busy}>
            {busy ? 'Processando…' : 'Executar lote'}
          </button>
          {bulkResults && (
            <div className="text-xs space-y-1 mt-2 max-h-48 overflow-y-auto">
              {bulkResults.map((r, i) => (
                <div key={i} className={r.status === 'ok' ? 'text-emerald-300' : 'text-red-300'}>
                  {r.status === 'ok'
                    ? `✓ ${r.user_email} → grant #${r.grant_id}`
                    : `✗ ${r.user_email} → ${r.detail}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="text-sm font-medium mb-3">Usuários ({users.length})</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2">Email</th>
              <th className="py-2">Nome</th>
              <th className="py-2">Role</th>
              <th className="py-2 text-right">Saldo</th>
              <th className="py-2 text-right">Creditado</th>
              <th className="py-2 text-right">Consumido</th>
              <th className="py-2 text-right">Criado</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {users.map(u => (
              <tr key={u.id}>
                <td className="py-2 font-mono text-xs text-zinc-300">{u.email}</td>
                <td className="py-2">{u.name}</td>
                <td className="py-2">
                  {u.is_admin
                    ? <span className="pill-accent">admin</span>
                    : <span className="pill-zinc">user</span>}
                </td>
                <td className={`py-2 text-right font-mono ${u.balance_vox === 0 ? 'text-red-300' : u.balance_vox < 50 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {fmtVox(u.balance_vox)}
                </td>
                <td className="py-2 text-right font-mono text-zinc-400">+{fmtVox(u.lifetime_vox_credited)}</td>
                <td className="py-2 text-right font-mono text-zinc-400">-{fmtVox(u.lifetime_vox_consumed)}</td>
                <td className="py-2 text-right text-zinc-500 text-xs">{fmt(u.created_at)}</td>
                <td className="py-2 text-right">
                  <button className="btn-secondary !py-1 !px-2 text-xs"
                          onClick={() => { setEmail(u.email); setVox(1000); }}>
                    Conceder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="text-sm font-medium mb-3">Últimos grants ({grants.length})</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2">#</th>
              <th className="py-2">Admin → Alvo</th>
              <th className="py-2 text-right">Vox</th>
              <th className="py-2">Motivo</th>
              <th className="py-2">Quando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {grants.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-zinc-500">Nenhum grant ainda.</td></tr>
            )}
            {grants.map(g => (
              <tr key={g.id}>
                <td className="py-2 text-zinc-500 text-xs">#{g.id}</td>
                <td className="py-2 text-xs text-zinc-300">
                  admin #{g.admin_user_id} → user #{g.target_user_id}
                </td>
                <td className="py-2 text-right font-mono text-emerald-300">+{fmtVox(g.vox_amount)}</td>
                <td className="py-2 text-zinc-300 text-xs">{g.note ?? '—'}</td>
                <td className="py-2 text-zinc-400 text-xs">{fmt(g.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
