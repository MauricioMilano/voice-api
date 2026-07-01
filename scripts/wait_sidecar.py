"""Block until the sidecar answers /voices (max 300s)."""
import sys, time
import httpx

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
deadline = time.time() + 300
while time.time() < deadline:
    try:
        r = httpx.get(url + "/voices", timeout=2.0)
        if r.status_code == 200:
            print(f"[wait] sidecar ready at {url}")
            sys.exit(0)
    except Exception:
        pass
    time.sleep(2)
print("[wait] sidecar never became ready", file=sys.stderr)
sys.exit(1)
