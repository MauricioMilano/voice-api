#!/usr/bin/env bash
# In-container supervisor: launches sidecar (whisper-large-v3-turbo + piper-tts)
# on :8001 and the FastAPI gateway on :8080. SIGTERM/SIGINT cleanly shut both.
#
# All process output is streamed to /app/logs/{sidecar,gateway}.log AND
# the original stdout/stderr is preserved (so `docker logs` still works).
set -uo pipefail

mkdir -p /app/data /app/logs

# Defaults if env not set
: "${LOG_LEVEL:=INFO}"
: "${LOG_FORMAT:=text}"
export LOG_LEVEL LOG_FORMAT PYTHONUNBUFFERED=1

echo "[start] launching sidecar on :8001 (log: /app/logs/sidecar.log)"
(
  cd /app/sidecar
  exec python -m uvicorn main:app \
       --host 0.0.0.0 --port 8001 \
       --log-level "$LOG_LEVEL" \
       2>&1
) | tee /app/logs/sidecar.log &
SIDECAR_PID=$!

echo "[start] launching gateway on :8080 (log: /app/logs/gateway.log)"
(
  cd /app/backend
  exec python -m uvicorn app.main:app \
       --host 0.0.0.0 --port 8080 \
       --workers 1 \
       --log-level "$LOG_LEVEL" \
       --no-access-log \
       2>&1
) | tee /app/logs/gateway.log &
GATEWAY_PID=$!

# Quick health pings — surface issues immediately instead of silent failures
sleep 3
if ! curl -sf http://127.0.0.1:8001/voices > /dev/null; then
  echo "[start][WARN] sidecar not reachable on :8001 yet (model may still be loading)"
fi
if ! curl -sf http://127.0.0.1:8080/healthz > /dev/null; then
  echo "[start][WARN] gateway not reachable on :8080"
fi

cleanup() {
  echo "[start] shutting down (SIGTERM)"
  kill -TERM "$SIDECAR_PID" "$GATEWAY_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

wait