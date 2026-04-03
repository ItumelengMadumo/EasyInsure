from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid

from app.database import get_db
from app.models.models import Claim, Policy, Asset, Report, AuditTrail
from app.services.security import get_current_user, require_role
from app.services.decision_pipeline import process_claim, approve_claim, reject_claim
from app.services.valuation_service import get_current_valuation
from app.schemas import ClaimCreate, ClaimApproval, ClaimRejection

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.post("/")
def submit_claim(
    payload: ClaimCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Submit a new claim on an insured asset. Policy is auto-resolved."""
    # Validate asset exists
    asset = db.query(Asset).filter(Asset.id == payload.asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Asset must be insured
    if asset.policy_id is None:
        raise HTTPException(status_code=400, detail="Asset is not insured. Create a policy first.")

    # Validate the policy is active
    policy = db.query(Policy).filter(Policy.id == asset.policy_id).first()
    if not policy or policy.status != "active":
        raise HTTPException(status_code=400, detail="Policy is not active")

    # Get current asset valuation for context
    valuation = get_current_valuation(asset)

    claim = Claim(
        claim_number=f"CLM-{uuid.uuid4().hex[:8].upper()}",
        policy_id=asset.policy_id,  # auto-resolved from asset
        user_id=user.get("user_id", 1),
        asset_id=payload.asset_id,
        claim_type=payload.claim_type,
        description=payload.description,
        incident_date=payload.incident_date,
        incident_location=payload.incident_location,
        amount_requested=payload.amount_requested,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)

    return {
        "message": "Claim submitted",
        "claim_number": claim.claim_number,
        "id": claim.id,
        "policy_number": policy.policy_number,
        "asset_current_value": valuation["current_value"],
    }


@router.post("/{claim_id}/process")
def process_claim_endpoint(
    claim_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("junior_officer", "intermediate_officer", "senior_officer", "superuser")),
):
    """Run the full processing pipeline on a claim."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    result = process_claim(claim, db)
    return result


@router.post("/{claim_id}/approve")
def approve_claim_endpoint(
    claim_id: int,
    payload: ClaimApproval,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("senior_officer", "superuser")),
):
    """Approve a claim with final payout amount."""
    result = approve_claim(claim_id, payload.approved_payout, user.get("user_id", 1), db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.post("/{claim_id}/reject")
def reject_claim_endpoint(
    claim_id: int,
    payload: ClaimRejection,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("senior_officer", "superuser")),
):
    """Reject a claim with reason."""
    result = reject_claim(claim_id, user.get("user_id", 1), payload.reason, db)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/")
def get_claims(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get claims based on user role."""
    role = user["role"]
    user_id = user.get("user_id")

    if role == "client":
        claims = db.query(Claim).filter(Claim.user_id == user_id).all()
    elif role == "junior_officer":
        claims = db.query(Claim).filter(Claim.tier == 1).all()
    elif role == "intermediate_officer":
        claims = db.query(Claim).filter(Claim.tier.in_([1, 2])).all()
    else:
        claims = db.query(Claim).all()

    result = []
    for c in claims:
        # Get asset info for context
        asset = db.query(Asset).filter(Asset.id == c.asset_id).first()
        asset_desc = ""
        if asset:
            asset_desc = f"{asset.asset_type}"
            if asset.make and asset.model:
                asset_desc = f"{asset.make} {asset.model}"
            elif asset.description:
                asset_desc = asset.description[:50]

        result.append({
            "id": c.id,
            "claim_number": c.claim_number,
            "claim_type": c.claim_type,
            "description": c.description,
            "amount_requested": c.amount_requested,
            "tier": c.tier,
            "status": c.status,
            "risk_score": c.risk_score,
            "fraud_flag": c.fraud_flag,
            "suggested_payout": c.suggested_payout,
            "approved_payout": c.approved_payout,
            "asset_id": c.asset_id,
            "asset_description": asset_desc,
            "policy_id": c.policy_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return result


@router.get("/{claim_id}")
def get_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get a specific claim with full details including asset valuation."""
    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if user["role"] == "client" and claim.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    reports = db.query(Report).filter(Report.claim_id == claim_id).all()
    audit = db.query(AuditTrail).filter(
        AuditTrail.entity_type == "claim",
        AuditTrail.entity_id == claim_id,
    ).all()

    # Get asset info with current valuation
    asset_info = None
    asset = db.query(Asset).filter(Asset.id == claim.asset_id).first()
    if asset:
        valuation = get_current_valuation(asset)
        asset_info = {
            "id": asset.id,
            "asset_type": asset.asset_type,
            "description": asset.description,
            "make": asset.make,
            "model": asset.model,
            "year": asset.year,
            "purchase_price": asset.purchase_price,
            "condition": asset.condition,
            "current_value": valuation["current_value"],
            "value_change_pct": valuation["value_change_pct"],
            "depreciation_rate": valuation["depreciation_rate"],
        }

    # Get policy number
    policy = db.query(Policy).filter(Policy.id == claim.policy_id).first()

    return {
        "id": claim.id,
        "claim_number": claim.claim_number,
        "policy_id": claim.policy_id,
        "policy_number": policy.policy_number if policy else None,
        "claim_type": claim.claim_type,
        "description": claim.description,
        "incident_date": claim.incident_date.isoformat() if claim.incident_date else None,
        "incident_location": claim.incident_location,
        "amount_requested": claim.amount_requested,
        "tier": claim.tier,
        "status": claim.status,
        "risk_score": claim.risk_score,
        "fraud_flag": claim.fraud_flag,
        "fraud_reason": claim.fraud_reason,
        "suggested_payout": claim.suggested_payout,
        "approved_payout": claim.approved_payout,
        "approved_by": claim.approved_by,
        "asset": asset_info,
        "reports": [
            {
                "id": r.id,
                "summary": r.summary,
                "recommendation": r.recommendation,
                "risk_breakdown": r.risk_breakdown,
                "depreciation_details": r.depreciation_details,
            }
            for r in reports
        ],
        "audit_trail": [
            {
                "action": a.action,
                "original_system_output": a.original_system_output,
                "user_adjustments": a.user_adjustments,
                "final_value": a.final_value,
                "performed_by": a.performed_by,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            }
            for a in audit
        ],
    }
