from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Claim
from app.services.security import require_role

router = APIRouter(prefix="/tier2", tags=["Tier 2 Claims"])


@router.get("/claims")
def get_tier2_claims(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("intermediate_officer", "senior_officer", "superuser")),
):
    claims = db.query(Claim).filter(Claim.tier == 2).all()
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
