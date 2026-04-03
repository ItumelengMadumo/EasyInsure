"""
Decision Pipeline — Orchestrates the full claim processing workflow.

1. LLM extracts structured data
2. System assigns tier
3. Risk engine evaluates
4. Depreciation engine calculates asset value
5. Fraud detection flags anomalies
6. Decision support generated (suggested payout/premium)
7. Human reviews and approves/rejects
"""

from datetime import datetime
from sqlalchemy.orm import Session
import json

from app.models.models import Claim, Asset, Policy, Report, AuditTrail
from app.services.risk_engine import calculate_premium
from app.services.depreciation_engine import calculate_depreciation
from app.services.fraud_detection import detect_fraud


def assign_tier(claim_amount: float, description: str) -> int:
    """Assign claim tier based on complexity and value."""
    if claim_amount is None:
        return 1
    if claim_amount > 200000:
        return 3
    elif claim_amount > 50000:
        return 2
    return 1


def process_claim(claim: Claim, db: Session) -> dict:
    """
    Full claim processing pipeline.
    Returns decision support data for human review.
    """

    # Step 1: Assign tier
    claim.tier = assign_tier(claim.amount_requested, claim.description)

    # Step 2: Get asset and policy info
    asset = db.query(Asset).filter(Asset.id == claim.asset_id).first()
    policy = db.query(Policy).filter(Policy.id == claim.policy_id).first()

    # Step 3: Run depreciation engine
    depreciation_result = None
    if asset:
        depreciation_result = calculate_depreciation(
            purchase_price=asset.purchase_price,
            purchase_date=asset.purchase_date,
            asset_type=asset.asset_type,
            condition=asset.condition or "average",
            valuation_type=policy.valuation_type if policy else "ACV",
        )
        claim.suggested_payout = depreciation_result.suggested_payout

    # Step 4: Run risk engine
    risk_result = calculate_premium(
        asset_type=asset.asset_type if asset else "default",
        asset_value=asset.purchase_price if asset else 0,
    )
    claim.risk_score = risk_result.total_risk_score

    # Step 5: Run fraud detection
    previous_claims = db.query(Claim).filter(
        Claim.user_id == claim.user_id,
        Claim.id != claim.id
    ).all()
    prev_claims_data = [
        {"created_at": c.created_at} for c in previous_claims
    ]
    fraud_result = detect_fraud(
        user_id=claim.user_id,
        claim_amount=claim.amount_requested or 0,
        policy_start_date=policy.start_date if policy else datetime.utcnow(),
        incident_date=claim.incident_date or datetime.utcnow(),
        previous_claims=prev_claims_data,
        asset_value=asset.purchase_price if asset else None,
    )
    claim.fraud_flag = fraud_result.is_flagged
    claim.fraud_reason = fraud_result.recommendation

    # Step 6: Update claim status
    claim.status = "reviewed"

    # Step 7: Generate report
    report = Report(
        claim_id=claim.id,
        summary=f"Claim #{claim.claim_number} — Tier {claim.tier} — Risk: {risk_result.risk_level}",
        recommendation=fraud_result.recommendation,
        risk_breakdown=json.dumps(risk_result.to_dict()),
        depreciation_details=json.dumps(depreciation_result.to_dict()) if depreciation_result else "{}",
    )
    db.add(report)
    db.commit()
    db.refresh(claim)

    return {
        "claim_id": claim.id,
        "claim_number": claim.claim_number,
        "tier": claim.tier,
        "status": claim.status,
        "risk": risk_result.to_dict(),
        "depreciation": depreciation_result.to_dict() if depreciation_result else None,
        "fraud": fraud_result.to_dict(),
        "suggested_payout": claim.suggested_payout,
        "requires_approval": True,
    }


def approve_claim(
    claim_id: int,
    approved_payout: float,
    approver_id: int,
    db: Session,
) -> dict:
    """Human approves a claim with optional adjustment."""

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return {"error": "Claim not found"}

    # Store audit trail
    audit = AuditTrail(
        entity_type="claim",
        entity_id=claim.id,
        action="approved",
        original_system_output=json.dumps({
            "suggested_payout": claim.suggested_payout,
            "risk_score": claim.risk_score,
        }),
        user_adjustments=json.dumps({
            "approved_payout": approved_payout,
            "was_adjusted": approved_payout != claim.suggested_payout,
        }),
        final_value=approved_payout,
        performed_by=approver_id,
    )
    db.add(audit)

    claim.approved_payout = approved_payout
    claim.approved_by = approver_id
    claim.approval_timestamp = datetime.utcnow()
    claim.status = "approved"

    db.commit()
    db.refresh(claim)

    return {
        "claim_id": claim.id,
        "status": "approved",
        "approved_payout": approved_payout,
        "approved_by": approver_id,
    }


def reject_claim(
    claim_id: int,
    rejector_id: int,
    reason: str,
    db: Session,
) -> dict:
    """Human rejects a claim."""

    claim = db.query(Claim).filter(Claim.id == claim_id).first()
    if not claim:
        return {"error": "Claim not found"}

    audit = AuditTrail(
        entity_type="claim",
        entity_id=claim.id,
        action="rejected",
        original_system_output=json.dumps({
            "suggested_payout": claim.suggested_payout,
            "risk_score": claim.risk_score,
        }),
        user_adjustments=json.dumps({"reason": reason}),
        final_value=0,
        performed_by=rejector_id,
    )
    db.add(audit)

    claim.approved_payout = 0
    claim.approved_by = rejector_id
    claim.approval_timestamp = datetime.utcnow()
    claim.status = "rejected"

    db.commit()

    return {
        "claim_id": claim.id,
        "status": "rejected",
        "reason": reason,
    }
