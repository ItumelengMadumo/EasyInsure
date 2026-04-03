from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Asset
from app.services.risk_engine import calculate_premium
from app.services.depreciation_engine import calculate_depreciation
from app.services.valuation_service import get_current_valuation
from app.services.security import get_current_user
from app.schemas import RiskCalculationRequest, DepreciationRequest

router = APIRouter(prefix="/tools", tags=["Calculation Tools"])


@router.post("/calculate-risk")
def calculate_risk(
    payload: RiskCalculationRequest,
    user: dict = Depends(get_current_user),
):
    """Run the risk engine to get premium suggestion."""
    result = calculate_premium(
        asset_type=payload.asset_type,
        asset_value=payload.asset_value,
        driver_age=payload.driver_age,
        location=payload.location,
        previous_claims_count=payload.previous_claims_count,
        driving_experience_years=payload.driving_experience_years,
    )
    return result.to_dict()


@router.post("/calculate-depreciation")
def calculate_depreciation_endpoint(
    payload: DepreciationRequest,
    user: dict = Depends(get_current_user),
):
    """Run the depreciation engine to get asset valuation."""
    result = calculate_depreciation(
        purchase_price=payload.purchase_price,
        purchase_date=payload.purchase_date,
        asset_type=payload.asset_type,
        condition=payload.condition,
        market_value=payload.market_value,
        excess=payload.excess,
        valuation_type=payload.valuation_type,
        agreed_value=payload.agreed_value,
    )
    return result.to_dict()


@router.get("/asset-valuation/{asset_id}")
def asset_valuation(
    asset_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get live valuation for a specific registered asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    valuation = get_current_valuation(asset)

    # Also include risk assessment based on asset
    from app.models.models import Claim
    claims_count = db.query(Claim).filter(Claim.asset_id == asset_id).count()
    risk = calculate_premium(
        asset_type=asset.asset_type,
        asset_value=asset.purchase_price,
        previous_claims_count=claims_count,
    )

    return {
        "valuation": valuation,
        "risk": risk.to_dict(),
    }
