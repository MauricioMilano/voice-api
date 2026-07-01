    const examples = [
      {
        title: 'Transcribe an audio file (curl)',
        lang: 'bash',
        code: `curl -X POST https://YOUR-HOST/v1/stt \
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx" \
  -F "audio=@sample.webm"`,
      },
      {
        title: 'Transcribe (JavaScript / fetch)',
        lang: 'javascript',
        code: `const form = new FormData()
form.append('audio', audioBlob, 'recording.webm')

const res = await fetch('https://YOUR-HOST/v1/stt', {
  method: 'POST',
  headers: { 'X-API-Key': 'vk_live_xxxxxxxxxxxxxxxxxxxxx' },
  body: form,
})
const { text, words, model } = await res.json()`,
      },
      {
        title: 'Synthesize speech',
        lang: 'bash',
        code: `curl -X POST https://YOUR-HOST/v1/tts \
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx" \
  -F "text=Olá, bem-vindo!" \
  -F "voice=pt_BR-faber-medium"`,
      },
      {
        title: 'List voices',
        lang: 'bash',
        code: `curl https://YOUR-HOST/v1/voices \
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx"`,
      },
    ]

    export default function Docs() {
      return (
        <div className="space-y-6 max-w-3xl">
          <div>
            <h1 className="text-2xl font-semibold">API Reference</h1>
            <p className="text-sm text-zinc-400">
              Endpoints accept <code className="text-accent-400">X-API-Key</code> or
              <code className="text-accent-400 ml-1">Authorization: Bearer &lt;key&gt;</code>.
              All voice endpoints are under <code className="text-accent-400">/v1</code>.
            </p>
          </div>

          <div className="card space-y-3">
            <div className="text-base font-semibold">POST /v1/stt</div>
            <p className="text-sm text-zinc-400">Speech-to-text. Audio in (multipart <code>audio</code>) → JSON transcript.</p>
            <div className="text-xs text-zinc-500">Model: <span className="text-zinc-300">whisper-large-v3-turbo</span> via faster-whisper.</div>
            <div className="text-sm font-medium">Response</div>
            <pre className="text-xs bg-ink-800/70 rounded-lg p-3 overflow-x-auto">{`{
  "text": "olá bem-vindo ao voice api",
  "words": [{ "word": "olá", "start": 0.0, "end": 0.42, "probability": 0.99 }],
  "language": "pt",
  "duration": 2.34,
  "model": "whisper-large-v3-turbo"
}`}</pre>
          </div>

          <div className="card space-y-3">
            <div className="text-base font-semibold">POST /v1/tts</div>
            <p className="text-sm text-zinc-400">Text-to-speech. Form fields <code>text</code> and optional <code>voice</code>.</p>
            <pre className="text-xs bg-ink-800/70 rounded-lg p-3 overflow-x-auto">{`{
  "audio_base64": "UklGRiQ…",
  "format": "wav",
  "voice": "pt_BR-faber-medium",
  "model": "piper-tts",
  "timings": [{ "word": "Olá", "start": 0.0, "end": 0.5 }]
}`}</pre>
          </div>

          <div className="card space-y-3">
            <div className="text-base font-semibold">GET /v1/voices</div>
            <p className="text-sm text-zinc-400">Lists all available TTS voices installed on the sidecar.</p>
          </div>

          <div className="space-y-3">
            <div className="text-lg font-semibold">Examples</div>
            {examples.map(ex => (
              <div key={ex.title} className="card">
                <div className="text-sm font-medium mb-2">{ex.title}</div>
                <pre className="text-xs bg-ink-800/70 rounded-lg p-3 overflow-x-auto whitespace-pre">{ex.code}</pre>
              </div>
            ))}
          </div>
        </div>
      )
    }
