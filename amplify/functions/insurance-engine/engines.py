"""Pure deterministic insurance engines. No AWS, HTTP, auth, or database dependencies."""

from datetime import datetime, timezone
from typing import Any

RISK_FACTORS = {
    "young_driver": {"age_threshold": 25, "weight": 0.40},
    "high_risk_area": {
        "areas": ["johannesburg", "sandton", "pretoria", "durban", "cape town cbd", "hillbrow", "soweto"],
        "weight": 0.30,
    },
    "expensive_asset": {"threshold": 200000, "weight": 0.50},
    "poor_claims_history": {"claim_count_threshold": 3, "weight": 0.35},
    "good_history_discount": {"weight": -0.20},
    "new_driver": {"experience_years_threshold": 2, "weight": 0.25},
}
BASE_RATES = {"vehicle": 500.0, "property": 800.0, "electronics": 200.0, "life": 1000.0, "default": 500.0}
DEPRECIATION_RATES = {"vehicle": 0.15, "electronics": 0.25, "property": 0.02, "furniture": 0.10, "machinery": 0.12, "default": 0.10}
CONDITION_ADJUSTMENTS = {"excellent": 0.10, "average": 0.0, "poor": -0.20}


def _finite_non_negative(name: str, value: Any) -> float:
    number = float(value)
    if number < 0 or number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be a finite non-negative number")
    return number


def _date(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def assign_tier(amount: float | None) -> int:
    amount = _finite_non_negative("amount", amount or 0)
    return 3 if amount > 200000 else 2 if amount > 50000 else 1


def calculate_risk(data: dict[str, Any]) -> dict[str, Any]:
    asset_type = str(data.get("assetType", "default")).lower()
    asset_value = _finite_non_negative("assetValue", data.get("assetValue", 0))
    previous_claims = int(data.get("previousClaimsCount", 0))
    if previous_claims < 0:
        raise ValueError("previousClaimsCount must be non-negative")
    factors: list[dict[str, Any]] = []
    score = 0.0

    def add(name: str, applied: bool, weight: float, reason: str) -> None:
        nonlocal score
        applied_weight = weight if applied else 0.0
        score += applied_weight
        factors.append({"name": name, "applied": applied, "weight": applied_weight, "reason": reason})

    if data.get("driverAge") is not None:
        age = int(data["driverAge"])
        add("Young Driver", age < 25, 0.40, f"Driver age {age}; threshold 25")
    if data.get("location"):
        location = str(data["location"]).strip().lower()
        add("High-Risk Area", location in RISK_FACTORS["high_risk_area"]["areas"], 0.30, f"Location assessed: {location}")
    add("Expensive Asset", asset_value > 200000, 0.50, f"Asset value R{asset_value:,.2f}; threshold R200,000")
    if previous_claims == 0:
        add("Good History Discount", True, -0.20, "No previous claims")
    else:
        add("Poor Claims History", previous_claims >= 3, 0.35, f"{previous_claims} previous claims; threshold 3")
    if data.get("drivingExperienceYears") is not None:
        years = int(data["drivingExperienceYears"])
        add("New Driver", years < 2, 0.25, f"{years} years experience; threshold 2")

    base_rate = BASE_RATES.get(asset_type, BASE_RATES["default"])
    premium = max(base_rate * (1 + score), base_rate * 0.5)
    risk_level = "low" if score < 0.2 else "medium" if score < 0.6 else "high" if score < 1 else "critical"
    return {"baseRate": base_rate, "totalRiskScore": round(score, 4), "factors": factors, "suggestedPremium": round(premium, 2), "riskLevel": risk_level}


def calculate_depreciation(data: dict[str, Any]) -> dict[str, Any]:
    purchase_price = _finite_non_negative("purchasePrice", data["purchasePrice"])
    purchase_date = _date(data["purchaseDate"])
    claim_date = _date(data.get("claimDate") or datetime.now(timezone.utc))
    years = max((claim_date - purchase_date).total_seconds() / 31557600, 0)
    asset_type = str(data.get("assetType", "default")).lower()
    rate = _finite_non_negative("customRate", data["customRate"]) if data.get("customRate") is not None else DEPRECIATION_RATES.get(asset_type, 0.10)
    if rate > 1:
        raise ValueError("customRate cannot exceed 1")
    depreciated = purchase_price * ((1 - rate) ** years)
    market = _finite_non_negative("marketValue", data["marketValue"]) if data.get("marketValue") is not None else depreciated
    condition = str(data.get("condition", "average")).lower()
    condition_adjustment = CONDITION_ADJUSTMENTS.get(condition, 0.0)
    adjusted = min(depreciated, market) * (1 + condition_adjustment)
    excess = _finite_non_negative("excess", data.get("excess", 500))
    valuation_type = str(data.get("valuationType", "ACV")).upper()
    agreed_value = _finite_non_negative("agreedValue", data["agreedValue"]) if data.get("agreedValue") is not None else 0
    payout_base = agreed_value if valuation_type == "AGREED" and data.get("agreedValue") is not None else adjusted
    return {
        "purchasePrice": round(purchase_price, 2), "depreciationRate": rate, "yearsElapsed": round(years, 4),
        "depreciatedValue": round(depreciated, 2), "marketValue": round(market, 2), "condition": condition,
        "conditionAdjustment": condition_adjustment, "adjustedValue": round(adjusted, 2), "excess": round(excess, 2),
        "suggestedPayout": round(max(payout_base - excess, 0), 2), "valuationType": valuation_type,
    }


def detect_fraud(data: dict[str, Any]) -> dict[str, Any]:
    amount = _finite_non_negative("claimAmount", data.get("claimAmount", 0))
    asset_value = _finite_non_negative("assetValue", data["assetValue"]) if data.get("assetValue") is not None else None
    previous_dates = [_date(item) for item in data.get("previousClaimDates", [])]
    now = _date(data.get("evaluationDate") or datetime.now(timezone.utc))
    recent_count = sum(1 for item in previous_dates if 0 <= (now - item).days < 365)
    signals = []

    def signal(name: str, triggered: bool, severity: str, details: str) -> None:
        signals.append({"signalName": name, "triggered": triggered, "severity": severity if triggered else "low", "details": details})

    signal("Repeated Claims", recent_count >= 3, "high", f"{recent_count} claims in the last 12 months")
    if asset_value and asset_value > 0:
        ratio = amount / asset_value
        signal("High-Value Spike", ratio > 0.8, "high", f"Claim is {ratio:.0%} of asset value")
    if data.get("policyStartDate") and data.get("incidentDate"):
        elapsed = (_date(data["incidentDate"]) - _date(data["policyStartDate"])).days
        signal("Early Claim", elapsed < 30, "medium", f"Incident occurred {elapsed} days after policy start")
    signal("Excessive Amount", amount > 500000, "high", f"Claim amount R{amount:,.2f}; threshold R500,000")
    triggered = [item for item in signals if item["triggered"]]
    high_count = sum(1 for item in triggered if item["severity"] == "high")
    medium_count = sum(1 for item in triggered if item["severity"] == "medium")
    risk = "high" if high_count >= 2 else "medium" if high_count >= 1 or medium_count >= 2 else "low"
    recommendation = "Flag for senior officer review" if risk == "high" else "Require additional verification" if risk == "medium" else "No significant rule-based indicators"
    return {"isFlagged": risk in ("medium", "high"), "overallRisk": risk, "signals": signals, "recommendation": recommendation}
