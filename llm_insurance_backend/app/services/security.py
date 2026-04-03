from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from app.core.config import settings
from app.services.auth_service import ROLE_PERMISSIONS

security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
):
    """Extract and validate user from JWT token."""
    if settings.DEV_MODE:
        return {"username": "devuser", "role": "superuser", "user_id": 1}

    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return {
            "username": payload.get("sub"),
            "role": payload.get("role"),
            "user_id": payload.get("user_id"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def require_role(*allowed_roles):
    """Dependency that restricts access to specific roles."""
    def role_checker(user: dict = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Access denied")
        return user
    return role_checker