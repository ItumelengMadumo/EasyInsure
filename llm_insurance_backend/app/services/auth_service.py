from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


ROLE_PERMISSIONS = {
    "client": ["view_own_claims", "submit_claim"],
    "junior_officer": ["view_tier1_claims", "process_tier1"],
    "intermediate_officer": ["view_tier1_claims", "view_tier2_claims", "process_tier1", "process_tier2"],
    "senior_officer": ["view_all_claims", "process_tier1", "process_tier2", "process_tier3", "assign_claims", "approve_claims"],
    "superuser": ["view_all_claims", "manage_users", "approve_claims", "system_config"],
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, [])
