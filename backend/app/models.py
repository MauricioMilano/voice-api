"""Database models."""
from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, Float, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    api_keys: Mapped[List["ApiKey"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    prefix: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    hashed_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    scopes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    owner: Mapped["User"] = relationship(back_populates="api_keys")
    usages: Mapped[List["UsageLog"]] = relationship(back_populates="api_key", cascade="all, delete-orphan")


class UsageLog(Base):
    __tablename__ = "usage_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_key_id: Mapped[int] = mapped_column(ForeignKey("api_keys.id", ondelete="CASCADE"), index=True, nullable=False)
    endpoint: Mapped[str] = mapped_column(String(64), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    units: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True, nullable=False)
    api_key: Mapped["ApiKey"] = relationship(back_populates="usages")


Index("ix_usage_key_created", UsageLog.api_key_id, UsageLog.created_at)