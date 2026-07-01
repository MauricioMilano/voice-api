"""Auth dependencies: bearer JWT for dashboard, X-API-Key for voice endpoints."""
from __future__ import annotations
from datetime import datetime
from typing import Optional

import logging
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from .middleware import current_request_id
from .models import ApiKey, User
from .security import decode_access_token, verify_api_key

_log = logging.getLogger("auth")


def _fail(reason: str, status_code: int = 401, **extra) -> HTTPException:
    """Log a structured auth failure and raise."""
    _log.info(
        "auth failed",
        extra={
            "reason": reason,
            "request_id": current_request_id(),
            **extra,
        },
    )
    return HTTPException(status_code, reason)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _fail("missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise _fail("invalid or expired token")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise _fail("invalid token subject")
    user = db.get(User, user_id)
    if not user:
        raise _fail("user not found", user_id=user_id)
    return user


def get_api_key(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> ApiKey:
    raw: Optional[str] = None
    if x_api_key:
        raw = x_api_key.strip()
    elif authorization:
        scheme = authorization.split(" ", 1)[0].lower()
        if scheme == "bearer":
            raw = authorization.split(" ", 1)[1].strip()
    if not raw:
        raise _fail("missing API key (X-API-Key header)")

    parts = raw.split("_")
    if len(parts) < 3 or parts[0] != "vk" or parts[1] != "live":
        raise _fail("malformed API key", prefix=raw[:12] + "…")
    candidate_prefix = f"vk_live_{parts[2]}"

    row = db.query(ApiKey).filter(
        ApiKey.prefix == candidate_prefix, ApiKey.is_active == True
    ).first()
    if not row:
        raise _fail("API key not found or inactive", key_prefix=candidate_prefix)
    if not verify_api_key(raw, row.hashed_secret):
        raise _fail("API key signature mismatch", key_prefix=candidate_prefix)
    if row.expires_at and row.expires_at < datetime.utcnow():
        raise _fail("API key expired", key_id=row.id, key_prefix=candidate_prefix)

    row.last_used_at = datetime.utcnow()
    db.commit()
    # Successful auth — light debug log so you can correlate per-key usage
    _log.debug(
        "api key authorized",
        extra={
            "key_id": row.id,
            "key_name": row.name,
            "key_prefix": row.prefix,
            "owner_id": row.owner_id,
            "request_id": current_request_id(),
        },
    )
    return row


def require_scope(api_key: ApiKey, scope: str) -> None:
    if not api_key.scopes:
        return
    scopes = [s.strip() for s in api_key.scopes.split(",") if s.strip()]
    if scope in scopes or "*" in scopes:
        return
    _log.warning(
        "scope denied",
        extra={
            "key_id": api_key.id,
            "key_name": api_key.name,
            "key_prefix": api_key.prefix,
            "required_scope": scope,
            "granted_scopes": scopes,
            "request_id": current_request_id(),
        },
    )
    raise HTTPException(status.HTTP_403_FORBIDDEN, f"API key missing required scope: {scope}")