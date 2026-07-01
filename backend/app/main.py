"""FastAPI entrypoint. Serves dashboard API + voice API + (optional) static React UI."""
from __future__ import annotations
import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import get_settings
from .database import Base, engine
from .logging_config import configure_logging, get_logger
from .middleware import RequestContextMiddleware
from .routes import admin as admin_routes
from .routes import auth as auth_routes
from .routes import keys as keys_routes
from .routes import usage as usage_routes
from .routes import voice as voice_routes
from .routes import wallet as wallet_routes

# Configure logging BEFORE anything else uses it
configure_logging()

settings = get_settings()
_log = get_logger("app")

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "API gateway for STT/TTS voice services. "
        "Authenticate voice endpoints with an `X-API-Key` header "
        "(or `Authorization: Bearer <key>`). Dashboard endpoints use a JWT bearer."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — must come before our middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request context + access logging
app.add_middleware(RequestContextMiddleware)


@app.on_event("startup")
def on_startup() -> None:
    from .database import engine as _engine
    Base.metadata.create_all(bind=_engine)
    _log.info(
        "startup complete",
        extra={
            "service": settings.app_name,
            "database": settings.database_url,
            "database_resolved": settings.resolved_database_url,
            "data_dir": settings.data_dir,
            "sidecar": settings.sidecar_base_url,
            "stt_model": settings.stt_model,
            "log_level": os.getenv("LOG_LEVEL", "INFO"),
            "log_format": os.getenv("LOG_FORMAT", "text"),
        },
    )


@app.on_event("shutdown")
def on_shutdown() -> None:
    _log.info("shutdown complete")


@app.get("/api/meta", tags=["meta"])
def meta():
    return {"service": settings.app_name, "version": "0.1.0",
            "stt_model": settings.stt_model, "docs": "/docs"}


@app.get("/healthz", tags=["meta"])
def healthz():
    return {"status": "ok"}


app.include_router(auth_routes.router, prefix="/api")
app.include_router(keys_routes.router, prefix="/api")
app.include_router(usage_routes.router, prefix="/api")
app.include_router(wallet_routes.router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")
app.include_router(voice_routes.router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    _log.info("static frontend mounted", extra={"path": str(STATIC_DIR)})

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str = ""):
        target = STATIC_DIR / (full_path or "index.html")
        if target.is_file():
            return FileResponse(str(target))
        index = STATIC_DIR / "index.html"
        if index.is_file():
            return FileResponse(str(index))
        return JSONResponse({"detail": "frontend not built"}, status_code=404)
else:
    _log.warning("static frontend NOT found at %s — only API endpoints available", STATIC_DIR)