"""App configuration loaded from environment / .env."""
from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "VoiceAPI Gateway"
    secret_key: str = Field(default="dev-only-change-me-please", min_length=16)
    access_token_expire_minutes: int = 60 * 24

    # Where SQLite (or any local file-backed DB) lives.
    # In Docker this is /app/data (a volume mount).
    # In local dev this is ./data (relative to wherever you launch).
    data_dir: str = "/app/data"

    database_url: str = "sqlite:///./data/voice_api.db"

    sidecar_base_url: str = "http://127.0.0.1:8001"
    sidecar_timeout_seconds: int = 120

    cors_origins: str = "http://localhost:8080,http://127.0.0.1:8080"

    stt_model: str = "whisper-large-v3-turbo"

    @property
    def cors_origin_list(self) -> List[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    @property
    def resolved_database_url(self) -> str:
        """Resolve a (possibly relative) sqlite URL to an absolute one.

        Examples:
            sqlite:////app/data/voice_api.db                       → unchanged (absolute)
            sqlite:///voice_api.db + data_dir=/app/data             → sqlite:////app/data/voice_api.db
            sqlite:///./data/voice_api.db + data_dir=/app/data      → sqlite:////app/data/voice_api.db
            sqlite:///./voice_api.db + data_dir=/app/data           → sqlite:////app/data/voice_api.db
            postgresql+psycopg://...                                → unchanged
        """
        url = self.database_url
        if not url.startswith("sqlite"):
            return url
        prefix = "sqlite:///"
        if not url.startswith(prefix):
            return url
        path = url[len(prefix):]
        if path.startswith("/"):
            # Already absolute: sqlite:////abs/path
            return url
        # Relative path — strip the leading "./" so it doesn't end up duplicated.
        rel = path[2:] if path.startswith("./") else path
        # If the data_dir's last component appears at the start of the path,
        # strip it too — that handles "./data/foo.db" → "foo.db" when data_dir is "/app/data".
        from pathlib import PurePosixPath
        data_basename = PurePosixPath(self.data_dir).name
        rel_parts = rel.split("/", 1)
        if rel_parts and rel_parts[0] == data_basename:
            rel = rel_parts[1] if len(rel_parts) > 1 else ""
        return f"{prefix}{self.data_dir.rstrip('/')}/{rel}"


@lru_cache
def get_settings() -> Settings:
    return Settings()