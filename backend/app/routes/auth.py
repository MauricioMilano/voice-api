from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..auth_deps import get_current_user
from ..database import get_db
from ..models import User
from ..schemas import UserRegister, UserLogin, TokenResponse, UserOut
from ..security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
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
    token, expires = create_access_token(subject=str(user.id), extra={"email": user.email})
    return TokenResponse(access_token=token, expires_in=expires)


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token, expires = create_access_token(subject=str(user.id), extra={"email": user.email})
    return TokenResponse(access_token=token, expires_in=expires)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
