from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.services.auth_service import create_access_token, verify_password, hash_password
from app.services.security import get_current_user, require_role
from app.schemas import UserCreate, UserLogin, Token
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    # In DEV_MODE, accept any credentials
    if settings.DEV_MODE:
        token = create_access_token({
            "sub": payload.username,
            "role": "superuser",
            "user_id": 1,
        })
        return {"access_token": token, "token_type": "bearer"}

    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid username or password")

    token = create_access_token({
        "sub": user.username,
        "role": user.role,
        "user_id": user.id,
    })
    return {"access_token": token, "token_type": "bearer"}


@router.post("/register")
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(
        (User.username == payload.username) | (User.email == payload.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    new_user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role="client",  # public self-registration can never grant staff roles
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "User registered successfully",
        "user": {"id": new_user.id, "username": new_user.username, "role": new_user.role},
    }


@router.post("/add-user")
def add_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("superuser")),
):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "message": "User added successfully",
        "user": {"id": new_user.id, "username": new_user.username, "role": new_user.role},
    }


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
