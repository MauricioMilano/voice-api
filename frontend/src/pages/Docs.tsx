import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Docs page — human-friendly walkthrough + machine-friendly agent instructions
 * + REST reference. Host is auto-detected from window.location so the user
 * never has to copy/paste a placeholder URL.
 */

// --- Auto-detect the API host from the browser's own URL bar -----------------
// Falls back to '' so dev mistakes surface immediately rather than silently
// pointing to "https://YOUR-HOST/".
const API_BASE: string =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : ''

const STT_URL = `${API_BASE}/v1/stt`
const TTS_URL = `${API_BASE}/v1/tts`
const VOICES_URL = `${API_BASE}/v1/voices`
const STT_MODEL_URL = `${API_BASE}/v1/stt/model`
const SWAGGER_URL = `${API_BASE}/docs`
const REDOC_URL = `${API_BASE}/redoc`
const META_URL = `${API_BASE}/api/meta`
const HEALTH_URL = `${API_BASE}/healthz`

// --- Tiny in-page copy-to-clipboard (no deps) -------------------------------
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 right-2 text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-ink-700 bg-ink-900/80 hover:bg-ink-800 text-zinc-300"
    >
      {copied ? 'copied ✓' : 'copy'}
    </button>
  )
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative">
      {lang && (
        <div className="absolute top-2 left-3 text-[10px] uppercase tracking-widest text-zinc-500">
          {lang}
        </div>
      )}
      <CopyBtn text={code} />
      <pre className="text-xs bg-ink-800/70 rounded-lg p-4 pt-6 overflow-x-auto whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// --- Tab switcher -----------------------------------------------------------
type TabKey = 'human' | 'agent' | 'reference'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'human',     label: 'Para humanos',    icon: '👤' },
  { key: 'agent',     label: 'Para agentes IA', icon: '🤖' },
  { key: 'reference', label: 'API Reference',   icon: '📚' },
]

