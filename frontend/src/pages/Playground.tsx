import { useEffect, useRef, useState } from 'react'
import { Keys, Voice, type ApiKey } from '../lib/api'

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function Playground() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [apiKey, setApiKey] = useState('')
  const [recording, setRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [recordingMs, setRecordingMs] = useState(0)
  const [transcribeMs, setTranscribeMs] = useState(0)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startTimeRef = useRef(0)     // ctx.currentTime when play() started
  const pausedAtRef = useRef(0)      // offset (in seconds) where playback paused
  const recStartRef = useRef(0)      // wall-clock ms when recording started
  const recTimerRef = useRef<number | null>(null)
  const transStartRef = useRef(0)
  const transTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => { Keys.list().then(setKeys).catch(() => null) }, [])
  useEffect(() => {
    if (!apiKey && keys.length > 0) setApiKey(keys[0].prefix + '_…') // placeholder
  }, [keys])

  // Cleanup on unmount
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (recTimerRef.current != null) window.clearInterval(recTimerRef.current)
    if (transTimerRef.current != null) window.clearInterval(transTimerRef.current)
    try { sourceRef.current?.stop() } catch {}
    ctxRef.current?.close().catch(() => null)
  }, [])

  const start = async () => {
    setErr(null); setResult(''); setPosition(0)
    setAudioBlob(null); setAudioBuffer(null); setDuration(0)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Plain audio/webm keeps the broadest decoder support. Some browsers
      // (Safari, older Edge) choke on opus-tagged webm.
      const mime = 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mime })
        console.log('[playground] recorded', blob.size, 'bytes in', chunksRef.current.length, 'chunks')
        setAudioBlob(blob)
        stream.getTracks().forEach(t => t.stop())

        if (blob.size === 0) {
          setErr('No audio captured. Check mic permission and try again.')
          return
        }

        // Decode so we can show real duration and play via Web Audio API.
        // WebM blobs from MediaRecorder don't ship EBML duration metadata,
        // so <audio controls> would show 0:00 even with valid audio.
        try {
          if (!ctxRef.current) ctxRef.current = new AudioContext()
          // decodeAudioData detaches the buffer; pass a copy to be safe.
          const buf = await blob.arrayBuffer()
          const decoded = await ctxRef.current.decodeAudioData(buf)
          setAudioBuffer(decoded)
          setDuration(decoded.duration)
          console.log('[playground] decoded duration:', decoded.duration.toFixed(2), 's')
        } catch (decErr: any) {
          console.error('[playground] decode failed:', decErr)
          setErr('Recorded audio could not be decoded: ' + (decErr?.message || decErr))
        }
      }
      // No timeslice: dataavailable fires ONCE on stop() with a single,
      // self-contained webm blob. Using timeslice fragments the stream into
      // multiple webm files concatenated together, which decodeAudioData
      // rejects. The custom Web Audio player below doesn't need streaming
      // chunks - it just needs one valid blob to decode.
      rec.start()
      mediaRef.current = rec
      setRecording(true)
      recStartRef.current = performance.now()
      setRecordingMs(0)
      recTimerRef.current = window.setInterval(() => {
        setRecordingMs(performance.now() - recStartRef.current)
      }, 100)
    } catch (e: any) {
      setErr(e?.message || 'Microphone unavailable')
    }
  }

  const stop = () => {
    mediaRef.current?.stop()
    setRecording(false)
    if (recTimerRef.current != null) {
      window.clearInterval(recTimerRef.current)
      recTimerRef.current = null
    }
    try { sourceRef.current?.stop() } catch {}
    setPlaying(false)
  }

  const togglePlay = () => {
    if (!audioBuffer || !ctxRef.current) return
    if (playing) {
      // pause
      try { sourceRef.current?.stop() } catch {}
      const elapsed = ctxRef.current.currentTime - startTimeRef.current
      pausedAtRef.current = Math.min(pausedAtRef.current + elapsed, duration)
      setPosition(pausedAtRef.current)
      setPlaying(false)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    } else {
      // play
      if (pausedAtRef.current >= duration - 0.05) pausedAtRef.current = 0
      const src = ctxRef.current.createBufferSource()
      src.buffer = audioBuffer
      src.connect(ctxRef.current.destination)
      src.onended = () => {
        // only update if WE didn't stop it (i.e. natural end)
        if (src === sourceRef.current) {
          setPlaying(false)
          pausedAtRef.current = 0
          setPosition(0)
          if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        }
      }
      src.start(0, pausedAtRef.current)
      sourceRef.current = src
      startTimeRef.current = ctxRef.current.currentTime
      setPlaying(true)
      const tick = () => {
        if (!ctxRef.current) return
        const elapsed = ctxRef.current.currentTime - startTimeRef.current
        const pos = Math.min(pausedAtRef.current + elapsed, duration)
        setPosition(pos)
        if (pos < duration) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioBuffer || !ctxRef.current) return
    const next = Number(e.target.value)
    pausedAtRef.current = next
    setPosition(next)
    if (playing) {
      try { sourceRef.current?.stop() } catch {}
      const src = ctxRef.current.createBufferSource()
      src.buffer = audioBuffer
      src.connect(ctxRef.current.destination)
      src.onended = () => {
        if (src === sourceRef.current) {
          setPlaying(false)
          pausedAtRef.current = 0
          setPosition(0)
          if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        }
      }
      src.start(0, next)
      sourceRef.current = src
      startTimeRef.current = ctxRef.current.currentTime
    }
  }

  const reset = () => {
    try { sourceRef.current?.stop() } catch {}
    setAudioBlob(null); setAudioBuffer(null)
    setDuration(0); setPosition(0); pausedAtRef.current = 0
    setPlaying(false); setResult(''); setErr(null)
  }

  const transcribe = async () => {
    if (!audioBlob || !apiKey || apiKey.endsWith('_…')) {
      setErr('Pick or paste a full API key first.')
      return
    }
    setBusy(true); setErr(null); setResult('')
    transStartRef.current = performance.now()
    setTranscribeMs(0)
    transTimerRef.current = window.setInterval(() => {
      setTranscribeMs(performance.now() - transStartRef.current)
    }, 100)
    try {
      const out = await Voice.stt(apiKey, audioBlob)
      setResult(out.text)
    } catch (e: any) {
      setErr(e?.message || 'Transcription failed')
    } finally {
      setBusy(false)
      if (transTimerRef.current != null) {
        window.clearInterval(transTimerRef.current)
        transTimerRef.current = null
      }
    }
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
            : (
              <button className="btn-danger" onClick={stop}>
                ■ Stop <span className="ml-2 font-mono text-xs">{(recordingMs / 1000).toFixed(1)}s</span>
              </button>
            )}
          <button className="btn-secondary" disabled={!audioBlob || busy} onClick={transcribe}>
            {busy ? `Transcribing… ${(transcribeMs / 1000).toFixed(1)}s` : 'Transcribe'}
          </button>
          {audioBlob && !recording && (
            <button className="btn-secondary" onClick={reset}>Reset</button>
          )}
        </div>

        {audioBlob && (
          <div className="rounded-lg bg-ink-800/40 border border-ink-800 p-3 space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={!audioBuffer}
                className="btn-primary !py-1 !px-3 text-sm disabled:opacity-50"
              >
                {playing ? '❚❚ Pause' : '▶ Play'}
              </button>
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                {fmt(position)} / {fmt(duration)}
              </span>
              <span className="text-xs text-zinc-500">
                {(audioBlob.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.001)}
              step={0.01}
              value={Math.min(position, duration)}
              onChange={seek}
              disabled={!audioBuffer}
              className="w-full accent-accent-500 disabled:opacity-50"
            />
            {!audioBuffer && !err && (
              <div className="text-xs text-zinc-500">Decoding audio…</div>
            )}
          </div>
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
