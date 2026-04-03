"""
Depreciation Engine — Asset valuation at claim time.

Formula: value = purchase_price * ((1 - rate) ^ years)
Final:   payout = (adjusted_value) - excess

Supports ACV (Actual Cash Value) and Agreed Value policy types.
"""

from dataclasses import dataclass
from datetime import datetime
import json

# Default depreciation rates by asset type (annual)
DEFAULT_DEPRECIATION_RATES = {
    "vehicle": 0.15,
    "electronics": 0.25,
    "property": 0.02,
    "furniture": 0.10,
    "machinery": 0.12,
    "default": 0.10,
}

CONDITION_ADJUSTMENTS = {
    "excellent": 0.10,
    "average": 0.0,
    "poor": -0.20,
}

DEFAULT_EXCESS = 500.0


@dataclass
class DepreciationResult:
    purchase_price: float
    depreciation_rate: float
    years_elapsed: float
    depreciated_value: float
    market_value: float
    condition: str
    condition_adjustment: float
    adjusted_value: float
    excess: float
    suggested_payout: float
    valuation_type: str  # ACV or AGREED
    agreed_value: float  # Only used for AGREED type

    def to_dict(self):
        return {
            "purchase_price": round(self.purchase_price, 2),
            "depreciation_rate": self.depreciation_rate,
            "years_elapsed": round(self.years_elapsed, 2),
            "depreciated_value": round(self.depreciated_value, 2),
            "market_value": round(self.market_value, 2),
            "condition": self.condition,
            "condition_adjustment": self.condition_adjustment,
            "adjusted_value": round(self.adjusted_value, 2),
            "excess": round(self.excess, 2),
            "suggested_payout": round(self.suggested_payout, 2),
            "valuation_type": self.valuation_type,
        }

    def to_json(self):
        return json.dumps(self.to_dict())


def calculate_depreciation(
    purchase_price: float,
    purchase_date: datetime,
    asset_type: str = "default",
    condition: str = "average",
    market_value: float = None,
    excess: float = DEFAULT_EXCESS,
    valuation_type: str = "ACV",
    agreed_value: float = None,
    custom_rate: float = None,
    claim_date: datetime = None,
) -> DepreciationResult:
    """Calculate asset depreciation and suggested payout."""

    if claim_date is None:
        claim_date = datetime.utcnow()

    rate = custom_rate or DEFAULT_DEPRECIATION_RATES.get(
        asset_type, DEFAULT_DEPRECIATION_RATES["default"]
    )

    years = (claim_date - purchase_date).days / 365.25
    years = max(years, 0)

    # Depreciated value: value = purchase_price * ((1 - rate) ^ years)
    depreciated_value = purchase_price * ((1 - rate) ** years)

    # Market value adjustment: final_value = min(depreciated_value, market_value)
    if market_value is not None:
        adjusted_for_market = min(depreciated_value, market_value)
    else:
        adjusted_for_market = depreciated_value

    # Condition adjustment
    cond_adj = CONDITION_ADJUSTMENTS.get(condition.lower(), 0.0)
    adjusted_value = adjusted_for_market * (1 + cond_adj)

    # Policy type handling
    if valuation_type == "AGREED" and agreed_value is not None:
        suggested_payout = agreed_value - excess
    else:
        # ACV: payout = adjusted_value - excess
        suggested_payout = adjusted_value - excess

    suggested_payout = max(suggested_payout, 0)

    return DepreciationResult(
        purchase_price=purchase_price,
        depreciation_rate=rate,
        years_elapsed=years,
        depreciated_value=depreciated_value,
        market_value=market_value or depreciated_value,
        condition=condition,
        condition_adjustment=cond_adj,
        adjusted_value=adjusted_value,
        excess=excess,
        suggested_payout=suggested_payout,
        valuation_type=valuation_type,
        agreed_value=agreed_value or 0,
    )
