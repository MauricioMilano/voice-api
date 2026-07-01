from datetime import datetime
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import ApiKey, User
from .security import decode_access_token, verify_api_key


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token subject")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
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
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing API key (X-API-Key header)")

    parts = raw.split("_")
    if len(parts) < 3 or parts[0] != "vk" or parts[1] != "live":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed API key")
    candidate_prefix = f"vk_live_{parts[2]}"

    row = db.query(ApiKey).filter(ApiKey.prefix == candidate_prefix, ApiKey.is_active == True).first()
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    if not verify_api_key(raw, row.hashed_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    if row.expires_at and row.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key expired")
    row.last_used_at = datetime.utcnow()
    db.commit()
    return row


def require_scope(api_key: ApiKey, scope: str):
    if not api_key.scopes:
        return
    scopes = [s.strip() for s in api_key.scopes.split(",") if s.strip()]
    if scope in scopes or "*" in scopes:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, f"API key missing required scope: {scope}")
