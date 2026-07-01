#!/usr/bin/env bash
# In-container supervisor: launches sidecar (whisper-large-v3-turbo + piper-tts)
# on :8001 and the FastAPI gateway on :8080. SIGTERM/SIGINT cleanly shut both.
#
# All process output is streamed to /app/logs/{sidecar,gateway}.log AND
# stdout (so `docker logs` shows them too).
set -uo pipefail

mkdir -p /app/data /app/logs

# ----------------------------------------------------------------------
# Resolve configuration from env (with safe defaults + validation)
# ----------------------------------------------------------------------
: "${LOG_LEVEL:=INFO}"
: "${LOG_FORMAT:=text}"
export LOG_LEVEL LOG_FORMAT PYTHONUNBUFFERED=1

# uvicorn accepts only lowercase log levels; normalize + validate.
LOG_LEVEL_LC=$(printf '%s' "$LOG_LEVEL" | tr '[:upper:]' '[:lower:]')
case "$LOG_LEVEL_LC" in
  critical|error|warning|warn|info|debug|trace) ;;
  *)
    echo "[start][WARN] unknown LOG_LEVEL='$LOG_LEVEL' — falling back to 'info'"
    LOG_LEVEL_LC=info
    ;;
esac

# ----------------------------------------------------------------------
# Loud, visible startup banner — printed BEFORE we fork anything
# ----------------------------------------------------------------------
echo "============================================================"
echo "[start] voice-api container starting"
echo "[start] timestamp     : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[start] python        : $(python --version 2>&1)"
echo "[start] uvicorn       : $(python -c 'import uvicorn; print(uvicorn.__version__)' 2>&1)"
echo "[start] LOG_LEVEL     : ${LOG_LEVEL} (-> '${LOG_LEVEL_LC}' for uvicorn)"
echo "[start] LOG_FORMAT    : ${LOG_FORMAT}"
echo "[start] SIDECAR_BASE  : ${SIDECAR_BASE_URL:-http://127.0.0.1:8001}"
echo "[start] DATABASE_URL  : ${DATABASE_URL:-sqlite:///./data/voice_api.db}"
echo "[start] ports         : gateway=8080  sidecar=8001"
echo "[start] logs dir      : /app/logs/"
echo "============================================================"

echo "[start] launching sidecar on :8001  (log: /app/logs/sidecar.log)"
(
  cd /app/sidecar
  exec python -m uvicorn main:app \
       --host 0.0.0.0 --port 8001 \
       --log-level "$LOG_LEVEL_LC" \
       2>&1
) | tee /app/logs/sidecar.log &
SIDECAR_PID=$!
echo "[start] sidecar pid   : ${SIDECAR_PID}"

echo "[start] launching gateway on :8080 (log: /app/logs/gateway.log)"
(
  cd /app/backend
  exec python -m uvicorn app.main:app \
       --host 0.0.0.0 --port 8080 \
       --workers 1 \
       --log-level "$LOG_LEVEL_LC" \
       --no-access-log \
       2>&1
) | tee /app/logs/gateway.log &
GATEWAY_PID=$!
echo "[start] gateway pid   : ${GATEWAY_PID}"

# ----------------------------------------------------------------------
# Boot health-check window — poll both services for up to 90s, log progress
# ----------------------------------------------------------------------
echo "[start] waiting for services to become healthy..."
deadline=$(( $(date +%s) + 90 ))
sidecar_ok=0
gateway_ok=0
attempt=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  attempt=$((attempt + 1))
  if [ "$sidecar_ok" -eq 0 ] && curl -sf http://127.0.0.1:8001/voices > /dev/null 2>&1; then
    sidecar_ok=1; echo "[start] sidecar UP after ${attempt}s"
  fi
  if [ "$gateway_ok" -eq 0 ] && curl -sf http://127.0.0.1:8080/healthz > /dev/null 2>&1; then
    gateway_ok=1; echo "[start] gateway UP after ${attempt}s"
  fi
  if [ "$sidecar_ok" -eq 1 ] && [ "$gateway_ok" -eq 1 ]; then
    echo "[start] all services healthy — ready"
    break
  fi
  # Log every 10s if not yet up
  if [ $((attempt % 10)) -eq 0 ]; then
    echo "[start]   still waiting... sidecar=${sidecar_ok} gateway=${gateway_ok}"
    if ! kill -0 "$SIDECAR_PID" 2>/dev/null; then
      echo "[start][ERROR] sidecar process died — last 20 lines of log:"
      tail -n 20 /app/logs/sidecar.log | sed 's/^/[sidecar] /'
    fi
    if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
      echo "[start][ERROR] gateway process died — last 20 lines of log:"
      tail -n 20 /app/logs/gateway.log | sed 's/^/[gateway] /'
    fi
  fi
  sleep 1
done

if [ "$sidecar_ok" -eq 0 ]; then
  echo "[start][ERROR] sidecar never became healthy within 90s"
fi
if [ "$gateway_ok" -eq 0 ]; then
  echo "[start][ERROR] gateway never became healthy within 90s"
fi

cleanup() {
  echo "[start] shutting down (SIGTERM)"
  kill -TERM "$SIDECAR_PID" "$GATEWAY_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup SIGTERM SIGINT

wait