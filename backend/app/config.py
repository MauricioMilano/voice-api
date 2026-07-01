from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "VoiceAPI Gateway"
    secret_key: str = Field(default="dev-only-change-me-please", min_length=16)
    access_token_expire_minutes: int = 60 * 24

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
