from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.security import authorize_user, get_current_user
from app.models.claim import Claim
from app.database import get_db

router = APIRouter()

@router.get("/claims")
def get_all_claims(
    user=Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Retrieve claims based on user role:
    - Clients: Only see their own claims.
    - Officers: See claims based on their seniority.
    """
    if user["role"] == "client":
        # Clients can only see their own claims
        return db.query(Claim).filter(Claim.client_id == user["username"]).all()
    elif user["role"] == "officer":
        # Officers see claims based on their seniority
        if user["seniority"] == "junior":
            # Junior officers see claims with value < 1000
            return db.query(Claim).filter(Claim.claim_value < 1000).all()
        elif user["seniority"] == "mid":
            # Mid-level officers see claims with value < 5000
            return db.query(Claim).filter(Claim.claim_value < 5000).all()
        elif user["seniority"] == "senior":
            # Senior officers see all claims
            return db.query(Claim).all()
        else:
            raise HTTPException(status_code=403, detail="Invalid seniority level")
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role")

@router.get("/claims/{claim_id}")
def get_claim(
    claim_id: int, 
    user=Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Retrieve a specific claim based on user role:
    - Clients: Can only access their own claims.
    - Officers: Can access claims based on their seniority.
    """
    claim = db.query(Claim).filter(Claim.id == claim_id).first()

    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if user["role"] == "client":
        # Clients can only access their own claims
        if claim.client_id != user["username"]:
            raise HTTPException(status_code=403, detail="Access denied")
    elif user["role"] == "officer":
        # Officers can access claims based on their seniority
        if user["seniority"] == "junior" and claim.claim_value >= 1000:
            raise HTTPException(status_code=403, detail="Access denied")
        elif user["seniority"] == "mid" and claim.claim_value >= 5000:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role")

    return claim
