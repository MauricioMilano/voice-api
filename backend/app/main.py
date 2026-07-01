import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import get_settings
from .database import Base, engine
from .routes import auth as auth_routes
from .routes import keys as keys_routes
from .routes import usage as usage_routes
from .routes import voice as voice_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
settings = get_settings()

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    Path("./data").mkdir(parents=True, exist_ok=True)
    logging.getLogger(__name__).info("Database schema ready (%s)", settings.database_url)


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
app.include_router(voice_routes.router)

STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str = ""):
        target = STATIC_DIR / (full_path or "index.html")
        if target.is_file():
            return FileResponse(str(target))
        index = STATIC_DIR / "index.html"
        if index.is_file():
            return FileResponse(str(index))
        return {"detail": "frontend not built"}