// =============================================================================
// TAB: HUMAN — passo a passo amigável
// =============================================================================
function HumanTutorial() {
  const curlStt = `curl -X POST ${STT_URL} \\
  -H "X-API-Key: vk_live_COLE_SUA_CHAVE_AQUI" \\
  -F "audio=@minha_gravacao.webm;type=audio/webm"`

  const curlTts = `curl -X POST ${TTS_URL} \\
  -H "X-API-Key: vk_live_COLE_SUA_CHAVE_AQUI" \\
  -F "text=Olá, bem-vindo ao VoiceAPI!" \\
  -F "voice=pt_BR-faber-medium" \\
  --output fala.wav`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Como usar a VoiceAPI em 5 minutos</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Você vai transformar áudio em texto (STT) e texto em áudio (TTS) usando uma
          API REST simples. Não precisa instalar nada — só <code className="text-accent-400">curl</code>,
          <code className="text-accent-400 ml-1">Postman</code> ou o próprio
          <Link to="/playground" className="ml-1 text-accent-400 underline">Playground</Link>.
        </p>
      </div>

      <Step n={1} title="Crie sua conta">
        <p>
          Abra a página de{' '}
          <Link to="/register" className="text-accent-400 underline">cadastro</Link>{' '}
          e preencha e-mail, nome e uma senha com pelo menos 8 caracteres. Você
          já entra logado e cai no Dashboard.
        </p>
      </Step>

      <Step n={2} title="Pegue saldo de Vox">
        <p>
          Toda chamada custa <strong>Vox</strong> (a moeda interna). Vá em{' '}
          <Link to="/billing" className="text-accent-400 underline">Billing</Link>{' '}
          e peça um crédito ao admin (ou aguarde a recarga automática se você já tem).
          O saldo atual aparece no topo do Dashboard.
        </p>
        <p className="text-xs text-zinc-500">
          Regra prática: ~1 Vox ≈ 1 segundo de áudio transcrito.
        </p>
      </Step>

      <Step n={3} title="Gere uma API key">
        <p>
          Vá em{' '}
          <Link to="/keys" className="text-accent-400 underline">API Keys</Link>, clique
          em <strong>New key</strong>, dê um nome (ex.: <em>"app-totem-balcao"</em>),
          escolha os escopos (para STT marque <code className="text-accent-400">stt:transcribe</code>;
          para TTS marque <code className="text-accent-400">tts:synthesize</code>) e salve.
        </p>
        <p className="text-xs text-amber-400">
          ⚠ A chave completa aparece <strong>uma única vez</strong>. Copie e guarde em
          local seguro — se perder, precisa revogar e gerar outra.
        </p>
      </Step>

      <Step n={4} title="Faça sua primeira transcrição">
        <p>
          Pegue qualquer arquivo de áudio curto (webm, wav, mp3, m4a…). Se você
          não tem um na mão, grave 5 segundos do microfone no{' '}
          <Link to="/playground" className="text-accent-400 underline">Playground</Link>{' '}
          e clique em <strong>Transcribe</strong>.
        </p>
        <p>Ou direto pelo terminal:</p>
        <CodeBlock lang="bash" code={curlStt} />
        <p className="text-xs text-zinc-500">
          A URL acima (<code>{STT_URL}</code>) foi detectada automaticamente da barra
          do seu navegador — não precisa trocar nada.
        </p>
      </Step>

      <Step n={5} title="Leia a resposta">
        <p>O servidor devolve um JSON com o texto e o tempo de cada palavra:</p>
        <CodeBlock
          lang="json"
          code={`{
  "text": "olá bem-vindo ao voice api",
  "words": [
    { "word": "olá",         "start": 0.00, "end": 0.42, "probability": 0.99 },
    { "word": "bem-vindo",   "start": 0.45, "end": 0.95, "probability": 0.97 },
    { "word": "ao",          "start": 0.98, "end": 1.05, "probability": 0.99 },
    { "word": "voice",       "start": 1.08, "end": 1.40, "probability": 0.99 },
    { "word": "api",         "start": 1.42, "end": 1.65, "probability": 0.98 }
  ],
  "language": "pt",
  "duration": 1.65,
  "model": "whisper-large-v3-turbo"
}`}
        />
        <ul className="text-sm text-zinc-400 list-disc pl-5 space-y-1">
          <li><code className="text-accent-400">text</code> — transcrição completa.</li>
          <li><code className="text-accent-400">words</code> — cada palavra com início, fim e confiança (0–1).</li>
          <li><code className="text-accent-400">duration</code> — duração real do áudio em segundos. É o que define o custo.</li>
          <li><code className="text-accent-400">model</code> — modelo usado (whisper-large-v3-turbo via faster-whisper).</li>
        </ul>
      </Step>

      <div className="card space-y-3">
        <div className="text-base font-semibold">Bônus: gerar áudio (TTS)</div>
        <p className="text-sm text-zinc-400">
          Manda um texto, recebe um arquivo de áudio. Você pode escolher a voz —
          veja a lista em <code>{VOICES_URL}</code>.
        </p>
        <CodeBlock lang="bash" code={curlTts} />
        <p className="text-xs text-zinc-500">
          Resposta vem em JSON com <code>audio_base64</code> (WAV codificado em base64),
          formato, voz e timings por palavra.
        </p>
      </div>

      <div className="card space-y-3 border border-amber-500/30 bg-amber-500/5">
        <div className="text-base font-semibold text-amber-300">Erros comuns</div>
        <ul className="text-sm text-zinc-300 list-disc pl-5 space-y-2">
          <li><strong>401 — "missing API key"</strong>: você esqueceu o header <code>X-API-Key</code> (ou o JWT em vez da API key).</li>
          <li><strong>403 — "missing required scope"</strong>: a key foi criada sem o escopo <code>stt:transcribe</code> ou <code>tts:synthesize</code>. Crie uma nova.</li>
          <li><strong>402 — "insufficient_vox"</strong>: saldo zerado. Vá em Billing pedir crédito.</li>
          <li><strong>400 — "Empty audio file"</strong>: o arquivo veio vazio. Confira o caminho no <code>-F</code>.</li>
          <li><strong>502 — "sidecar unreachable"</strong>: o serviço de STT está fora do ar. Aguarde alguns minutos e tente de novo, ou chame o suporte.</li>
        </ul>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold text-accent-400 tabular-nums">{String(n).padStart(2, '0')}</div>
        <div className="text-base font-semibold">{title}</div>
      </div>
      <div className="text-sm text-zinc-300 space-y-2">{children}</div>
    </div>
  )
}

