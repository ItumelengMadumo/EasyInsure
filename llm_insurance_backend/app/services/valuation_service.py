"""
Valuation Service — Calculates and records asset valuations over time.

Provides current value snapshots for any asset using the depreciation engine,
and stores valuation history so clients can see value fluctuations.
"""

from datetime import datetime
from sqlalchemy.orm import Session

from app.models.models import Asset, AssetValuation
from app.services.depreciation_engine import (
    calculate_depreciation,
    DEFAULT_DEPRECIATION_RATES,
    CONDITION_ADJUSTMENTS,
)


def get_current_valuation(asset: Asset, as_of: datetime = None) -> dict:
    """Calculate the current value of a specific asset using the depreciation engine."""
    if as_of is None:
        as_of = datetime.utcnow()

    result = calculate_depreciation(
        purchase_price=asset.purchase_price,
        purchase_date=asset.purchase_date,
        asset_type=asset.asset_type,
        condition=asset.condition or "average",
        valuation_type="ACV",
        claim_date=as_of,
    )

    return {
        "asset_id": asset.id,
        "valuation_date": as_of.isoformat(),
        "purchase_price": round(asset.purchase_price, 2),
        "current_value": round(result.adjusted_value, 2),
        "depreciation_rate": result.depreciation_rate,
        "years_elapsed": round(result.years_elapsed, 2),
        "depreciated_value": round(result.depreciated_value, 2),
        "condition": asset.condition or "average",
        "condition_adjustment": result.condition_adjustment,
        "value_change": round(result.adjusted_value - asset.purchase_price, 2),
        "value_change_pct": round(
            ((result.adjusted_value - asset.purchase_price) / asset.purchase_price) * 100, 2
        ) if asset.purchase_price > 0 else 0,
    }


def record_valuation(asset: Asset, db: Session, method: str = "auto", notes: str = None, current_value: float = None, condition: str = None) -> AssetValuation:
    """Record a valuation snapshot for an asset."""
    now = datetime.utcnow()

    if method == "manual" and current_value is not None:
        # Manual valuation — use provided value
        rate = DEFAULT_DEPRECIATION_RATES.get(asset.asset_type, DEFAULT_DEPRECIATION_RATES["default"])
        years = (now - asset.purchase_date).days / 365.25
        val = AssetValuation(
            asset_id=asset.id,
            valuation_date=now,
            current_value=current_value,
            depreciation_rate_used=rate,
            years_elapsed=max(years, 0),
            condition_at_valuation=condition or asset.condition or "average",
            method="manual",
            notes=notes,
        )
    else:
        # Auto valuation — calculate via depreciation engine
        result = calculate_depreciation(
            purchase_price=asset.purchase_price,
            purchase_date=asset.purchase_date,
            asset_type=asset.asset_type,
            condition=asset.condition or "average",
            valuation_type="ACV",
            claim_date=now,
        )
        val = AssetValuation(
            asset_id=asset.id,
            valuation_date=now,
            current_value=result.adjusted_value,
            depreciation_rate_used=result.depreciation_rate,
            years_elapsed=result.years_elapsed,
            condition_at_valuation=asset.condition or "average",
            method="auto",
            notes=notes,
        )

    db.add(val)
    db.commit()
    db.refresh(val)
    return val


def get_valuation_history(asset_id: int, db: Session) -> list:
    """Get all historical valuations for an asset."""
    valuations = (
        db.query(AssetValuation)
        .filter(AssetValuation.asset_id == asset_id)
        .order_by(AssetValuation.valuation_date.desc())
        .all()
    )
    return [
        {
            "id": v.id,
            "valuation_date": v.valuation_date.isoformat() if v.valuation_date else None,
            "current_value": round(v.current_value, 2),
            "depreciation_rate_used": v.depreciation_rate_used,
            "years_elapsed": round(v.years_elapsed, 2),
            "condition": v.condition_at_valuation,
            "method": v.method,
            "notes": v.notes,
        }
        for v in valuations
    ]
