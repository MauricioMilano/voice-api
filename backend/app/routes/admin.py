"""Admin endpoints — grants, user list, ledger inspection. Requires is_admin=True."""
from __future__ import annotations
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth_deps import get_current_user
from ..database import get_db
from ..middleware import current_request_id, get_client_ip
from ..models import AdminGrant, LedgerEntry, UsageLog, User, Wallet
from ..schemas import (
    AdminAdjustRequest,
    AdminAdjustResponse,
    AdminBulkGrantRequest,
    AdminBulkGrantResponse,
    AdminBulkGrantResultItem,
    AdminGrantCreate,
    AdminGrantOut,
    AdminUserOut,
    LedgerEntryOut,
)
from .. import wallet as wallet_service

router = APIRouter(prefix="/admin", tags=["admin"])
_log = logging.getLogger("admin")


def _require_admin(user: User) -> None:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "admin only")


@router.post("/grant", response_model=AdminGrantOut, status_code=status.HTTP_201_CREATED)
def grant_vox(
    body: AdminGrantCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin grants Vox to a single user by email."""
    _require_admin(user)
    target = db.query(User).filter(User.email == body.user_email).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"user not found: {body.user_email}")

    try:
        grant = wallet_service.admin_grant(
            db, admin_user=user, target_user=target,
            vox_amount=body.vox_amount, note=body.note,
            request_id=current_request_id(),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    _log.info(
        "admin grant single",
        extra={
            "admin_user_id": user.id, "admin_email": user.email,
            "target_user_id": target.id, "target_email": target.email,
            "vox_amount": body.vox_amount,
            "ip": get_client_ip(request),
            "request_id": current_request_id(),
        },
    )
    return grant


@router.post("/grant/bulk", response_model=AdminBulkGrantResponse, status_code=status.HTTP_201_CREATED)
def grant_vox_bulk(
    body: AdminBulkGrantRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin grants Vox to many users in one request. Each item is processed independently."""
    _require_admin(user)
    results: list[AdminBulkGrantResultItem] = []
    for item in body.grants:
        target = db.query(User).filter(User.email == item.user_email).first()
        if not target:
            results.append(AdminBulkGrantResultItem(
                user_email=item.user_email, status="error", detail="user not found"
            ))
            continue
        try:
            grant = wallet_service.admin_grant(
                db, admin_user=user, target_user=target,
                vox_amount=item.vox_amount, note=item.note,
                request_id=current_request_id(),
            )
            results.append(AdminBulkGrantResultItem(
                user_email=item.user_email, status="ok", grant_id=grant.id
            ))
        except ValueError as e:
            results.append(AdminBulkGrantResultItem(
                user_email=item.user_email, status="error", detail=str(e)
            ))

    _log.info(
        "admin grant bulk",
        extra={
            "admin_user_id": user.id, "admin_email": user.email,
            "count": len(body.grants),
            "ip": get_client_ip(request),
            "request_id": current_request_id(),
        },
    )
    return AdminBulkGrantResponse(results=results)


@router.post("/adjust", response_model=AdminAdjustResponse)
def adjust_vox(
    body: AdminAdjustRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin makes a manual adjustment (positive or negative). Recorded in the ledger."""
    _require_admin(user)
    target = db.query(User).filter(User.email == body.user_email).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"user not found: {body.user_email}")

    try:
        entry = wallet_service.credit(
            db, target.id, body.vox_delta, wallet_service.REASON_ADMIN_ADJUST,
            note=body.note, request_id=current_request_id(),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    _log.info(
        "admin adjust",
        extra={
            "admin_user_id": user.id, "admin_email": user.email,
            "target_user_id": target.id, "target_email": target.email,
            "vox_delta": body.vox_delta, "balance_after": entry.balance_after,
            "ip": get_client_ip(request),
            "request_id": current_request_id(),
        },
    )
    return AdminAdjustResponse(
        user_email=body.user_email,
        vox_delta=body.vox_delta,
        balance_after=entry.balance_after,
        note=body.note,
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all users with their wallet balance. Admin only."""
    _require_admin(user)
    users = db.query(User).order_by(User.created_at.desc()).all()
    out: list[AdminUserOut] = []
    for u in users:
        w = wallet_service.get_or_create_wallet(db, u.id)
        out.append(AdminUserOut(
            id=u.id, email=u.email, name=u.name, is_admin=u.is_admin,
            created_at=u.created_at,
            balance_vox=w.balance_vox,
            lifetime_vox_credited=w.lifetime_vox_credited,
            lifetime_vox_consumed=w.lifetime_vox_consumed,
        ))
    return out


@router.get("/grants", response_model=list[AdminGrantOut])
def list_grants(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all admin grants, newest first. Admin only."""
    _require_admin(user)
    return db.query(AdminGrant).order_by(AdminGrant.created_at.desc()).limit(limit).all()


@router.get("/users/{target_user_id}/ledger", response_model=list[LedgerEntryOut])
def get_user_ledger(
    target_user_id: int,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspect a specific user's ledger. Admin only."""
    _require_admin(user)
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"user not found: {target_user_id}")
    return (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == target_user_id)
        .order_by(LedgerEntry.occurred_at.desc())
        .offset(offset).limit(limit).all()
    )


@router.get("/usage", response_model=dict)
def global_usage(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregated usage across all users. Admin only."""
    _require_admin(user)
    since = datetime.utcnow() - timedelta(days=days)
    totals = (
        db.query(
            func.count(UsageLog.id),
            func.coalesce(func.sum(UsageLog.vox_charged), 0),
            func.coalesce(func.sum(UsageLog.units), 0.0),
        )
        .filter(UsageLog.created_at >= since)
        .one()
    )
    return {
        "days": days,
        "since": since.isoformat() + "Z",
        "total_requests": int(totals[0] or 0),
        "total_vox_charged": int(totals[1] or 0),
        "total_units": float(totals[2] or 0.0),
    }