// =============================================================================
// TAB: AGENT — instruções estruturadas para um agente de IA
// =============================================================================
function AgentTutorial() {
  // Tudo copy-pasteable, sem placeholders que o agente precise adivinhar.
  const systemPrompt = `# VoiceAPI Agent Instructions

You are operating against the VoiceAPI Gateway at ${API_BASE}.

## Authentication
- Voice endpoints (under /v1) require an API key.
- Pass it via header "X-API-Key: <key>" OR "Authorization: Bearer <key>".
- Do NOT use the JWT issued by /api/auth/* — that is for the dashboard only.
- API keys have the shape: vk_live_<16hex>_<43base64url>.
- The key is bound to a user account. Each call debits "Vox" from that user's wallet.

## Required scopes per endpoint
- POST /v1/stt       → scope "stt:transcribe"
- POST /v1/tts       → scope "tts:synthesize"
- GET  /v1/voices    → scope "tts:synthesize"
- GET  /v1/stt/model → scope "stt:transcribe"

## STT — Speech to Text
- Method: POST
- URL: ${STT_URL}
- Content-Type: multipart/form-data
- Form field: audio (the binary file; any common format — webm, wav, mp3, m4a, ogg)
- Optional: set the part's filename + content-type to match the source codec
- Response 200: { text, words[{word,start,end,probability}], language, duration, model }
- Cost = proportional to "duration" (real audio seconds, not request size)

## TTS — Text to Speech
- Method: POST
- URL: ${TTS_URL}
- Content-Type: multipart/form-data
- Form fields: text (required, max 5000 chars), voice (optional; default = first from /v1/voices)
- Response 200: { audio_base64, format, voice, model, timings }
- audio_base64 is a WAV blob — decode and save to disk or stream to user

## Error handling — ALWAYS handle these codes
- 400: empty file or text > 5000 chars. Fix the request and retry.
- 401: missing or invalid API key. Stop and surface to the user.
- 403: key lacks the required scope. Surface with the missing scope name.
- 402: insufficient Vox balance. Stop and tell the user to top up at /billing.
- 502: sidecar offline (STT/TTS engine down). Retry once after 3 seconds, then surface.
- 5xx: any other server error. Retry up to 2 times with exponential backoff (1s, 3s).

## Cost discipline
- Check the response "duration" field — that is what gets billed for STT.
- For TTS, the cost scales with len(text). Don't synthesize the same text twice.
- Stream long audio in chunks rather than re-uploading giant files.

## Health check
- GET ${HEALTH_URL} → { "status": "ok" } if the gateway is up.
- GET ${META_URL}  → { service, version, stt_model, docs } (no auth required).

## Specs & references
- OpenAPI / Swagger UI: ${SWAGGER_URL}
- ReDoc: ${REDOC_URL}
- Full reference in this same page under the "API Reference" tab.`

  const pythonStt = `# pip install requests
import requests

API_BASE = "${API_BASE}"
API_KEY  = "vk_live_COLE_SUA_CHAVE_AQUI"

with open("audio.webm", "rb") as f:
    r = requests.post(
        f"{API_BASE}/v1/stt",
        headers={"X-API-Key": API_KEY},
        files={"audio": ("audio.webm", f, "audio/webm")},
        timeout=60,
    )
r.raise_for_status()
data = r.json()
print(data["text"])
for w in data["words"]:
    print(f"  [{w['start']:.2f}-{w['end']:.2f}] {w['word']}")
print(f"duration={data['duration']:.2f}s  cost_unit=seconds")`

  const jsStt = `// Browser or Node 18+ (global fetch + Blob)
const API_BASE = "${API_BASE}";
const API_KEY  = "vk_live_COLE_SUA_CHAVE_AQUI";

// From a <input type="file"> or MediaRecorder blob:
async function transcribe(file) {
  const form = new FormData();
  form.append("audio", file, file.name || "audio.webm");
  const res = await fetch(\`\${API_BASE}/v1/stt\`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(\`STT \${res.status}: \${JSON.stringify(err)}\`);
  }
  return res.json(); // { text, words, language, duration, model }
}`

  const pythonTts = `import base64, requests

API_BASE = "${API_BASE}"
API_KEY  = "vk_live_COLE_SUA_CHAVE_AQUI"

r = requests.post(
    f"{API_BASE}/v1/tts",
    headers={"X-API-Key": API_KEY},
    files={
        "text":  (None, "Olá, bem-vindo!"),
        "voice": (None, "pt_BR-faber-medium"),
    },
    timeout=60,
)
r.raise_for_status()
data = r.json()
with open("out.wav", "wb") as f:
    f.write(base64.b64decode(data["audio_base64"]))
print("saved:", data["format"], data["voice"])`

  const curlStt = `curl -X POST ${STT_URL} \\
  -H "X-API-Key: vk_live_COLE_SUA_CHAVE_AQUI" \\
  -F "audio=@audio.webm;type=audio/webm"`

  const curlTts = `curl -X POST ${TTS_URL} \\
  -H "X-API-Key: vk_live_COLE_SUA_CHAVE_AQUI" \\
  -F "text=Olá!" \\
  -F "voice=pt_BR-faber-medium" \\
  --output fala.wav`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">VoiceAPI — guia para agentes de IA</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Tudo abaixo foi escrito pra ser lido por uma LLM/agent. Copie o bloco
          inteiro para o system prompt do seu agente, ou use os snippets direto.
          A URL base (<code className="text-accent-400">{API_BASE}</code>) já vem
          detectada do browser.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">System prompt (cole no seu agent)</div>
          <span className="pill-accent">copiável</span>
        </div>
        <p className="text-xs text-zinc-400">
          Cobre autenticação, escopos, schemas, custos e tratamento de erro. Não
          precisa adaptar nada — os endpoints e headers já estão preenchidos.
        </p>
        <CodeBlock lang="markdown" code={systemPrompt} />
      </div>

      <Section title="Endpoints — visão rápida">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 uppercase tracking-widest border-b border-ink-700">
              <th className="py-2 pr-3">Método</th>
              <th className="py-2 pr-3">URL</th>
              <th className="py-2 pr-3">Auth</th>
              <th className="py-2">Scope</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            <EndpointRow method="POST" url="/v1/stt"        auth="API key" scope="stt:transcribe" />
            <EndpointRow method="POST" url="/v1/tts"        auth="API key" scope="tts:synthesize" />
            <EndpointRow method="GET"  url="/v1/voices"     auth="API key" scope="tts:synthesize" />
            <EndpointRow method="GET"  url="/v1/stt/model"  auth="API key" scope="stt:transcribe" />
            <EndpointRow method="GET"  url="/healthz"       auth="none"    scope="—" />
            <EndpointRow method="GET"  url="/api/meta"      auth="none"    scope="—" />
          </tbody>
        </table>
      </Section>

      <Section title="STT — Python (requests)">
        <CodeBlock lang="python" code={pythonStt} />
      </Section>

      <Section title="STT — JavaScript (browser/Node 18+)">
        <CodeBlock lang="javascript" code={jsStt} />
      </Section>

      <Section title="TTS — Python (requests)">
        <CodeBlock lang="python" code={pythonTts} />
      </Section>

      <Section title="STT — curl">
        <CodeBlock lang="bash" code={curlStt} />
      </Section>

      <Section title="TTS — curl">
        <CodeBlock lang="bash" code={curlTts} />
      </Section>

      <Section title="Tratamento de erro recomendado">
        <CodeBlock
          lang="typescript"
          code={`type SttResponse = {
  text: string
  words: { word: string; start: number; end: number; probability: number }[]
  language?: string
  duration?: number
  model: string
}

async function callStt(blob: Blob, apiKey: string): Promise<SttResponse> {
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  const res = await fetch('${STT_URL}', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey },
    body: form,
  })
  if (res.status === 402) {
    throw new Error('Saldo Vox insuficiente. Avise o usuário para recarregar.')
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error('API key inválida ou sem escopo stt:transcribe.')
  }
  if (res.status === 502) {
    // sidecar offline — retry once after 3s
    await new Promise(r => setTimeout(r, 3000))
    return callStt(blob, apiKey)
  }
  if (!res.ok) {
    throw new Error(\`STT falhou (\${res.status}): \${await res.text()}\`)
  }
  return res.json()
}`}
        />
      </Section>

      <Section title="Spec & referência viva">
        <ul className="text-sm text-zinc-300 list-disc pl-5 space-y-1">
          <li>
            OpenAPI interativo: <a className="text-accent-400 underline" href={SWAGGER_URL} target="_blank" rel="noreferrer">{SWAGGER_URL}</a>
          </li>
          <li>
            ReDoc: <a className="text-accent-400 underline" href={REDOC_URL} target="_blank" rel="noreferrer">{REDOC_URL}</a>
          </li>
          <li>
            Schema bruto: <code>{API_BASE}/openapi.json</code>
          </li>
        </ul>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-3">
      <div className="text-base font-semibold">{title}</div>
      <div className="text-sm text-zinc-300 space-y-2">{children}</div>
    </div>
  )
}

