"""User registration & login — with structured event logging."""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..auth_deps import get_current_user
from ..database import get_db
from ..middleware import current_request_id, get_client_ip
from ..models import User
from ..schemas import UserRegister, UserLogin, TokenResponse, UserOut
from ..security import hash_password, verify_password, create_access_token
from .. import wallet as wallet_service

router = APIRouter(prefix="/auth", tags=["auth"])
_log = logging.getLogger("auth.events")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister, request: Request, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        _log.warning(
            "registration rejected: email already registered",
            extra={"email": body.email.lower(), "ip": get_client_ip(request),
                   "request_id": current_request_id()},
        )
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Rule: when no users exist, the first registration becomes admin.
    # Every subsequent registration is a regular user. This applies at DB
    # boot time — if the original admin is removed later, the next user to
    # register will also be promoted to admin. (To restore admin without
    # adding a user, promote via SQL: UPDATE users SET is_admin=1 WHERE id=?)
    is_first = db.query(User).count() == 0
    user = User(
        email=body.email.lower(),
        name=body.name.strip(),
        hashed_password=hash_password(body.password),
        is_admin=is_first,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    trial_entry = wallet_service.grant_trial(db, user, request_id=current_request_id())

    token, expires = create_access_token(subject=str(user.id), extra={"email": user.email})
    _log.info(
        "user registered",
        extra={
            "user_id": user.id,
            "email": user.email,
            "is_admin": is_first,
            "trial_vox": wallet_service.FREE_TRIAL_VOX,
            "trial_balance_after": trial_entry.balance_after,
            "ip": get_client_ip(request),
            "request_id": current_request_id(),
        },
    )
    return TokenResponse(access_token=token, expires_in=expires)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        _log.warning(
            "login failed",
            extra={
                "email": body.email.lower(),
                "user_exists": user is not None,
                "ip": get_client_ip(request),
                "request_id": current_request_id(),
            },
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    token, expires = create_access_token(subject=str(user.id), extra={"email": user.email})
    _log.info(
        "login success",
        extra={
            "user_id": user.id,
            "email": user.email,
            "ip": get_client_ip(request),
            "request_id": current_request_id(),
        },
    )
    return TokenResponse(access_token=token, expires_in=expires)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user