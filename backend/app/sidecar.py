import logging
from typing import Optional, Tuple
import httpx
from .config import get_settings

_log = logging.getLogger(__name__)


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
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(self._base + "/voices")
                return r.status_code == 200
        except Exception as e:
            _log.warning("sidecar health check failed: %s", e)
            return False

    async def stt(self, audio: bytes, filename: str = "audio.webm", content_type: str = "audio/webm") -> dict:
        files = {"audio": (filename, audio, content_type)}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._base + "/stt", files=files)
        except httpx.RequestError as e:
            raise SidecarError(502, f"sidecar unreachable: {e}") from e
        if r.status_code != 200:
            raise SidecarError(r.status_code, r.text or "sidecar STT failed")
        try:
            return r.json()
        except ValueError:
            raise SidecarError(502, "sidecar returned non-JSON response")

    async def tts(self, text: str, voice: Optional[str] = None) -> Tuple[str, dict]:
        payload: dict = {"text": text}
        if voice:
            payload["voice"] = voice
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                r = await client.post(self._base + "/tts", json=payload)
        except httpx.RequestError as e:
            raise SidecarError(502, f"sidecar unreachable: {e}") from e
        if r.status_code != 200:
            raise SidecarError(r.status_code, r.text or "sidecar TTS failed")
        return r.text, r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    async def voices(self) -> list:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(self._base + "/voices")
        except httpx.RequestError as e:
            raise SidecarError(502, f"sidecar unreachable: {e}") from e
        if r.status_code != 200:
            raise SidecarError(r.status_code, r.text or "sidecar voices failed")
        return list(r.json().get("voices", []))


_singleton: Optional[SidecarClient] = None

def get_sidecar() -> SidecarClient:
    global _singleton
    if _singleton is None:
        _singleton = SidecarClient()
    return _singleton
