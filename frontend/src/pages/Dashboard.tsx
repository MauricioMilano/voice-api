import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Meta, Usage, Wallet as WalletApi, type UsageSummary, type Wallet as WalletType } from '../lib/api'

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof Meta.get>> | null>(null)
  const [wallet, setWallet] = useState<WalletType | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Usage.summary(30).then(setSummary).catch(e => setErr(e.message))
    Meta.get().then(setMeta).catch(() => null)
    WalletApi.get().then(setWallet).catch(() => null)
  }, [])

  const successRate = summary && (summary.success_count + summary.error_count) > 0
    ? Math.round((summary.success_count / (summary.success_count + summary.error_count)) * 100)
    : 100

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-400">Last 30 days · model: {meta?.stt_model ?? '…'}</p>
        </div>
        <Link to="/keys" className="btn-primary">Create API key</Link>
      </div>

      {err && <div className="card text-red-300 text-sm">{err}</div>}

      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-400">Saldo Vox</div>
          <div className="mt-1 text-4xl font-semibold text-accent-400">
            {(wallet?.balance_vox ?? 0).toLocaleString('pt-BR')}
            <span className="text-base text-zinc-400 ml-2 font-normal">Vox</span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            ≈ R$ {((wallet?.balance_vox ?? 0) / 100).toFixed(2)} ·
            <span className="text-emerald-300"> +{(wallet?.lifetime_vox_credited ?? 0).toLocaleString('pt-BR')} creditado</span> ·
            <span className="text-amber-300"> -{(wallet?.lifetime_vox_consumed ?? 0).toLocaleString('pt-BR')} consumido</span>
          </div>
        </div>
        <Link to="/billing" className="btn-secondary">Ver billing</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Requests" value={(summary?.total_requests ?? 0).toLocaleString()} />
        <Stat label="Audio seconds (STT)" value={Math.round(summary?.total_units ?? 0).toLocaleString()} />
        <Stat label="Success rate" value={`${successRate}%`} />
        <Stat label="Errors" value={(summary?.error_count ?? 0).toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-sm font-medium mb-3">Requests by endpoint</div>
          {summary && Object.keys(summary.per_endpoint).length > 0 ? (
            <ul className="space-y-2 text-sm">
              {Object.entries(summary.per_endpoint).map(([ep, n]) => (
                <li key={ep} className="flex items-center justify-between">
                  <span className="font-mono text-zinc-300">{ep}</span>
                  <span className="text-zinc-400">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-zinc-500">No traffic yet. Create an API key and call /v1/stt.</div>
          )}
        </div>

        <div className="card">
          <div className="text-sm font-medium mb-3">Quick start</div>
          <pre className="text-xs bg-ink-800/70 rounded-lg p-3 overflow-x-auto">
{`curl -X POST http://localhost:8080/v1/stt \
  -H "X-API-Key: vk_live_…" \
  -F "audio=@sample.webm"`}
          </pre>
          <div className="mt-3 text-xs text-zinc-400">
            See <Link to="/docs" className="text-accent-400 hover:underline">Docs</Link> or try the
            <Link to="/playground" className="text-accent-400 hover:underline ml-1">Playground</Link>.
          </div>
        </div>
      </div>
    </div>
  )
}
