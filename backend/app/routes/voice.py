import logging
import time
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..auth_deps import get_api_key, require_scope
from ..config import get_settings
from ..database import get_db
from ..models import ApiKey, UsageLog
from ..schemas import SttResponse, TtsResponse, VoicesResponse
from ..sidecar import SidecarError, get_sidecar

_log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1", tags=["voice"])


def _record(db, api_key, endpoint, status_code, duration_ms,
            bytes_in=0, bytes_out=0, units=0.0, error=None):
    db.add(UsageLog(
        api_key_id=api_key.id, endpoint=endpoint, status_code=status_code,
        duration_ms=duration_ms, bytes_in=bytes_in, bytes_out=bytes_out,
        units=units, error=error,
    ))
    db.commit()


@router.get("/stt/model")
def stt_model():
    return {"model": get_settings().stt_model, "engine": "faster-whisper"}


@router.post("/stt", response_model=SttResponse)
async def stt(
    audio: UploadFile = File(...),
    api_key: ApiKey = Depends(get_api_key),
    db: Session = Depends(get_db),
):
    require_scope(api_key, "stt:transcribe")
    t0 = time.perf_counter()
    audio_bytes = await audio.read()
    if not audio_bytes:
        _record(db, api_key, "/v1/stt", 400, int((time.perf_counter() - t0) * 1000), error="empty audio")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty audio file")

    try:
        result = await get_sidecar().stt(
            audio_bytes,
            filename=audio.filename or "audio.webm",
            content_type=audio.content_type or "audio/webm",
        )
    except SidecarError as e:
        _record(db, api_key, "/v1/stt", e.status_code,
                int((time.perf_counter() - t0) * 1000),
                bytes_in=len(audio_bytes), error=e.detail)
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    duration_ms = int((time.perf_counter() - t0) * 1000)
    words = result.get("words", []) or []
    audio_seconds = 0.0
    if words:
        try:
            audio_seconds = max(float(w.get("end", 0.0)) for w in words)
        except Exception:
            audio_seconds = 0.0
    _record(db, api_key, "/v1/stt", 200, duration_ms,
            bytes_in=len(audio_bytes), units=audio_seconds)
    return SttResponse(
        text=result.get("text", "") or "",
        words=words,
        language="pt",
        duration=audio_seconds or None,
        model=get_settings().stt_model,
    )


@router.post("/tts", response_model=TtsResponse)
async def tts(
    text: str = Form(...),
    voice: str | None = Form(default=None),
    api_key: ApiKey = Depends(get_api_key),
    db: Session = Depends(get_db),
):
    require_scope(api_key, "tts:synthesize")
    if not text or not text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text is required")
    if len(text) > 5000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "text too long (max 5000 chars)")

    t0 = time.perf_counter()
    try:
        _raw, payload = await get_sidecar().tts(text=text, voice=voice)
    except SidecarError as e:
        _record(db, api_key, "/v1/tts", e.status_code,
                int((time.perf_counter() - t0) * 1000),
                bytes_in=len(text.encode("utf-8")), error=e.detail)
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    audio_b64 = payload.get("audio") or ""
    timings = payload.get("timings") or []
    duration_ms = int((time.perf_counter() - t0) * 1000)
    bytes_out = int(len(audio_b64) * 3 / 4) if audio_b64 else 0
    _record(db, api_key, "/v1/tts", 200, duration_ms,
            bytes_in=len(text.encode("utf-8")), bytes_out=bytes_out,
            units=float(len(text)))
    return TtsResponse(
        audio_base64=audio_b64,
        format=payload.get("format", "wav"),
        voice=voice or (payload.get("voice") or "default"),
        model="piper-tts",
        timings=timings,
    )


@router.get("/voices", response_model=VoicesResponse)
async def voices(api_key: ApiKey = Depends(get_api_key)):
    require_scope(api_key, "tts:synthesize")
    try:
        v = await get_sidecar().voices()
    except SidecarError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return VoicesResponse(voices=v, default=v[0] if v else None)
