"""Password hashing + JWT + API-key helpers."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

import bcrypt
from jose import jwt, JWTError

from .config import get_settings


API_KEY_PREFIX = "vk_live_"
_BCRYPT_MAX_LEN = 72


def _truncate(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_LEN]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_truncate(plain), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_truncate(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(subject: str, extra: Optional[dict] = None,
                         expires_minutes: Optional[int] = None) -> Tuple[str, int]:
    s = get_settings()
    exp_minutes = expires_minutes if expires_minutes is not None else s.access_token_expire_minutes
    expire = datetime.utcnow() + timedelta(minutes=exp_minutes)
    payload = {"sub": subject, "exp": expire}
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, s.secret_key, algorithm="HS256")
    return token, exp_minutes * 60


def decode_access_token(token: str) -> Optional[dict]:
    s = get_settings()
    try:
        return jwt.decode(token, s.secret_key, algorithms=["HS256"])
    except JWTError:
        return None


# ---------- API keys ----------
# Format: vk_live_<public>_<private>
#   <public>  = 8 url-safe bytes (no separator chars we care about)
#   <private> = 32 url-safe bytes — CAN contain '-' and '_' (base64url alphabet)
# We hash the FULL <private> string. Verify must extract it the same way
# (using partition on the FIRST '_' after the prefix), not rsplit.

def generate_api_key() -> Tuple[str, str, str]:
    public = secrets.token_urlsafe(8)
    private = secrets.token_urlsafe(32)
    full = f"{API_KEY_PREFIX}{public}_{private}"
    prefix = f"{API_KEY_PREFIX}{public}"
    return full, prefix, hash_secret(private)


def _private_part(plain_key: str) -> str:
    """Extract the private portion of an API key (everything after the public segment)."""
    if not plain_key or not plain_key.startswith(API_KEY_PREFIX):
        return ""
    rest = plain_key[len(API_KEY_PREFIX):]
    # rest = "<public>_<private>"  — split on the FIRST '_' only
    public, sep, private = rest.partition("_")
    if not sep or not public or not private:
        return ""
    return private


def hash_secret(secret: str) -> str:
    s = get_settings()
    return hmac.new(s.secret_key.encode("utf-8"), secret.encode("utf-8"),
                    hashlib.sha256).hexdigest()


def verify_api_key(plain_key: str, stored_hash: str) -> bool:
    private = _private_part(plain_key)
    if not private:
        return False
    return hmac.compare_digest(hash_secret(private), stored_hash)