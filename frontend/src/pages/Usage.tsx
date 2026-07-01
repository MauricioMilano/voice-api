import { useEffect, useState } from 'react'
import { Usage as UsageApi, type UsageLog, type UsageSummary } from '../lib/api'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

export default function Usage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [endpoint, setEndpoint] = useState<string>('')

  useEffect(() => {
    UsageApi.summary(30).then(setSummary)
  }, [])
  useEffect(() => {
    UsageApi.logs(100, 0, endpoint || undefined).then(setLogs)
  }, [endpoint])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-zinc-400">Per-request logs across all your API keys (last 30 days).</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card"><div className="text-xs text-zinc-400">Requests</div><div className="text-2xl font-semibold">{summary?.total_requests ?? 0}</div></div>
        <div className="card"><div className="text-xs text-zinc-400">Bytes in</div><div className="text-2xl font-semibold">{(summary?.total_bytes_in ?? 0).toLocaleString()}</div></div>
        <div className="card"><div className="text-xs text-zinc-400">Bytes out</div><div className="text-2xl font-semibold">{(summary?.total_bytes_out ?? 0).toLocaleString()}</div></div>
        <div className="card"><div className="text-xs text-zinc-400">Audio seconds</div><div className="text-2xl font-semibold">{Math.round(summary?.total_units ?? 0)}</div></div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Recent requests</div>
          <select className="input !w-auto" value={endpoint} onChange={e => setEndpoint(e.target.value)}>
            <option value="">All endpoints</option>
            <option value="/v1/stt">/v1/stt</option>
            <option value="/v1/tts">/v1/tts</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2">When</th>
              <th className="py-2">Endpoint</th>
              <th className="py-2">Status</th>
              <th className="py-2">Duration</th>
              <th className="py-2">Bytes in</th>
              <th className="py-2">Bytes out</th>
              <th className="py-2">Units</th>
              <th className="py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {logs.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-zinc-500">No usage yet.</td></tr>
            )}
            {logs.map(l => (
              <tr key={l.id}>
                <td className="py-2 text-zinc-400">{fmt(l.created_at)}</td>
                <td className="py-2 font-mono text-xs">{l.endpoint}</td>
                <td className="py-2">
                  <span className={l.status_code < 400 ? 'pill-green' : 'pill-red'}>
                    {l.status_code}
                  </span>
                </td>
                <td className="py-2 text-zinc-400">{l.duration_ms} ms</td>
                <td className="py-2 text-zinc-400">{l.bytes_in.toLocaleString()}</td>
                <td className="py-2 text-zinc-400">{l.bytes_out.toLocaleString()}</td>
                <td className="py-2 text-zinc-400">{l.units.toFixed(2)}</td>
                <td className="py-2 text-red-300 text-xs">{l.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
