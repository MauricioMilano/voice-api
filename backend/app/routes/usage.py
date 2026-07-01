from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth_deps import get_current_user
from ..database import get_db
from ..models import ApiKey, UsageLog, User
from ..schemas import UsageLogOut, UsageSummary

router = APIRouter(prefix="/usage", tags=["usage"])


def _scope_to_user_keys(db: Session, user: User) -> list:
    rows = db.query(ApiKey.id).filter(ApiKey.owner_id == user.id).all()
    return [r[0] for r in rows]


@router.get("/summary", response_model=UsageSummary)
def summary(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key_ids = _scope_to_user_keys(db, user)
    if not key_ids:
        return UsageSummary(
            total_requests=0, total_bytes_in=0, total_bytes_out=0,
            total_units=0.0, success_count=0, error_count=0, per_endpoint={},
        )
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(UsageLog).filter(UsageLog.api_key_id.in_(key_ids), UsageLog.created_at >= since)

    totals = q.with_entities(
        func.count(UsageLog.id),
        func.coalesce(func.sum(UsageLog.bytes_in), 0),
        func.coalesce(func.sum(UsageLog.bytes_out), 0),
        func.coalesce(func.sum(UsageLog.units), 0.0),
        func.sum(func.iif(UsageLog.status_code.between(200, 299), 1, 0)),
        func.sum(func.iif(UsageLog.status_code.between(400, 599), 1, 0)),
    ).one()

    per_ep_rows = (
        q.with_entities(UsageLog.endpoint, func.count(UsageLog.id))
        .group_by(UsageLog.endpoint).all()
    )
    return UsageSummary(
        total_requests=int(totals[0] or 0),
        total_bytes_in=int(totals[1] or 0),
        total_bytes_out=int(totals[2] or 0),
        total_units=float(totals[3] or 0.0),
        success_count=int(totals[4] or 0),
        error_count=int(totals[5] or 0),
        per_endpoint={ep: cnt for ep, cnt in per_ep_rows},
    )


@router.get("/logs", response_model=list)
def logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    endpoint: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    key_ids = _scope_to_user_keys(db, user)
    if not key_ids:
        return []
    q = db.query(UsageLog).filter(UsageLog.api_key_id.in_(key_ids))
    if endpoint:
        q = q.filter(UsageLog.endpoint == endpoint)
    return q.order_by(UsageLog.created_at.desc()).offset(offset).limit(limit).all()
