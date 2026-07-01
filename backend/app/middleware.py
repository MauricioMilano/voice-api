"""Request-context middleware.

Adds a unique request_id to every request (returned in `X-Request-ID` header),
emits a structured access log per request, and exposes the request_id via
contextvars so any log line produced during a request can be correlated.
"""
from __future__ import annotations
import logging
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def current_request_id() -> str:
    return _request_id_var.get()


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "?"


def _api_key_prefix(request: Request) -> str | None:
    """Best-effort extraction of the API key prefix for logging — never logs the secret."""
    raw = request.headers.get("x-api-key") or ""
    if not raw:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            raw = auth.split(" ", 1)[1].strip()
    if not raw or "_" not in raw:
        return None
    parts = raw.split("_")
    if len(parts) >= 3 and parts[0] == "vk" and parts[1] == "live":
        return f"vk_live_{parts[2]}"
    # Not one of ours — log first 8 chars only
    return raw[:8] + "…"


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, logger_name: str = "access") -> None:
        super().__init__(app)
        self._log = logging.getLogger(logger_name)

    async def dispatch(self, request: Request, call_next) -> Response:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = _request_id_var.set(rid)

        t0 = time.perf_counter()
        status = 500
        err: str | None = None
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        except Exception as e:  # noqa: BLE001 — log anything uncaught
            err = f"{type(e).__name__}: {e}"
            raise
        finally:
            dt_ms = int((time.perf_counter() - t0) * 1000)
            extra = {
                "request_id": rid,
                "method": request.method,
                "path": request.url.path,
                "query": request.url.query or None,
                "status": status,
                "duration_ms": dt_ms,
                "client_ip": get_client_ip(request),
                "user_agent": request.headers.get("user-agent", "-"),
                "key_prefix": _api_key_prefix(request),
                "bytes_in": int(request.headers.get("content-length") or 0),
            }
            if err:
                extra["error"] = err
                self._log.error("request failed", extra=extra)
            elif status >= 500:
                self._log.error("request", extra=extra)
            elif status >= 400:
                self._log.warning("request", extra=extra)
            else:
                self._log.info("request", extra=extra)
            _request_id_var.reset(token)
            # Attach header on the way out
            try:
                if "response" in locals() and response is not None:
                    response.headers["X-Request-ID"] = rid
            except Exception:  # noqa: BLE001
                pass