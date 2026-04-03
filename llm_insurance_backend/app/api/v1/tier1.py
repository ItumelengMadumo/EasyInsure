from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Claim
from app.services.security import require_role
from app.services.decision_pipeline import process_claim

router = APIRouter(prefix="/tier1", tags=["Tier 1 Claims"])


@router.get("/claims")
def get_tier1_claims(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("junior_officer", "intermediate_officer", "senior_officer", "superuser")),
):
    claims = db.query(Claim).filter(Claim.tier == 1).all()
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
