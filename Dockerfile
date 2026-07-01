# syntax=docker/dockerfile:1.7

# =====================================================================
# VoiceAPI Gateway — single image with: frontend + gateway + sidecar
# =====================================================================

# ---- Stage 1: build React/Vite frontend ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend (FastAPI gateway) ----
FROM python:3.11-slim AS backend
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc curl && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=web /web/dist ./app/static
RUN mkdir -p /app/data

# ---- Stage 3: sidecar (voice-chat: whisper-large-v3-turbo + piper-tts) ----
FROM python:3.11-slim AS sidecar
WORKDIR /app/sidecar
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc git && rm -rf /var/lib/apt/lists/*
ARG SIDECAR_REPO=https://github.com/MauricioMilano/voice-chat.git
ARG SIDECAR_REF=main
RUN git clone --depth 1 --branch ${SIDECAR_REF} ${SIDECAR_REPO} /tmp/voice-chat \
    && cp -r /tmp/voice-chat/sidecar/. /app/sidecar/ \
    && rm -rf /tmp/voice-chat
RUN pip install --no-cache-dir -r requirements.txt \
    && (pip install --no-cache-dir piper-tts || true)

# ---- Final stage: combine everything in one image ----
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc git curl ca-certificates tini && rm -rf /var/lib/apt/lists/*

# Backend (gateway + built frontend)
COPY --from=backend /app/backend /app/backend
# Sidecar
COPY --from=sidecar /app/sidecar /app/sidecar

# Install ALL python deps needed at runtime:
#  - backend/gateway: see backend/requirements.txt
#  - sidecar (whisper + piper): fastapi, uvicorn, faster-whisper, piper-tts, numpy
COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN pip install --no-cache-dir -r /tmp/backend-requirements.txt \
    && pip install --no-cache-dir \
        'faster-whisper' 'piper-tts' numpy 'huggingface-hub>=0.24' \
    && rm /tmp/backend-requirements.txt

# Volume for persistent DB + voices cache
RUN mkdir -p /app/data /app/sidecar/voices /app/logs

EXPOSE 8080 8001
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD curl -fsS http://127.0.0.1:8080/healthz || exit 1

COPY scripts/start.sh scripts/wait_sidecar.py /app/
RUN chmod +x /app/start.sh

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/bin/bash", "/app/start.sh"]
