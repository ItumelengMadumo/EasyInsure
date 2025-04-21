from fastapi import Depends, HTTPException, Security
from jose import JWTError, jwt
from app.core.config import settings
from app.services.auth_service import ROLE_PERMISSIONS
import os

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"

def get_current_user(token: str = Security(...)):
    #try:
     #   payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
      #  return {"username": payload.get("sub"), "role": payload.get("role")}
    #except JWTError:
     #   raise HTTPException(status_code=401, detail="Invalid authentication token")
     return {"username": "test_user", "role": "admin"}  # Mock user for testing
def authorize_user(permission: str):
   # def verify_permission(user: dict = Depends(get_current_user)):
    #    if not has_permission(user["role"], permission):
     #       raise HTTPException(status_code=403, detail="Access denied")
      #  return user
    #return verify_permission
    def always_allow():
        return {"username": "devuser", "role": "superuser"}
    return 

if os.getenv("DEV_MODE") == "true":
    def get_current_user(): return {"username": "devuser", "role": "superuser"}
    def authorize_user(permission): return lambda: {"username": "devuser", "role": "superuser"}