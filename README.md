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

## License

Apache-2.0 (matches the voice-chat sidecar).
