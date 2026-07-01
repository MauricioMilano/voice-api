"""Thin async client for the voice-chat sidecar.

Logs every call at INFO level via the `sidecar.client` logger — request URL,
method, status, duration, error body (truncated to 500 chars).
"""
from __future__ import annotations
import logging
import time
from typing import Optional, Tuple

import httpx

from .config import get_settings

_log = logging.getLogger("sidecar.client")


class SidecarError(RuntimeError):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"sidecar {status_code}: {detail}")


class SidecarClient:
    def __init__(self, base_url: Optional[str] = None, timeout: Optional[int] = None):
        s = get_settings()
        self._base = (base_url or s.sidecar_base_url).rstrip("/")
        self._timeout = timeout or s.sidecar_timeout_seconds

    async def health(self) -> bool:
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(self._base + "/voices")
                ok = r.status_code == 200
                _log.debug(
                    "sidecar health",
                    extra={
                        "sidecar_url": self._base,
                        "status": r.status_code,
                        "ok": ok,
                        "duration_ms": int((time.perf_counter() - t0) * 1000),
                    },
                )
                return ok
        except Exception as e:
            _log.warning(
                "sidecar health check failed",
                extra={
                    "sidecar_url": self._base,
                    "error": f"{type(e).__name__}: {e}",
                    "duration_ms": int((time.perf_counter() - t0) * 1000),
                },
            )
            return False

    async def stt(self, audio: bytes, filename: str = "audio.webm",
                  content_type: str = "audio/webm") -> dict:
        files = {"audio": (filename, audio, content_type)}
        url = self._base + "/stt"
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(url, files=files)
        except httpx.RequestError as e:
            duration_ms = int((time.perf_counter() - t0) * 1000)
            _log.error(
                "sidecar stt unreachable",
                extra={"sidecar_url": url, "error": f"{type(e).__name__}: {e}",
                       "duration_ms": duration_ms, "bytes_in": len(audio)},
            )
            raise SidecarError(502, f"sidecar unreachable: {e}") from e

        duration_ms = int((time.perf_counter() - t0) * 1000)
        if r.status_code != 200:
            body_preview = (r.text or "")[:500]
            _log.error(
                "sidecar stt returned error",
                extra={
                    "sidecar_url": url, "status": r.status_code,
                    "duration_ms": duration_ms, "bytes_in": len(audio),
                    "response_body_preview": body_preview,
                },
            )
            raise SidecarError(r.status_code, r.text or "sidecar STT failed")
        try:
            data = r.json()
        except ValueError:
            raise SidecarError(502, "sidecar returned non-JSON response")
        _log.info(
            "sidecar stt ok",
            extra={
                "sidecar_url": url, "status": r.status_code,
                "duration_ms": duration_ms, "bytes_in": len(audio),
                "text_chars": len(data.get("text", "") or ""),
                "word_count": len(data.get("words", []) or []),
            },
        )
        return data

    async def tts(self, text: str, voice: Optional[str] = None) -> Tuple[str, dict]:
        payload: dict = {"text": text}
        if voice:
            payload["voice"] = voice
        url = self._base + "/tts"
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(url, json=payload)
        except httpx.RequestError as e:
            duration_ms = int((time.perf_counter() - t0) * 1000)
            _log.error(
                "sidecar tts unreachable",
                extra={"sidecar_url": url, "error": f"{type(e).__name__}: {e}",
                       "duration_ms": duration_ms, "text_chars": len(text)},
            )
            raise SidecarError(502, f"sidecar unreachable: {e}") from e

        duration_ms = int((time.perf_counter() - t0) * 1000)
        if r.status_code != 200:
            body_preview = (r.text or "")[:500]
            _log.error(
                "sidecar tts returned error",
                extra={
                    "sidecar_url": url, "status": r.status_code,
                    "duration_ms": duration_ms, "text_chars": len(text),
                    "response_body_preview": body_preview,
                },
            )
            raise SidecarError(r.status_code, r.text or "sidecar TTS failed")
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        audio_b64 = data.get("audio") or ""
        _log.info(
            "sidecar tts ok",
            extra={
                "sidecar_url": url, "status": r.status_code,
                "duration_ms": duration_ms, "text_chars": len(text),
                "audio_bytes_out": int(len(audio_b64) * 3 / 4) if audio_b64 else 0,
                "voice": voice,
            },
        )
        return r.text, data

    async def voices(self) -> list:
        url = self._base + "/voices"
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url)
        except httpx.RequestError as e:
            _log.error(
                "sidecar voices unreachable",
                extra={"sidecar_url": url, "error": f"{type(e).__name__}: {e}",
                       "duration_ms": int((time.perf_counter() - t0) * 1000)},
            )
            raise SidecarError(502, f"sidecar unreachable: {e}") from e
        duration_ms = int((time.perf_counter() - t0) * 1000)
        if r.status_code != 200:
            _log.error(
                "sidecar voices error",
                extra={"sidecar_url": url, "status": r.status_code, "duration_ms": duration_ms,
                       "response_body_preview": (r.text or "")[:500]},
            )
            raise SidecarError(r.status_code, r.text or "sidecar voices failed")
        voices = list(r.json().get("voices", []))
        _log.info(
            "sidecar voices ok",
            extra={"sidecar_url": url, "status": r.status_code,
                   "duration_ms": duration_ms, "voice_count": len(voices)},
        )
        return voices


_singleton: Optional[SidecarClient] = None


def get_sidecar() -> SidecarClient:
    global _singleton
    if _singleton is None:
        _singleton = SidecarClient()
    return _singleton