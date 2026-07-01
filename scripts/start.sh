#!/usr/bin/env bash
# Launches the sidecar (voice-chat, port 8001) and the gateway (port 8080)
# in the same container. SIGTERM/SIGINT cleanly shut both down.
set -euo pipefail

mkdir -p /app/data /app/sidecar-data /app/logs
export PYTHONUNBUFFERED=1

echo "[start] launching sidecar on :8001"
cd /app/sidecar
# Run sidecar via uvicorn so we can override the port (main.py hardcodes 8000)
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8001 --log-level info > /app/logs/sidecar.log 2>&1 &
SIDECAR_PID=$!

echo "[start] launching gateway on :8080"
cd /app/backend
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --workers 1 --log-level info > /app/logs/gateway.log 2>&1 &
GATEWAY_PID=$!

trap "echo '[start] shutting down'; kill -TERM \$SIDECAR_PID \$GATEWAY_PID 2>/dev/null || true; wait; exit 0" SIGTERM SIGINT
wait
