"""SQLAlchemy engine + session setup."""
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_db_url = _settings.resolved_database_url

# Ensure the SQLite file's parent directory exists.
if _db_url.startswith("sqlite"):
    file_path = _db_url.split("sqlite:///", 1)[1]
    if file_path.startswith("/"):
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
    else:
        Path(_settings.data_dir).mkdir(parents=True, exist_ok=True)

_connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}

engine = create_engine(_db_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()