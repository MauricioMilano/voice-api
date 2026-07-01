import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, Wallet as WalletApi, type LedgerEntry, type Wallet as WalletType } from '../lib/api'
import { useAuth } from '../lib/auth'

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function fmtVox(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

function reasonLabel(r: string) {
  switch (r) {
    case 'trial': return 'Trial grátis'
    case 'admin_grant': return 'Concessão admin'
    case 'admin_adjust': return 'Ajuste admin'
    case 'stt_consumption': return 'STT (transcrição)'
    case 'tts_consumption': return 'TTS (síntese)'
    default: return r
  }
}

const STT_VOX_PER_MINUTE = 10
const TTS_VOX_PER_KCHAR = 100

function sttMinutes(vox: number) {
  return (vox / STT_VOX_PER_MINUTE).toFixed(1)
}
function ttsChars(vox: number) {
  return new Intl.NumberFormat('pt-BR').format(vox * (1000 / TTS_VOX_PER_KCHAR))
}

export default function Billing() {
  const { user } = useAuth()
  const [wallet, setWallet] = useState<WalletType | null>(null)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [reason, setReason] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const reload = () => {
    WalletApi.get().then(setWallet).catch(e => setErr(errMessage(e)))
    WalletApi.ledger(50, 0, reason || undefined).then(setEntries).catch(e => setErr(errMessage(e)))
  }
  useEffect(reload, [reason])

  const lowBalance = wallet !== null && wallet.balance_vox > 0 && wallet.balance_vox < 50
  const noBalance = wallet !== null && wallet.balance_vox === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Vox</h1>
        <p className="text-sm text-zinc-400">
          Saldo e histórico de Vox. 1 Vox = R$ 0,01. Custo: STT 10 Vox/min · TTS 100 Vox/1.000 chars.
        </p>
      </div>

      {err && <div className="card text-red-300 text-sm">{err}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card md:col-span-1">
          <div className="text-xs uppercase tracking-wider text-zinc-400">Saldo atual</div>
          <div className="mt-1 text-5xl font-semibold text-accent-400">
            {fmtVox(wallet?.balance_vox ?? 0)}
            <span className="text-base text-zinc-400 ml-2 font-normal">Vox</span>
          </div>
          <div className="mt-1 text-xs text-zinc-500">≈ R$ {((wallet?.balance_vox ?? 0) / 100).toFixed(2)}</div>

          {noBalance && (
            <div className="mt-3 text-xs text-red-300">
              Saldo zerado — próximas chamadas vão retornar erro 402.
            </div>
          )}
          {lowBalance && !noBalance && (
            <div className="mt-3 text-xs text-amber-300">
              Saldo baixo — considere pedir mais créditos.
            </div>
          )}
        </div>

        <div className="card">
          <div className="text-xs uppercase tracking-wider text-zinc-400">Equivalente STT</div>
          <div className="mt-1 text-2xl font-semibold">~{sttMinutes(wallet?.balance_vox ?? 0)} min</div>
          <div className="mt-1 text-xs text-zinc-500">de transcrição de áudio</div>
        </div>

        <div className="card">
          <div className="text-xs uppercase tracking-wider text-zinc-400">Equivalente TTS</div>
          <div className="mt-1 text-2xl font-semibold">~{ttsChars(wallet?.balance_vox ?? 0)} chars</div>
          <div className="mt-1 text-xs text-zinc-500">de síntese de voz</div>
        </div>
      </div>

      <div className="card border-amber-500/40 bg-amber-500/5">
        <div className="text-sm font-medium text-amber-300">Como conseguir mais Vox?</div>
        <p className="mt-1 text-sm text-zinc-300">
          Créditos Vox são concedidos pelo administrador do gateway. Entre em contato e peça uma recarga —
          informe quantos minutos de transcrição você precisa por mês e o admin credita direto na sua conta.
        </p>
        {user?.email && (
          <div className="mt-2 text-xs text-zinc-400">
            Sua conta: <span className="font-mono text-zinc-200">{user.email}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-zinc-400">Total creditado</div>
          <div className="text-xl font-semibold text-emerald-300">
            +{fmtVox(wallet?.lifetime_vox_credited ?? 0)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-400">Total consumido</div>
          <div className="text-xl font-semibold text-amber-300">
            -{fmtVox(wallet?.lifetime_vox_consumed ?? 0)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-400">STT Vox/min</div>
          <div className="text-xl font-semibold">{STT_VOX_PER_MINUTE}</div>
        </div>
        <div className="card">
          <div className="text-xs text-zinc-400">TTS Vox/1k chars</div>
          <div className="text-xl font-semibold">{TTS_VOX_PER_KCHAR}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Histórico (ledger)</div>
          <select className="input !w-auto" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">Todos os motivos</option>
            <option value="trial">Trial grátis</option>
            <option value="admin_grant">Concessão admin</option>
            <option value="admin_adjust">Ajuste admin</option>
            <option value="stt_consumption">STT</option>
            <option value="tts_consumption">TTS</option>
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-400">
            <tr>
              <th className="py-2">Quando</th>
              <th className="py-2">Motivo</th>
              <th className="py-2 text-right">Vox</th>
              <th className="py-2 text-right">Saldo após</th>
              <th className="py-2">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {entries.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-zinc-500">Nenhuma movimentação.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id}>
                <td className="py-2 text-zinc-400">{fmt(e.occurred_at)}</td>
                <td className="py-2">
                  <span className={
                    e.delta_vox > 0 ? 'pill-green' : 'pill-red'
                  }>{reasonLabel(e.reason)}</span>
                </td>
                <td className={`py-2 text-right font-mono ${e.delta_vox > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {e.delta_vox > 0 ? '+' : ''}{e.delta_vox}
                </td>
                <td className="py-2 text-right text-zinc-300 font-mono">{e.balance_after}</td>
                <td className="py-2 text-zinc-500 text-xs">{e.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d: any = e.detail
    if (d && typeof d === 'object' && typeof d.detail === 'string') return d.detail
    return typeof d === 'string' ? d : e.message
  }
  return (e as Error)?.message || 'Request failed'
}
