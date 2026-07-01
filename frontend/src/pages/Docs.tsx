import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Docs page — human walkthrough + machine-friendly agent skill + REST reference.
 *
 * Every endpoint is documented with two clearly-labeled blocks:
 *   ▸ REQUEST PAYLOAD — what YOU send (headers + body fields + example)
 *   ▸ RESPONSE PAYLOAD — what the server returns (status + body fields + example)
 *
 * The agent tutorial is published here as a copy-paste skill (frontmatter YAML
 * + procedure / output contract / failure handling / examples) so an external
 * LLM agent can drop it into its own skill store as-is.
 */

// --- Auto-detect the API host from the browser's own URL bar -----------------
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

// =============================================================================
// REQUEST / RESPONSE payload primitives — visually distinct on purpose
// =============================================================================

/** A row in a field table. */
function Field({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
  return (
    <tr className="border-b border-ink-800/60 align-top">
      <td className="py-2 pr-3 font-mono text-accent-400 whitespace-nowrap">
        {name}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </td>
      <td className="py-2 pr-3 font-mono text-xs text-zinc-400 whitespace-nowrap">{type}</td>
      <td className="py-2 text-sm text-zinc-300">{desc}</td>
    </tr>
  )
}

/** REQUEST PAYLOAD block — what the client sends. */
function RequestPayload({
  method,
  url,
  headersNote,
  headers,
  bodyNote,
  body,
  example,
  exampleLang,
}: {
  method: string
  url: string
  headersNote?: string
  headers?: { name: string; type: string; required?: boolean; desc: string }[]
  bodyNote?: string
  body?: { name: string; type: string; required?: boolean; desc: string }[]
  example: string
  exampleLang: string
}) {
  const methodColor =
    method === 'GET'  ? 'text-emerald-400'
    : method === 'POST' ? 'text-accent-400'
    : 'text-amber-400'

  return (
    <div className="card border-l-4 border-l-accent-500/70 space-y-4">
      <div className="flex items-center gap-3">
        <span className="pill-accent">REQUEST PAYLOAD</span>
        <span className="text-xs text-zinc-500">→ what you send to the server</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`font-bold text-sm ${methodColor}`}>{method}</span>
        <code className="text-sm text-zinc-200">{url}</code>
      </div>

      {headers && headers.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
            Headers {headersNote && <span className="text-zinc-600 normal-case tracking-normal ml-2">— {headersNote}</span>}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 uppercase tracking-widest border-b border-ink-700">
                <th className="py-2 pr-3 w-44">Name</th>
                <th className="py-2 pr-3 w-32">Type</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {headers.map(h => (
                <Field key={h.name} name={h.name} type={h.type} required={h.required} desc={h.desc} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {body && body.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
            Body fields {bodyNote && <span className="text-zinc-600 normal-case tracking-normal ml-2">— {bodyNote}</span>}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 uppercase tracking-widest border-b border-ink-700">
                <th className="py-2 pr-3 w-44">Field</th>
                <th className="py-2 pr-3 w-32">Type</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {body.map(b => (
                <Field key={b.name} name={b.name} type={b.type} required={b.required} desc={b.desc} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Example</div>
        <CodeBlock lang={exampleLang} code={example} />
      </div>
    </div>
  )
}

/** RESPONSE PAYLOAD block — what the server returns. */
function ResponsePayload({
  status,
  statusMeaning,
  fields,
  example,
  exampleLang,
  errors,
}: {
  status: number | string
  statusMeaning: string
  fields: { name: string; type: string; desc: string }[]
  example: string
  exampleLang: string
  errors?: { code: number; when: string }[]
}) {
  const ok = status === 200 || status === '200'
  return (
    <div className={`card border-l-4 ${ok ? 'border-l-emerald-500/70' : 'border-l-amber-500/70'} space-y-4`}>
      <div className="flex items-center gap-3">
        <span className={ok ? 'pill-green' : 'pill'}>RESPONSE PAYLOAD</span>
        <span className="text-xs text-zinc-500">← what the server returns to you</span>
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`font-bold text-sm ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{status}</span>
        <span className="text-sm text-zinc-300">{statusMeaning}</span>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Body fields</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 uppercase tracking-widest border-b border-ink-700">
              <th className="py-2 pr-3 w-44">Field</th>
              <th className="py-2 pr-3 w-32">Type</th>
              <th className="py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(f => (
              <Field key={f.name} name={f.name} type={f.type} desc={f.desc} />
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Example body</div>
        <CodeBlock lang={exampleLang} code={example} />
      </div>

      {errors && errors.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Error responses</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 uppercase tracking-widest border-b border-ink-700">
                <th className="py-2 pr-3 w-20">Code</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {errors.map(e => (
                <tr key={e.code} className="border-b border-ink-800/60">
                  <td className="py-2 pr-3 font-mono text-amber-300">{e.code}</td>
                  <td className="py-2 text-sm text-zinc-300">{e.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// TAB: HUMAN
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
          Você vai transformar áudio em texto (STT) e texto em áudio (TTS) usando
          uma API REST. Toda chamada tem dois lados bem definidos:
          <strong> REQUEST PAYLOAD</strong> (o que <em>você</em> envia) e
          <strong> RESPONSE PAYLOAD</strong> (o que o <em>servidor</em> devolve).
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
        <p className="text-sm">
          Esse comando tem um <strong className="text-accent-400">REQUEST PAYLOAD</strong> bem
          simples: o header <code>X-API-Key</code> + um arquivo de áudio no body
          multipart. Detalhes completos na aba <em>API Reference</em>.
        </p>
      </Step>

      <Step n={5} title="Leia a resposta (Response Payload)">
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
        <p className="text-sm">
          Esse é o <strong className="text-emerald-400">RESPONSE PAYLOAD</strong> —
          tudo que você recebe do servidor pra cada campo, com o tipo e o
          significado, está documentado na aba <em>API Reference</em>.
        </p>
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
          O RESPONSE PAYLOAD vem em JSON com <code>audio_base64</code> (WAV codificado em base64),
          formato, voz e timings por palavra.
        </p>
      </div>

      <div className="card space-y-3 border border-amber-500/30 bg-amber-500/5">
        <div className="text-base font-semibold text-amber-300">Erros comuns</div>
        <ul className="text-sm text-zinc-300 list-disc pl-5 space-y-2">
          <li><strong>401 — "missing API key"</strong>: você esqueceu o header <code>X-API-Key</code> (ou mandou o JWT em vez da API key).</li>
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
// TAB: AGENT — published as a copy-paste SKILL
// =============================================================================
function AgentTutorial() {
  // The skill block below has the same frontmatter shape as a SKILL.md so an
  // external agent can save it as-is and have it auto-discovered.
  const skillFile = `---
name: voice-api-integration
description: |
  Integrate with the VoiceAPI Gateway (STT + TTS) at ${API_BASE}.
  Use this skill when an agent needs to transcribe user audio to text,
  synthesize speech from text, list available voices, or check the model
  in use. Triggers: "transcribe this audio", "convert speech to text",
  "speech-to-text", "text-to-speech", "synthesize voice", "STT",
  "TTS", "Whisper via VoiceAPI", "faster-whisper", "piper-tts".
  Do NOT use for general audio editing, file conversion, or local model
  inference — VoiceAPI is a paid, networked gateway.
---

# VoiceAPI Integration

## Inputs to collect
- API key in the format \`vk_live_<16hex>_<43base64url>\` (passed via header)
- Audio bytes (any common format: webm, wav, mp3, m4a, ogg) OR text to speak
- Optional voice id for TTS (call /v1/voices first if unsure)
- The Vox budget the caller is willing to spend

## Environment
- API base URL: \`${API_BASE}\` (auto-detected from the browser bar of the docs page)
- Health probe: \`GET ${HEALTH_URL}\` → \`{ "status": "ok" }\`
- Server meta:  \`GET ${META_URL}\`  → service, version, stt_model

## Authentication
Voice endpoints (under /v1) require an API key. Pass it via ONE of:
- Header: \`X-API-Key: <key>\`
- Header: \`Authorization: Bearer <key>\`

API keys are bound to a user account; each call debits "Vox" from that user's wallet.
Do NOT use the JWT issued by /api/auth/* — that is dashboard-only.

## Endpoints (cheatsheet)

| Method | URL | Scope |
|---|---|---|
| POST | /v1/stt | stt:transcribe |
| POST | /v1/tts | tts:synthesize |
| GET  | /v1/voices | tts:synthesize |
| GET  | /v1/stt/model | stt:transcribe |

Full Request/Response payload schemas: open this same docs page → "API Reference" tab.

## Procedure — STT (Speech to Text)

1. Build a multipart/form-data body with one part named \`audio\`. Set the part's
   filename and content-type to match the source codec (e.g. \`audio/webm\`,
   \`audio/wav\`).
2. POST to \`${STT_URL}\` with header \`X-API-Key: <key>\`.
3. Parse the JSON RESPONSE PAYLOAD — fields documented in the API Reference tab.
4. Read \`response.duration\` to know what was billed (real audio seconds).

## Procedure — TTS (Text to Speech)

1. If the caller did not specify a voice, \`GET ${VOICES_URL}\` first and pick the
   first element (or the one matching the requested language).
2. POST to \`${TTS_URL}\` as multipart/form-data with fields \`text\` (≤ 5000 chars)
   and optional \`voice\`.
3. Decode \`response.audio_base64\` (it's a WAV blob) and stream to disk or user.

## Output contract
For STT: return the transcript string and per-word timings to the caller.
For TTS: return a playable audio file (decoded base64 → bytes).
Always surface the actual duration / char count so the caller knows the cost.

## Failure handling
- 400 → invalid input (empty file, text too long). Fix the request and retry.
- 401 → missing/invalid key. Stop and ask the user for a valid key.
- 402 → insufficient Vox balance. Stop and tell the user to top up.
- 403 → key lacks the scope. Tell the user which scope is missing.
- 502 → sidecar (whisper/piper) offline. Retry ONCE after 3s, then surface.
- 5xx → retry up to 2× with exponential backoff (1s, 3s). Then surface.

## Examples

### Example 1 — STT (Python)
\`\`\`python
import requests
with open("audio.webm", "rb") as f:
    r = requests.post(
        "${STT_URL}",
        headers={"X-API-Key": "<key>"},
        files={"audio": ("audio.webm", f, "audio/webm")},
        timeout=60,
    )
r.raise_for_status()
print(r.json()["text"])
\`\`\`

### Example 2 — TTS (curl)
\`\`\`bash
curl -X POST "${TTS_URL}" \\
  -H "X-API-Key: <key>" \\
  -F "text=Olá!" \\
  -F "voice=pt_BR-faber-medium" \\
  --output fala.wav
\`\`\`

## Reference
- Swagger UI: ${SWAGGER_URL}
- ReDoc:     ${REDOC_URL}
- Schema:    ${API_BASE}/openapi.json
`

  // Standalone copyable snippets for quick pasting into agent code.
  const pythonStt = `# pip install requests
import requests

API_BASE = "${API_BASE}"
API_KEY  = "<your-vk_live-key>"

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
print(f"duration={data['duration']:.2f}s  billed_units=seconds")`

  const jsStt = `// Browser or Node 18+
const API_BASE = "${API_BASE}";
const API_KEY  = "<your-vk_live-key>";

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
  return res.json(); // RESPONSE PAYLOAD: { text, words, language, duration, model }
}`

  const pythonTts = `import base64, requests

API_BASE = "${API_BASE}"
API_KEY  = "<your-vk_live-key>"

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
data = r.json()  # RESPONSE PAYLOAD: { audio_base64, format, voice, model, timings }
with open("out.wav", "wb") as f:
    f.write(base64.b64decode(data["audio_base64"]))`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">VoiceAPI — Skill para agentes de IA</h2>
        <p className="text-sm text-zinc-400 mt-1">
          O bloco abaixo é uma <strong>skill completa</strong> (mesmo formato de um
          <code className="text-accent-400"> SKILL.md</code> com frontmatter YAML +
          seções de <em>Procedure / Output contract / Failure handling</em>).
          Copie e salve no seu diretório de skills — outro agente vai descobrir e
          carregar automaticamente quando precisar transcrever ou sintetizar áudio.
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">Skill: <code>voice-api-integration</code></div>
          <span className="pill-accent">copie e salve como SKILL.md</span>
        </div>
        <p className="text-xs text-zinc-400">
          Inclui frontmatter com <code>name</code> + <code>description</code> (pra
          auto-discovery), escopos, schemas de request/response, política de retry
          e dois exemplos canônicos.
        </p>
        <CodeBlock lang="yaml" code={skillFile} />
      </div>

      <div className="card space-y-3">
        <div className="text-base font-semibold">Snippets standalone</div>
        <p className="text-xs text-zinc-400">
          Versões mínimas pra colar direto no código do agente.
        </p>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-zinc-500">STT — Python</div>
          <CodeBlock lang="python" code={pythonStt} />
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-zinc-500">STT — JavaScript</div>
          <CodeBlock lang="javascript" code={jsStt} />
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-zinc-500">TTS — Python</div>
          <CodeBlock lang="python" code={pythonTts} />
        </div>
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
        <p className="text-xs text-zinc-500">
          Schemas completos de Request Payload e Response Payload estão na aba <em>API Reference</em>.
        </p>
      </Section>

      <Section title="Tratamento de erro recomendado (TypeScript)">
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
    await new Promise(r => setTimeout(r, 3000))
    return callStt(blob, apiKey) // retry once
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
// TAB: REFERENCE — every endpoint documented as REQUEST + RESPONSE payload
// =============================================================================
function Reference() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">API Reference</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Cada endpoint abaixo é documentado em <strong>dois blocos</strong>:
        </p>
        <ul className="text-sm text-zinc-400 list-disc pl-5 mt-2 space-y-1">
          <li><span className="pill-accent">REQUEST PAYLOAD</span> — o que <em>você</em> envia (método, URL, headers, body fields, exemplo).</li>
          <li><span className="pill-green">RESPONSE PAYLOAD</span> — o que o <em>servidor</em> devolve (status, body fields, exemplo JSON, erros possíveis).</li>
        </ul>
        <p className="text-sm text-zinc-400 mt-2">
          URL base detectada do browser: <code className="text-accent-400">{API_BASE}</code>
        </p>
      </div>

      {/* ---------------- POST /v1/stt ---------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">POST /v1/stt</h3>
          <span className="text-xs text-zinc-500">Speech-to-text · scope: <code>stt:transcribe</code></span>
        </div>

        <RequestPayload
          method="POST"
          url={STT_URL}
          headersNote="API key pode ir em X-API-Key OU em Authorization: Bearer"
          headers={[
            { name: 'X-API-Key',   type: 'string', required: true,  desc: 'API key no formato vk_live_<16hex>_<43b64url>. Aceita também "Authorization: Bearer <key>".' },
          ]}
          bodyNote="multipart/form-data — o servidor lê o arquivo como áudio bruto"
          body={[
            { name: 'audio', type: 'file (binary)', required: true, desc: 'Áudio a transcrever. Formatos: webm, wav, mp3, m4a, ogg. Filename e content-type são repassados ao sidecar.' },
          ]}
          example={`curl -X POST "${STT_URL}" \\
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx" \\
  -F "audio=@audio.webm;type=audio/webm"`}
          exampleLang="curl"
        />

        <ResponsePayload
          status={200}
          statusMeaning="OK — transcrição devolvida em JSON"
          fields={[
            { name: 'text',     type: 'string',           desc: 'Transcrição completa.' },
            { name: 'words',    type: 'array<object>',    desc: 'Cada palavra com timing e confiança (pode vir vazio).' },
            { name: 'words[].word',        type: 'string',  desc: 'Palavra reconhecida.' },
            { name: 'words[].start',       type: 'float',   desc: 'Início da palavra no áudio (segundos).' },
            { name: 'words[].end',         type: 'float',   desc: 'Fim da palavra no áudio (segundos).' },
            { name: 'words[].probability', type: 'float',   desc: 'Confiança 0.0–1.0 do modelo.' },
            { name: 'language', type: 'string | null',   desc: 'Idioma detectado (ex.: "pt").' },
            { name: 'duration', type: 'float | null',    desc: 'Duração real do áudio em segundos. É a unidade que define o custo em Vox.' },
            { name: 'model',    type: 'string',           desc: 'Modelo STT usado (ex.: whisper-large-v3-turbo).' },
          ]}
          example={`{
  "text": "olá bem-vindo ao voice api",
  "words": [
    { "word": "olá",       "start": 0.00, "end": 0.42, "probability": 0.99 },
    { "word": "bem-vindo", "start": 0.45, "end": 0.95, "probability": 0.97 }
  ],
  "language": "pt",
  "duration": 1.65,
  "model": "whisper-large-v3-turbo"
}`}
          exampleLang="json"
          errors={[
            { code: 400, when: 'Áudio vazio.' },
            { code: 401, when: 'API key ausente ou inválida.' },
            { code: 402, when: 'Saldo Vox insuficiente (pré-checagem ou race condition).' },
            { code: 403, when: 'Key sem scope "stt:transcribe".' },
            { code: 502, when: 'Sidecar (whisper) offline ou inacessível.' },
          ]}
        />
      </section>

      {/* ---------------- POST /v1/tts ---------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">POST /v1/tts</h3>
          <span className="text-xs text-zinc-500">Text-to-speech · scope: <code>tts:synthesize</code></span>
        </div>

        <RequestPayload
          method="POST"
          url={TTS_URL}
          headersNote="API key pode ir em X-API-Key OU em Authorization: Bearer"
          headers={[
            { name: 'X-API-Key', type: 'string', required: true, desc: 'API key no formato vk_live_<16hex>_<43b64url>.' },
          ]}
          bodyNote="multipart/form-data — text é obrigatório; voice é opcional"
          body={[
            { name: 'text',  type: 'string',  required: true,  desc: 'Texto a sintetizar. Máximo 5000 caracteres. Custo em Vox escala com len(text).' },
            { name: 'voice', type: 'string',  required: false, desc: 'ID da voz. Se omitido, usa a primeira voz de GET /v1/voices. Ex.: "pt_BR-faber-medium".' },
          ]}
          example={`curl -X POST "${TTS_URL}" \\
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx" \\
  -F "text=Olá, bem-vindo!" \\
  -F "voice=pt_BR-faber-medium" \\
  --output fala.wav`}
          exampleLang="curl"
        />

        <ResponsePayload
          status={200}
          statusMeaning="OK — áudio sintetizado em base64"
          fields={[
            { name: 'audio_base64', type: 'string (base64)', desc: 'Áudio WAV codificado em base64. Decodifique pra ter o arquivo.' },
            { name: 'format',       type: 'string',          desc: 'Formato do áudio (ex.: "wav").' },
            { name: 'voice',        type: 'string',          desc: 'Voz efetivamente usada.' },
            { name: 'model',        type: 'string',          desc: 'Modelo TTS usado (ex.: "piper-tts").' },
            { name: 'timings',      type: 'array<object>',   desc: 'Timing por palavra (pode vir vazio). Cada item: { word, start, end }.' },
          ]}
          example={`{
  "audio_base64": "UklGRiQ…",
  "format": "wav",
  "voice": "pt_BR-faber-medium",
  "model": "piper-tts",
  "timings": [{ "word": "Olá", "start": 0.0, "end": 0.5 }]
}`}
          exampleLang="json"
          errors={[
            { code: 400, when: 'Campo text vazio ou maior que 5000 chars.' },
            { code: 401, when: 'API key ausente ou inválida.' },
            { code: 402, when: 'Saldo Vox insuficiente.' },
            { code: 403, when: 'Key sem scope "tts:synthesize".' },
            { code: 502, when: 'Sidecar (piper-tts) offline.' },
          ]}
        />
      </section>

      {/* ---------------- GET /v1/voices ---------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">GET /v1/voices</h3>
          <span className="text-xs text-zinc-500">List voices · scope: <code>tts:synthesize</code></span>
        </div>

        <RequestPayload
          method="GET"
          url={VOICES_URL}
          headersNote="Sem body — só header de auth"
          headers={[
            { name: 'X-API-Key', type: 'string', required: true, desc: 'API key no formato vk_live_<16hex>_<43b64url>.' },
          ]}
          body={[]}
          example={`curl "${VOICES_URL}" \\
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx"`}
          exampleLang="curl"
        />

        <ResponsePayload
          status={200}
          statusMeaning="OK — lista de vozes TTS instaladas no sidecar"
          fields={[
            { name: 'voices',  type: 'array<string>', desc: 'Lista de IDs de voz. O primeiro elemento é o default.' },
            { name: 'default', type: 'string | null', desc: 'Voz default (igual ao primeiro elemento de "voices" se houver).' },
          ]}
          example={`{
  "voices": ["pt_BR-faber-medium", "en_US-amy-low"],
  "default": "pt_BR-faber-medium"
}`}
          exampleLang="json"
          errors={[
            { code: 401, when: 'API key ausente ou inválida.' },
            { code: 403, when: 'Key sem scope "tts:synthesize".' },
            { code: 502, when: 'Sidecar offline.' },
          ]}
        />
      </section>

      {/* ---------------- GET /v1/stt/model ---------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">GET /v1/stt/model</h3>
          <span className="text-xs text-zinc-500">Inspect STT model · scope: <code>stt:transcribe</code></span>
        </div>

        <RequestPayload
          method="GET"
          url={STT_MODEL_URL}
          headers={[
            { name: 'X-API-Key', type: 'string', required: true, desc: 'API key no formato vk_live_<16hex>_<43b64url>.' },
          ]}
          body={[]}
          example={`curl "${STT_MODEL_URL}" \\
  -H "X-API-Key: vk_live_xxxxxxxxxxxxxxxxxxxxx"`}
          exampleLang="curl"
        />

        <ResponsePayload
          status={200}
          statusMeaning="OK — identifica o modelo STT ativo no servidor"
          fields={[
            { name: 'model',  type: 'string', desc: 'Nome do modelo STT (ex.: "whisper-large-v3-turbo").' },
            { name: 'engine', type: 'string', desc: 'Engine de inferência (ex.: "faster-whisper").' },
          ]}
          example={`{ "model": "whisper-large-v3-turbo", "engine": "faster-whisper" }`}
          exampleLang="json"
          errors={[
            { code: 401, when: 'API key ausente ou inválida.' },
            { code: 403, when: 'Key sem scope "stt:transcribe".' },
          ]}
        />
      </section>

      {/* ---------------- Public endpoints ---------------- */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">Endpoints públicos (sem auth)</h3>
          <span className="text-xs text-zinc-500">Health probe & metadata</span>
        </div>

        <RequestPayload
          method="GET"
          url={HEALTH_URL}
          body={[]}
          example={`curl "${HEALTH_URL}"`}
          exampleLang="curl"
        />
        <ResponsePayload
          status={200}
          statusMeaning="OK — gateway respondendo"
          fields={[
            { name: 'status', type: 'string', desc: 'Sempre "ok" quando o processo está vivo.' },
          ]}
          example={`{ "status": "ok" }`}
          exampleLang="json"
        />

        <RequestPayload
          method="GET"
          url={META_URL}
          body={[]}
          example={`curl "${META_URL}"`}
          exampleLang="curl"
        />
        <ResponsePayload
          status={200}
          statusMeaning="OK — metadados do servidor"
          fields={[
            { name: 'service',   type: 'string', desc: 'Nome do serviço.' },
            { name: 'version',   type: 'string', desc: 'Versão do gateway.' },
            { name: 'stt_model', type: 'string', desc: 'Modelo STT ativo.' },
            { name: 'docs',      type: 'string', desc: 'Caminho para a Swagger UI (geralmente "/docs").' },
          ]}
          example={`{
  "service": "VoiceAPI Gateway",
  "version": "0.1.0",
  "stt_model": "whisper-large-v3-turbo",
  "docs": "/docs"
}`}
          exampleLang="json"
        />
      </section>

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
type TabKey = 'human' | 'agent' | 'reference'
const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'human',     label: 'Para humanos',    icon: '👤' },
  { key: 'agent',     label: 'Para agentes IA', icon: '🤖' },
  { key: 'reference', label: 'API Reference',   icon: '📚' },
]

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
    <div className="space-y-6 max-w-5xl">
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