function EndpointRow({ method, url, auth, scope }: { method: string; url: string; auth: string; scope: string }) {
  const methodColor =
    method === 'GET'  ? 'text-emerald-400'
    : method === 'POST' ? 'text-accent-400'
    : 'text-amber-400'
  return (
    <tr className="border-b border-ink-800/60">
      <td className={`py-2 pr-3 font-semibold ${methodColor}`}>{method}</td>
      <td className="py-2 pr-3">{url}</td>
      <td className="py-2 pr-3 text-zinc-400">{auth}</td>
      <td className="py-2 text-zinc-400">{scope}</td>
    </tr>
  )
}

// =============================================================================
// TAB: REFERENCE — cheatsheet da API
// =============================================================================
function Reference() {
  const sttJson = `{
  "text": "olá bem-vindo ao voice api",
  "words": [
    { "word": "olá",       "start": 0.00, "end": 0.42, "probability": 0.99 },
    { "word": "bem-vindo", "start": 0.45, "end": 0.95, "probability": 0.97 }
  ],
  "language": "pt",
  "duration": 1.65,
  "model": "whisper-large-v3-turbo"
}`

  const ttsJson = `{
  "audio_base64": "UklGRiQ…",
  "format": "wav",
  "voice": "pt_BR-faber-medium",
  "model": "piper-tts",
  "timings": [{ "word": "Olá", "start": 0.0, "end": 0.5 }]
}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">API Reference</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Endpoints aceitam <code className="text-accent-400">X-API-Key</code> ou{' '}
          <code className="text-accent-400">Authorization: Bearer &lt;key&gt;</code>.
          URL base detectada do browser: <code className="text-accent-400">{API_BASE}</code>
        </p>
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">POST /v1/stt</div>
        <p className="text-sm text-zinc-400">
          Speech-to-text. Recebe <code>audio</code> em multipart/form-data e devolve JSON.
        </p>
        <div className="text-xs text-zinc-500">
          Model: <span className="text-zinc-300">whisper-large-v3-turbo</span> via faster-whisper.
          Custo proporcional a <code>duration</code> (segundos reais do áudio).
        </div>
        <div className="text-sm font-medium">Response 200</div>
        <CodeBlock lang="json" code={sttJson} />
        <div className="text-sm font-medium">Códigos de erro</div>
        <ul className="text-xs text-zinc-400 list-disc pl-5 space-y-1">
          <li><code>400</code> — áudio vazio</li>
          <li><code>401</code> — API key ausente ou inválida</li>
          <li><code>402</code> — saldo Vox insuficiente</li>
          <li><code>403</code> — key sem scope <code>stt:transcribe</code></li>
          <li><code>502</code> — sidecar (whisper) offline</li>
        </ul>
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">POST /v1/tts</div>
        <p className="text-sm text-zinc-400">
          Text-to-speech. Form fields <code>text</code> (obrigatório, ≤ 5000 chars) e
          <code>voice</code> (opcional; default = primeira voz do <code>/v1/voices</code>).
        </p>
        <div className="text-sm font-medium">Response 200</div>
        <CodeBlock lang="json" code={ttsJson} />
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">GET /v1/voices</div>
        <p className="text-sm text-zinc-400">
          Lista vozes TTS instaladas no sidecar. Requer scope <code>tts:synthesize</code>.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">GET /v1/stt/model</div>
        <p className="text-sm text-zinc-400">
          Modelo STT ativo no servidor (útil pra healthcheck e versionamento de cliente).
        </p>
        <CodeBlock lang="json" code={`{ "model": "whisper-large-v3-turbo", "engine": "faster-whisper" }`} />
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">GET /healthz &nbsp;·&nbsp; GET /api/meta</div>
        <p className="text-sm text-zinc-400">Endpoints públicos (sem auth) — útil pra liveness probe e inspeção.</p>
        <ul className="text-xs text-zinc-400 list-disc pl-5 space-y-1">
          <li><code>{HEALTH_URL}</code> → <code>{`{ "status": "ok" }`}</code></li>
          <li><code>{META_URL}</code> → <code>{`{ service, version, stt_model, docs }`}</code></li>
        </ul>
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">Spec OpenAPI interativo</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="btn-secondary" href={SWAGGER_URL} target="_blank" rel="noreferrer">Swagger UI → /docs</a>
          <a className="btn-secondary" href={REDOC_URL}   target="_blank" rel="noreferrer">ReDoc → /redoc</a>
          <a className="btn-secondary" href={`${API_BASE}/openapi.json`} target="_blank" rel="noreferrer">openapi.json</a>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Shell
// =============================================================================
export default function Docs() {
  const [tab, setTab] = useState<TabKey>('human')

  const warnings = useMemo(() => {
    if (!API_BASE) {
      return 'Não consegui detectar a URL do navegador (rode dentro de um browser, não via SSR/CLI).'
    }
    if (API_BASE.startsWith('http://')) {
      return 'Servidor em http:// plain — a API key vai trafegar sem TLS. Use https em produção.'
    }
    return null
  }, [])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">VoiceAPI — Documentação</h1>
        <p className="text-sm text-zinc-400">
          Host detectado do seu navegador:{' '}
          <code className="text-accent-400">{API_BASE || '(não detectado)'}</code>
        </p>
        {warnings && (
          <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            ⚠ {warnings}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-ink-800">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 text-sm rounded-t-lg border-b-2 transition ' +
              (tab === t.key
                ? 'border-accent-500 text-accent-300 bg-accent-500/5'
                : 'border-transparent text-zinc-400 hover:text-zinc-200')
            }
          >
            <span className="mr-2">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'human'     && <HumanTutorial />}
        {tab === 'agent'     && <AgentTutorial />}
        {tab === 'reference' && <Reference />}
      </div>
    </div>
  )
}