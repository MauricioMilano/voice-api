"""Wallet endpoints — saldo e ledger do próprio usuário."""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth_deps import get_current_user
from ..database import get_db
from ..models import LedgerEntry, User
from ..schemas import LedgerEntryOut, WalletOut
from .. import wallet as wallet_service

router = APIRouter(prefix="/wallet", tags=["wallet"])


@router.get("", response_model=WalletOut)
def get_wallet(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    w = wallet_service.get_or_create_wallet(db, user.id)
    return w


@router.get("/ledger", response_model=list[LedgerEntryOut])
def get_ledger(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    reason: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(LedgerEntry).filter(LedgerEntry.user_id == user.id)
    if reason:
        q = q.filter(LedgerEntry.reason == reason)
    return q.order_by(LedgerEntry.occurred_at.desc()).offset(offset).limit(limit).all()
