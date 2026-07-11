from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Asset, AssetValuation
from app.services.security import get_current_user
from app.services.valuation_service import get_current_valuation, record_valuation, get_valuation_history
from app.schemas import AssetCreate, AssetUpdate, ManualValuation

router = APIRouter(prefix="/assets", tags=["Assets"])


@router.post("/")
def register_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Register a new asset (uninsured). First step in the workflow."""
    asset = Asset(
        user_id=user.get("user_id", 1),
        asset_type=payload.asset_type,
        description=payload.description,
        purchase_price=payload.purchase_price,
        purchase_date=payload.purchase_date,
        condition=payload.condition,
        serial_number=payload.serial_number,
        make=payload.make,
        model=payload.model,
        year=payload.year,
        address=payload.address,
        square_footage=payload.square_footage,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    # Record initial valuation
    record_valuation(asset, db, method="auto", notes="Initial registration valuation")

    return {
        "message": "Asset registered",
        "id": asset.id,
        "asset_type": asset.asset_type,
        "purchase_price": asset.purchase_price,
        "insured": False,
    }


@router.get("/")
def get_assets(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get all assets for the current user with live valuations."""
    if user["role"] == "client":
        assets = db.query(Asset).filter(Asset.user_id == user.get("user_id")).all()
    else:
        assets = db.query(Asset).all()

    result = []
    for a in assets:
        valuation = get_current_valuation(a)
        result.append({
            "id": a.id,
            "asset_type": a.asset_type,
            "description": a.description,
            "purchase_price": a.purchase_price,
            "purchase_date": a.purchase_date.isoformat() if a.purchase_date else None,
            "condition": a.condition,
            "serial_number": a.serial_number,
            "make": a.make,
            "model": a.model,
            "year": a.year,
            "address": a.address,
            "insured": a.policy_id is not None,
            "policy_id": a.policy_id,
            "current_value": valuation["current_value"],
            "value_change": valuation["value_change"],
            "value_change_pct": valuation["value_change_pct"],
            "depreciation_rate": valuation["depreciation_rate"],
            "years_elapsed": valuation["years_elapsed"],
        })

    return result


@router.get("/{asset_id}")
def get_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get asset detail with current valuation and history."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    valuation = get_current_valuation(asset)
    history = get_valuation_history(asset_id, db)

    return {
        "id": asset.id,
        "asset_type": asset.asset_type,
        "description": asset.description,
        "purchase_price": asset.purchase_price,
        "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
        "condition": asset.condition,
        "serial_number": asset.serial_number,
        "make": asset.make,
        "model": asset.model,
        "year": asset.year,
        "address": asset.address,
        "square_footage": asset.square_footage,
        "insured": asset.policy_id is not None,
        "policy_id": asset.policy_id,
        "insured_at": asset.insured_at.isoformat() if asset.insured_at else None,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
        "valuation": valuation,
        "valuation_history": history,
        "claims_count": len(asset.claims) if asset.claims else 0,
    }


@router.patch("/{asset_id}")
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update asset details (e.g., condition change)."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    if payload.condition is not None:
        asset.condition = payload.condition
    if payload.description is not None:
        asset.description = payload.description
    if payload.serial_number is not None:
        asset.serial_number = payload.serial_number

    db.commit()
    db.refresh(asset)

    # Re-valuate after condition change
    record_valuation(asset, db, method="auto", notes="Re-valued after update")

    return {"message": "Asset updated", "id": asset.id}


@router.get("/{asset_id}/valuation")
def get_asset_valuation(
    asset_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get the current live valuation for a specific asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    return get_current_valuation(asset)


@router.post("/{asset_id}/valuations")
def add_manual_valuation(
    asset_id: int,
    payload: ManualValuation,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Record a manual valuation (e.g., from appraiser or market research)."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    val = record_valuation(
        asset, db,
        method="manual",
        current_value=payload.current_value,
        condition=payload.condition,
        notes=payload.notes,
    )

    # Update asset condition if provided
    if payload.condition:
        asset.condition = payload.condition
        db.commit()

    return {
        "message": "Valuation recorded",
        "id": val.id,
        "current_value": round(val.current_value, 2),
        "method": val.method,
    }


@router.get("/{asset_id}/history")
def get_asset_history(
    asset_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get full valuation history for an asset."""
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if user["role"] == "client" and asset.user_id != user.get("user_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    return get_valuation_history(asset_id, db)
