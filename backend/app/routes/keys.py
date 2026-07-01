from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth_deps import get_current_user
from ..database import get_db
from ..models import ApiKey, User
from ..schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut
from ..security import generate_api_key

router = APIRouter(prefix="/keys", tags=["api-keys"])


def _to_out(row: ApiKey, full_key=None):
    scopes = [s for s in (row.scopes or "").split(",") if s]
    base = ApiKeyOut.model_validate({
        "id": row.id, "name": row.name, "prefix": row.prefix,
        "scopes": scopes, "is_active": row.is_active,
        "last_used_at": row.last_used_at, "expires_at": row.expires_at,
        "created_at": row.created_at, "revoked_at": row.revoked_at,
    })
    if full_key is not None:
        return ApiKeyCreated(**base.model_dump(), key=full_key)
    return base


@router.get("", response_model=List[ApiKeyOut])
def list_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(ApiKey).filter(ApiKey.owner_id == user.id).order_by(ApiKey.created_at.desc()).all()
    return [_to_out(r) for r in rows]


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_key(body: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    full, prefix, hashed = generate_api_key()
    scopes_csv = ",".join(s.strip() for s in body.scopes if s.strip())
    row = ApiKey(
        owner_id=user.id, name=body.name.strip(),
        prefix=prefix, hashed_secret=hashed, scopes=scopes_csv,
        expires_at=body.expires_at, is_active=True,
    )
    db.add(row); db.commit(); db.refresh(row)
    return _to_out(row, full_key=full)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.owner_id == user.id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    row.is_active = False
    row.revoked_at = datetime.utcnow()
    db.commit()
    return None


@router.post("/{key_id}/rotate", response_model=ApiKeyCreated)
def rotate_key(key_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.owner_id == user.id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "API key not found")
    full, prefix, hashed = generate_api_key()
    row.is_active = False
    row.revoked_at = datetime.utcnow()
    new_row = ApiKey(
        owner_id=user.id, name=row.name, prefix=prefix,
        hashed_secret=hashed, scopes=row.scopes,
        expires_at=row.expires_at, is_active=True,
    )
    db.add(new_row); db.commit(); db.refresh(new_row)
    return _to_out(new_row, full_key=full)
