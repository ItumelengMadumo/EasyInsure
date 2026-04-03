from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Claim
from app.services.security import require_role

router = APIRouter(prefix="/tier3", tags=["Tier 3 Claims"])


@router.get("/claims")
def get_tier3_claims(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("senior_officer", "superuser")),
):
    claims = db.query(Claim).filter(Claim.tier == 3).all()
    return [
        {
            "id": c.id,
            "claim_number": c.claim_number,
            "description": c.description,
            "status": c.status,
            "amount_requested": c.amount_requested,
            "suggested_payout": c.suggested_payout,
        }
        for c in claims
    ]
