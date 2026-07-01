import { useEffect, useRef, useState } from 'react'
import { Keys, Voice, type ApiKey } from '../lib/api'

export default function Playground() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [apiKey, setApiKey] = useState('')
  const [recording, setRecording] = useState(false)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [result, setResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => { Keys.list().then(setKeys).catch(() => null) }, [])
  useEffect(() => {
    if (!apiKey && keys.length > 0) setApiKey(keys[0].prefix + '_…') // placeholder
  }, [keys])

  const start = async () => {
    setErr(null); setResult('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioURL(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      rec.start()
      mediaRef.current = rec
      setRecording(true)
    } catch (e: any) {
      setErr(e?.message || 'Microphone unavailable')
    }
  }

  const stop = () => {
    mediaRef.current?.stop()
    setRecording(false)
  }

  const transcribe = async () => {
    if (!audioURL || !apiKey || apiKey.endsWith('_…')) {
      setErr('Pick or paste a full API key first.')
      return
    }
    setBusy(true); setErr(null); setResult('')
    try {
      const blob = await fetch(audioURL).then(r => r.blob())
      const out = await Voice.stt(apiKey, blob)
      setResult(out.text)
    } catch (e: any) {
      setErr(e?.message || 'Transcription failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Playground</h1>
        <p className="text-sm text-zinc-400">Record from your mic and transcribe with whisper-large-v3-turbo.</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">API key</label>
          <select className="input" value={apiKey} onChange={e => setApiKey(e.target.value)}>
            <option value="">Select a key…</option>
            {keys.filter(k => k.is_active).map(k => (
              <option key={k.id} value={`${k.prefix}_placeholder`}>
                {k.name} ({k.prefix}…)
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500 mt-2">
            Paste the full secret here (the dashboard only shows the prefix for security):
          </p>
          <input className="input mt-2 font-mono" placeholder="vk_live_xxxxxxxxxxxxx_yyyyy"
                 value={apiKey.endsWith('_…') || apiKey.endsWith('_placeholder') ? '' : apiKey}
                 onChange={e => setApiKey(e.target.value)} />
        </div>

        <div className="flex items-center gap-3">
          {!recording
            ? <button className="btn-primary" onClick={start}>● Record</button>
            : <button className="btn-danger" onClick={stop}>■ Stop</button>}
          <button className="btn-secondary" disabled={!audioURL || busy} onClick={transcribe}>
            {busy ? 'Transcribing…' : 'Transcribe'}
          </button>
        </div>

        {audioURL && (
          <audio controls src={audioURL} className="w-full" />
        )}

        {err && <div className="text-sm text-red-300">{err}</div>}
        {result && (
          <div className="rounded-lg bg-ink-800/70 p-3 text-sm">
            <div className="text-xs uppercase tracking-wider text-zinc-400 mb-1">Transcript</div>
            {result}
          </div>
        )}
      </div>
    </div>
  )
}
