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
#   <public>  = 16 hex chars (8 bytes). NO underscores — auth_deps.py does
#              `parts = raw.split("_")` and uses `parts[2]` as the public
#              fragment, so any '_' in the public would break the lookup.
#   <private> = 43 url-safe chars (32 bytes). May contain '-' or '_' from
#              the base64url alphabet. We extract it positionally.
# We hash the FULL <private> string. Verify must extract it the same way.
# historical note: this used to use `partition("_")` which silently broke
# ~15% of keys (any with an underscore in the public). Now it's positional
# and always works.

def generate_api_key() -> Tuple[str, str, str]:
    # Public: 16 hex chars (no underscores, ever) so the prefix can be
    # extracted unambiguously by auth_deps.py via split("_")[2].
    # Private: 43 base64url chars (~32 bytes). Underscores in private are
    # fine because we extract it positionally, not by split.
    public = secrets.token_hex(8)  # 16 hex chars, e.g. "a1b2c3d4e5f60718"
    private = secrets.token_urlsafe(32)  # 43 base64url chars
    full = f"{API_KEY_PREFIX}{public}_{private}"
    prefix = f"{API_KEY_PREFIX}{public}"
    return full, prefix, hash_secret(private)


def _private_part(plain_key: str) -> str:
    """Extract the private portion of an API key.

    Format: vk_live_<16 hex chars>_<43 base64url chars>
    We use positional slicing (not split) because the public is a fixed
    16-char hex string and the private is the rest. This works regardless
    of whether the private contains '-' or '_' chars from base64url.
    """
    if not plain_key or not plain_key.startswith(API_KEY_PREFIX):
        return ""
    rest = plain_key[len(API_KEY_PREFIX):]
    # Expected shape: <16 hex>_<43 base64url> = 60 chars total
    if len(rest) < 16 + 1 + 1:
        return ""
    if rest[16] != "_":
        return ""
    return rest[17:]


def hash_secret(secret: str) -> str:
    s = get_settings()
    return hmac.new(s.secret_key.encode("utf-8"), secret.encode("utf-8"),
                    hashlib.sha256).hexdigest()


def verify_api_key(plain_key: str, stored_hash: str) -> bool:
    private = _private_part(plain_key)
    if not private:
        return False
    return hmac.compare_digest(hash_secret(private), stored_hash)