#!/usr/bin/env bash
# tail-logs.sh — convenience for debugging the running container.
#
# Usage (inside the container):
#   ./scripts/tail-logs.sh                # tail gateway + sidecar interleaved
#   ./scripts/tail-logs.sh gateway        # just the gateway
#   ./scripts/tail-logs.sh sidecar        # just the sidecar
#   ./scripts/tail-logs.sh errors         # only ERROR/WARNING/CRITICAL
#   ./scripts/tail-logs.sh stt            # only STT-related lines
#   ./scripts/tail-logs.sh auth           # only auth/login/key events
#   ./scripts/tail-logs.sh request-id 7f  # lines for a specific request_id
#
# Usage (from host with docker compose):
#   docker compose exec voice-api ./scripts/tail-logs.sh errors
set -euo pipefail

LOGS_DIR="${LOGS_DIR:-/app/logs}"
TARGET="${1:-all}"

case "$TARGET" in
  gateway|g)
    exec tail -F "$LOGS_DIR/gateway.log"
    ;;
  sidecar|s)
    exec tail -F "$LOGS_DIR/sidecar.log"
    ;;
  errors|err|e)
    echo "[tail] errors only across both logs (Ctrl-C to stop)"
    exec tail -F "$LOGS_DIR/gateway.log" "$LOGS_DIR/sidecar.log" | grep --line-buffered -E '\b(ERROR|CRITICAL|WARNING|WARN)\b'
    ;;
  stt|tts|voice)
    echo "[tail] voice events only (Ctrl-C to stop)"
    exec tail -F "$LOGS_DIR/gateway.log" | grep --line-buffered -E 'stt|tts|sidecar|/v1/'
    ;;
  auth|login|key)
    echo "[tail] auth + api-key events only (Ctrl-C to stop)"
    exec tail -F "$LOGS_DIR/gateway.log" | grep --line-buffered -E 'auth|api key|login'
    ;;
  request-id|rid)
    rid="${2:-}"
    if [[ -z "$rid" ]]; then
      echo "Usage: $0 request-id <id-prefix>" >&2
      exit 1
    fi
    echo "[tail] lines containing request_id=$rid"
    exec grep --line-buffered "$rid" "$LOGS_DIR/gateway.log" "$LOGS_DIR/sidecar.log"
    ;;
  all|*)
    echo "[tail] all logs interleaved (Ctrl-C to stop)"
    exec tail -F "$LOGS_DIR/gateway.log" "$LOGS_DIR/sidecar.log"
    ;;
esac