"""
Risk Engine — Deterministic actuarial logic for premium calculation.

Formula: premium = base_rate * (1 + total_risk_score)

All risk factors are configurable and explainable.
"""

from dataclasses import dataclass
from datetime import datetime
import json


# Configurable risk factor weights
RISK_FACTORS = {
    "young_driver": {"age_threshold": 25, "weight": 0.40},
    "high_risk_area": {"areas": [
        "johannesburg", "sandton", "pretoria", "durban",
        "cape town cbd", "hillbrow", "soweto"
    ], "weight": 0.30},
    "expensive_asset": {"threshold": 200000, "weight": 0.50},
    "poor_claims_history": {"claim_count_threshold": 3, "weight": 0.35},
    "good_history_discount": {"max_claims": 0, "weight": -0.20},
    "new_driver": {"experience_years_threshold": 2, "weight": 0.25},
}

BASE_PREMIUM_RATES = {
    "vehicle": 500.0,
    "property": 800.0,
    "electronics": 200.0,
    "life": 1000.0,
    "default": 500.0,
}


@dataclass
class RiskAssessment:
    base_rate: float
    total_risk_score: float
    factors: list  # List of {name, applied, weight, reason}
    suggested_premium: float
    risk_level: str  # low, medium, high, critical

    def to_dict(self):
        return {
            "base_rate": self.base_rate,
            "total_risk_score": round(self.total_risk_score, 4),
            "factors": self.factors,
            "suggested_premium": round(self.suggested_premium, 2),
            "risk_level": self.risk_level,
        }

    def to_json(self):
        return json.dumps(self.to_dict())


def calculate_premium(
    asset_type: str,
    asset_value: float,
    driver_age: int = None,
    location: str = None,
    previous_claims_count: int = 0,
    driving_experience_years: int = None,
) -> RiskAssessment:
    """Calculate premium using deterministic actuarial logic."""

    base_rate = BASE_PREMIUM_RATES.get(asset_type, BASE_PREMIUM_RATES["default"])
    factors = []
    total_risk = 0.0

    # Young driver risk
    if driver_age is not None:
        cfg = RISK_FACTORS["young_driver"]
        applied = driver_age < cfg["age_threshold"]
        weight = cfg["weight"] if applied else 0
        total_risk += weight
        factors.append({
            "name": "Young Driver",
            "applied": applied,
            "weight": weight,
            "reason": f"Driver age {driver_age} {'<' if applied else '>='} {cfg['age_threshold']}"
        })

    # High-risk area
    if location is not None:
        cfg = RISK_FACTORS["high_risk_area"]
        applied = location.lower().strip() in cfg["areas"]
        weight = cfg["weight"] if applied else 0
        total_risk += weight
        factors.append({
            "name": "High-Risk Area",
            "applied": applied,
            "weight": weight,
            "reason": f"Location '{location}' {'is' if applied else 'is not'} in high-risk list"
        })

    # Expensive asset
    cfg = RISK_FACTORS["expensive_asset"]
    applied = asset_value > cfg["threshold"]
    weight = cfg["weight"] if applied else 0
    total_risk += weight
    factors.append({
        "name": "Expensive Asset",
        "applied": applied,
        "weight": weight,
        "reason": f"Asset value R{asset_value:,.0f} {'>' if applied else '<='} R{cfg['threshold']:,.0f}"
    })

    # Claims history
    if previous_claims_count > 0:
        cfg = RISK_FACTORS["poor_claims_history"]
        applied = previous_claims_count >= cfg["claim_count_threshold"]
        weight = cfg["weight"] if applied else 0
        total_risk += weight
        factors.append({
            "name": "Poor Claims History",
            "applied": applied,
            "weight": weight,
            "reason": f"{previous_claims_count} previous claims (threshold: {cfg['claim_count_threshold']})"
        })
    else:
        # Good history discount
        cfg = RISK_FACTORS["good_history_discount"]
        weight = cfg["weight"]
        total_risk += weight
        factors.append({
            "name": "Good History Discount",
            "applied": True,
            "weight": weight,
            "reason": "No previous claims — discount applied"
        })

    # New driver
    if driving_experience_years is not None:
        cfg = RISK_FACTORS["new_driver"]
        applied = driving_experience_years < cfg["experience_years_threshold"]
        weight = cfg["weight"] if applied else 0
        total_risk += weight
        factors.append({
            "name": "New Driver",
            "applied": applied,
            "weight": weight,
            "reason": f"{driving_experience_years} years experience {'<' if applied else '>='} {cfg['experience_years_threshold']}"
        })

    suggested_premium = base_rate * (1 + total_risk)
    suggested_premium = max(suggested_premium, base_rate * 0.5)  # Floor at 50% of base

    # Determine risk level
    if total_risk < 0.2:
        risk_level = "low"
    elif total_risk < 0.6:
        risk_level = "medium"
    elif total_risk < 1.0:
        risk_level = "high"
    else:
        risk_level = "critical"

    return RiskAssessment(
        base_rate=base_rate,
        total_risk_score=total_risk,
        factors=factors,
        suggested_premium=suggested_premium,
        risk_level=risk_level,
    )
