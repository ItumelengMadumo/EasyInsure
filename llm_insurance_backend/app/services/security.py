from fastapi import Depends, HTTPException, Security
from jose import JWTError, jwt
from app.core.config import settings
from app.services.auth_service import ROLE_PERMISSIONS

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

def get_current_user(token: str = Security(...)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"username": payload.get("sub"), "role": payload.get("role")}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

def authorize_user(permission: str):
    def verify_permission(user: dict = Depends(get_current_user)):
        if not has_permission(user["role"], permission):
            raise HTTPException(status_code=403, detail="Access denied")
        return user
    return verify_permission
