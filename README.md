# VoiceAPI Gateway

A self-hosted API gateway for the **voice-chat** sidecar
([MauricioMilano/voice-chat](https://github.com/MauricioMilano/voice-chat)).

- **STT**: `whisper-large-v3-turbo` via `faster-whisper` (PT-BR out of the box)
- **TTS**: `piper-tts` with multiple Brazilian voices
- **Dashboard**: React + Vite + TailwindCSS — auth, API key management, usage analytics, playground, docs
- **Auth**: dashboard endpoints use JWT; voice endpoints (`/v1/*`) use `X-API-Key`
- **Single image**: one `Dockerfile` runs the sidecar **and** the gateway **and** serves the dashboard UI

Everything ships in one container. `docker compose up` and you're live.

---

## Quick start

```bash
# 1) Build and start
docker compose up -d --build

# 2) Open the dashboard
open http://localhost:8080          # the SPA is served by the gateway

# 3) Register the first user (becomes admin automatically)
#    …or just hit /api/auth/register from curl:

curl -s -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"You","password":"strongpass123"}'
# → {"access_token":"...","token_type":"bearer","expires_in":86400}

# 4) Create an API key (use the token above as Bearer)
curl -s -X POST http://localhost:8080/api/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"first-key","scopes":["stt:transcribe","tts:synthesize"]}'
# → {"key":"vk_live_..._...","prefix":"vk_live_...","id":1, ...}  (only shown once!)

# 5) Transcribe an audio file
curl -X POST http://localhost:8080/v1/stt \
  -H "X-API-Key: vk_live_..._..." \
  -F "audio=@sample.webm"
# → {"text":"...","words":[...],"model":"whisper-large-v3-turbo",...}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Single Docker image (Dockerfile)                           │
│                                                             │
│  ┌─────────────┐    HTTP   ┌─────────────────────────────┐  │
│  │  sidecar    │◀─────────▶│  gateway (FastAPI :8080)    │  │
│  │  :8001      │           │  - /api/auth, /api/keys,    │  │
│  │  whisper-   │           │    /api/usage               │  │
│  │  turbo-v3   │           │  - /v1/stt, /v1/tts         │  │
│  │  + piper    │           │  - /docs, /redoc            │  │
│  └─────────────┘           │  - serves React SPA (/)     │  │
│                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                       ▲
                       │  X-API-Key  /  Bearer JWT
                       │
              ┌────────┴────────┐
              │   your clients  │
              └─────────────────┘
```

The gateway never lets traffic reach the sidecar without a valid, active API key.

---

## What's in the box

| Path                    | What it does                                          |
|-------------------------|-------------------------------------------------------|
| `backend/`              | FastAPI gateway: auth, keys, usage, voice proxy       |
| `backend/app/static/`   | (after build) the compiled React app                  |
| `frontend/`             | Vite + React + TS + Tailwind dashboard                 |
| `scripts/start.sh`      | In-container supervisor launching sidecar + gateway   |
| `scripts/wait_sidecar.py` | Health-check helper                                  |
| `Dockerfile`            | **Multi-stage** — builds frontend + backend + sidecar in one image |
| `docker-compose.yml`    | One service, port 8080 (gateway) + 8001 (sidecar, debug) |
| `.env.example`          | Settings reference                                    |

---

## API surface

### Dashboard (JWT)

| Method | Path                  | Notes                          |
|--------|-----------------------|--------------------------------|
| POST   | `/api/auth/register`  | First user becomes admin       |
| POST   | `/api/auth/login`     | Returns `{access_token, ...}`  |
| GET    | `/api/auth/me`        | Current user                   |
| GET    | `/api/keys`           | List your API keys             |
| POST   | `/api/keys`           | Create a key (full key returned **once**) |
| DELETE | `/api/keys/{id}`      | Revoke                         |
| POST   | `/api/keys/{id}/rotate` | Mint a new key, revoke old    |
| GET    | `/api/usage/summary?days=30` | Aggregated stats            |
| GET    | `/api/usage/logs`     | Per-request logs               |

### Voice (X-API-Key)

| Method | Path              | Notes                                              |
|--------|-------------------|----------------------------------------------------|
| POST   | `/v1/stt`         | multipart `audio=@file` → transcript JSON         |
| POST   | `/v1/tts`         | form fields `text`, `voice?` → base64 WAV + timings |
| GET    | `/v1/voices`      | List installed TTS voices                          |
| GET    | `/v1/stt/model`   | Identifies the STT model                           |

`Authorization: Bearer <api_key>` works too — convenient for `curl`.

---

## Scopes

- `stt:transcribe` — `/v1/stt`
- `tts:synthesize` — `/v1/tts`, `/v1/voices`
- `*` — wildcard
- (empty / unset) — full access (default for convenience)

When creating a key in the dashboard, list scopes comma-separated.

---

## Configuration

All settings come from env vars (see `backend/.env.example`):

| Var                          | Default                                       |
|------------------------------|-----------------------------------------------|
| `SECRET_KEY`                 | dev-only fallback — **set this in prod**      |
| `DATABASE_URL`               | `sqlite:///./data/voice_api.db`               |
| `SIDECAR_BASE_URL`           | `http://127.0.0.1:8001`                       |
| `SIDECAR_TIMEOUT_SECONDS`    | `120`                                         |
| `CORS_ORIGINS`               | `http://localhost:8080`                       |
| `STT_MODEL`                  | `whisper-large-v3-turbo` (informational)      |

For production, swap SQLite for Postgres and put a reverse proxy in front.

---

## GPU

The default image runs sidecar on CPU (works on any host).
For ~5-10× speedup on STT, enable NVIDIA passthrough:

```yaml
# docker-compose.yml
services:
  voice-api:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

Requires `nvidia-container-toolkit` on the host.

---

## Local development (without Docker)

```bash
# Terminal 1 — sidecar
git clone https://github.com/MauricioMilano/voice-chat
cd voice-chat/sidecar
pip install -r requirements.txt
python main.py                          # → :8001

# Terminal 2 — backend
cd voice-api/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8080

# Terminal 3 — frontend (proxies /api and /v1 → :8080)
cd voice-api/frontend
npm install
npm run dev                            # → :5173
```

---

## Security notes

- API keys are stored as **HMAC-SHA256(secret_key, secret)** — never plain text.
- Only the **prefix** (`vk_live_xxxxxxxxx`) is shown in the dashboard; the full key is shown **once** at creation.
- Passwords use **bcrypt**.
- Dashboard JWT signed with **HS256**, configurable expiry.
- All `/v1/*` endpoints validate `X-API-Key` (or `Authorization: Bearer <key>`) **before** forwarding to the sidecar.
- The gateway never exposes the sidecar directly to clients.
- `SECRET_KEY` must be replaced in production (32+ random chars).

---



---

## Troubleshooting & logs

The gateway emits structured logs at every interesting moment — startup, every
HTTP request, auth attempts, sidecar calls, and errors. Two log streams live
in the container at `/app/logs/`:

- `gateway.log` — gateway process (auth, requests, sidecar calls, errors)
- `sidecar.log` — voice-chat sidecar (whisper, piper, downloads, model init)

Both are also written to stdout, so `docker compose logs voice-api` shows them
interleaved.

### Configuring logs

| Env var       | Default | What it does                                       |
|---------------|---------|----------------------------------------------------|
| `LOG_LEVEL`   | `INFO`  | `DEBUG` / `INFO` / `WARNING` / `ERROR`             |
| `LOG_FORMAT`  | `text`  | `text` (human) or `json` (one JSON line per record) |
| `LOG_FILE`    | unset   | Optional — also tee logs to this path, rotated 20MB×5 |

Set in your shell before `docker compose up`:

```bash
LOG_LEVEL=DEBUG LOG_FORMAT=json docker compose up
```

### Quick filters (use `tail-logs.sh`)

The container ships a helper that wraps `tail` + `grep` for the common cases:

```bash
# From the host:
docker compose exec voice-api ./scripts/tail-logs.sh              # everything
docker compose exec voice-api ./scripts/tail-logs.sh errors       # only WARN/ERROR
docker compose exec voice-api ./scripts/tail-logs.sh stt          # only STT events
docker compose exec voice-api ./scripts/tail-logs.sh auth        # login / API-key events
docker compose exec voice-api ./scripts/tail-logs.sh request-id a1b2c3d4  # one request end-to-end
```

`request-id` is your best friend for debugging a single failure — every log
line tagged with that ID belongs to the same HTTP call.

### What gets logged

Every log line is one event. In **text** mode:

```
2026-07-01T12:34:56.789 INFO  [access] request  request_id=a1b2c3d4 method=POST path=/v1/stt status=200 duration_ms=812 client_ip=187.45.10.2 key_prefix='vk_live_5BeldTIvjPw' bytes_in=32044
2026-07-01T12:34:56.101 INFO  [auth.events] login success  user_id=1 email='demo@test.com' ip='187.45.10.2' request_id=a1b2c3d4
2026-07-01T12:34:56.300 INFO  [voice] stt request  key_id=2 key_prefix='vk_live_5BeldTIvjPw' audio_bytes=32044 audio_content_type='audio/wav' request_id=a1b2c3d4
2026-07-01T12:34:57.110 INFO  [sidecar.client] sidecar stt ok  sidecar_url='http://127.0.0.1:8001/stt' status=200 duration_ms=810 bytes_in=32044 text_chars=42 word_count=9
2026-07-01T12:34:57.115 INFO  [sidecar] sidecar stt ok  op='stt' key_id=2 key_name='prod' key_prefix='vk_live_5BeldTIvjPw' bytes_in=32044 bytes_out=42 duration_ms=815 sidecar_status=200 request_id=a1b2c3d4
```

In **json** mode the same line is a JSON object — pipe straight into `jq`:

```bash
docker compose logs voice-api | jq -c 'select(.logger=="sidecar.client")'
docker compose logs voice-api | jq 'select(.request_id=="a1b2c3d4")'
docker compose logs voice-api | jq 'select(.status>=500 or .level=="ERROR")'
```

### Loggers in use

| Logger              | What it logs                                          |
|---------------------|-------------------------------------------------------|
| `app`               | Startup / shutdown / static mount state               |
| `access`            | One line per HTTP request (method, path, status, ms, IP, key prefix, request_id) |
| `auth`              | Auth dependency events (token failures, key denials, scope denials) |
| `auth.events`       | Login / register / key create / revoke / rotate outcomes with email + IP |
| `keys`              | API key CRUD outcomes (id, name, prefix, owner)       |
| `voice`             | STT/TTS request intake (audio size, voice, etc.)      |
| `sidecar`           | One log line per forwarded sidecar call (op, bytes, ms, status) |
| `sidecar.client`    | Raw HTTP layer: URL, status, response preview (first 500 chars on errors) |
| `uvicorn`           | Standard uvicorn startup messages                     |

### Common failure patterns

| Symptom in logs                                                    | Likely cause                                        |
|--------------------------------------------------------------------|-----------------------------------------------------|
| `auth failed  reason='invalid or expired token'`                    | JWT expired (24h default) — user must log in again  |
| `auth failed  reason='API key not found or inactive'`               | Wrong key, revoked key, or key prefix mismatch      |
| `auth failed  reason='API key signature mismatch'`                  | Stored hash doesn't match — recreate the key       |
| `auth failed  reason='API key expired'`                             | `expires_at` set in the past                        |
| `scope denied  required_scope='stt:transcribe'`                     | Key was created with wrong scope                    |
| `sidecar stt unreachable  error='ConnectError: All connection…'`    | Sidecar not running yet, or stuck loading model     |
| `sidecar stt returned error  status=500 response_body_preview='…'`  | Whisper failed on the audio — see sidecar.log       |
| `request  status=502 duration_ms=15 path=/v1/stt`                  | Gateway reached but sidecar rejected — check sidecar.log for the actual error |

### Persistence

`/app/logs/` lives inside the container — add a volume mount if you want
logs to survive a `docker compose down`:

```yaml
volumes:
  - ./logs:/app/logs    # ← add this
```

### Disabling the access log

The default is to log every request at INFO. For quieter prod logs:

```bash
LOG_LEVEL=WARNING docker compose up
```

You'll still see startup/shutdown and errors, but not the per-request lines.

## License

Apache-2.0 (matches the voice-chat sidecar).
