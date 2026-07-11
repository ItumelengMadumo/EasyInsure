from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import uuid

from app.database import get_db
from app.models.models import Policy, Asset, User
from app.services.security import get_current_user, require_role
from app.services.valuation_service import get_current_valuation, record_valuation
from app.schemas import PolicyCreate

router = APIRouter(prefix="/policies", tags=["Policies"])


@router.post("/")
def create_policy(
    payload: PolicyCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a new policy and insure selected assets under it.
    Policy number is auto-generated. Assets must already be registered."""
    user_id = user.get("user_id", 1)

    # Validate all asset_ids exist and belong to the user
    assets = db.query(Asset).filter(Asset.id.in_(payload.asset_ids)).all()
    if len(assets) != len(payload.asset_ids):
        raise HTTPException(status_code=400, detail="One or more asset IDs are invalid")

    if user["role"] == "client":
        not_owned = [a.id for a in assets if a.user_id != user_id]
        if not_owned:
            raise HTTPException(status_code=403, detail=f"Access denied: assets not owned by you: {not_owned}")

    # Check none are already insured
    already_insured = [a for a in assets if a.policy_id is not None]
    if already_insured:
        ids = [a.id for a in already_insured]
        raise HTTPException(status_code=400, detail=f"Assets already insured: {ids}")

    # Auto-generate policy number
    policy_number = f"POL-{uuid.uuid4().hex[:8].upper()}"

    policy = Policy(
        policy_number=policy_number,
        user_id=user_id,
        valuation_type=payload.valuation_type,
        premium_amount=payload.premium_amount,
        coverage_details=payload.coverage_details,
        duration_months=payload.duration_months,
        start_date=payload.start_date,
    )
    db.add(policy)
    db.flush()  # get policy.id without committing

    # Link assets to this policy
    now = datetime.utcnow()
    for asset in assets:
        asset.policy_id = policy.id
        asset.insured_at = now
        # Record valuation at time of insuring
        record_valuation(asset, db, method="auto", notes=f"Valuation at insurance under {policy_number}")

    db.commit()
    db.refresh(policy)

    return {
        "message": "Policy created",
        "id": policy.id,
        "policy_number": policy.policy_number,
        "assets_insured": len(assets),
    }


@router.get("/")
def get_policies(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get policies based on user role."""
    if user["role"] == "client":
        policies = db.query(Policy).filter(Policy.user_id == user.get("user_id")).all()
    else:
        policies = db.query(Policy).all()

    return [
        {
            "id": p.id,
            "policy_number": p.policy_number,
            "valuation_type": p.valuation_type,
            "premium_amount": p.premium_amount,
            "suggested_premium": p.suggested_premium,
            "approved_premium": p.approved_premium,
            "status": p.status,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "duration_months": p.duration_months,
            "asset_count": len(p.assets) if p.assets else 0,
        }
        for p in policies
    ]


@router.get("/{policy_id}")
def get_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    if user["role"] == "client" and policy.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    assets_data = []
    for a in policy.assets:
        valuation = get_current_valuation(a)
        assets_data.append({
            "id": a.id,
            "asset_type": a.asset_type,
            "description": a.description,
            "purchase_price": a.purchase_price,
            "condition": a.condition,
            "make": a.make,
            "model": a.model,
            "year": a.year,
            "current_value": valuation["current_value"],
            "value_change_pct": valuation["value_change_pct"],
        })

    return {
        "id": policy.id,
        "policy_number": policy.policy_number,
        "valuation_type": policy.valuation_type,
        "premium_amount": policy.premium_amount,
        "suggested_premium": policy.suggested_premium,
        "approved_premium": policy.approved_premium,
        "coverage_details": policy.coverage_details,
        "duration_months": policy.duration_months,
        "start_date": policy.start_date.isoformat() if policy.start_date else None,
        "status": policy.status,
        "assets": assets_data,
    }
