from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from app.models.user import User
from app.services.auth_service import create_access_token, verify_password, get_password_hash
from app.database import get_db
from app.core.config import settings
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
import secrets

router = APIRouter()

# Email configuration
conf = ConnectionConfig(
    MAIL_USERNAME="your_email@example.com",
    MAIL_PASSWORD="your_email_password",
    MAIL_FROM="your_email@example.com",
    MAIL_PORT=587,
    MAIL_SERVER="smtp.gmail.com",
    MAIL_TLS=True,
    MAIL_SSL=False,
    USE_CREDENTIALS=True
)

@router.post("/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=400, detail="Invalid username or password")

    token = create_access_token({"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}

@router.post("/register")
def register(username: str, password: str, role: str, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(password)
    new_user = User(username=username, password=hashed_password, role=role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully", "user": {"username": new_user.username, "role": new_user.role}}

@router.post("/add_user")
def add_user(superuser_username: str, username: str, password: str, role: str, db: Session = Depends(get_db)):
    superuser = db.query(User).filter(User.username == superuser_username).first()
    if not superuser or superuser.role != "superuser":
        raise HTTPException(status_code=403, detail="Only superusers can add users")

    existing_user = db.query(User).filter(User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(password)
    new_user = User(username=username, password=hashed_password, role=role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User added successfully", "user": {"username": new_user.username, "role": new_user.role}}

@router.post("/reset_password")
def reset_password(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate a temporary password
    temp_password = secrets.token_urlsafe(8)
    hashed_password = get_password_hash(temp_password)
    user.password = hashed_password
    db.commit()

    # Send the temporary password via email
    message = MessageSchema(
        subject="Password Reset",
        recipients=[user.email],  # Ensure the User model has an email field
        body=f"Your temporary password is: {temp_password}",
        subtype="plain"
    )

    fm = FastMail(conf)
    fm.send_message(message)

    return {"message": "Temporary password sent to your email"}
