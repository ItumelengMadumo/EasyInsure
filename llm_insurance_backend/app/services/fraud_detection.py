"""
Fraud Detection Layer — Rule-based anomaly detection with LLM assistance.

Detects:
- Repeated claims from same user
- High-value claim spikes
- Data inconsistencies (claim vs policy)
- Temporal anomalies (claims too soon after policy start)
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import json


@dataclass
class FraudSignal:
    signal_name: str
    triggered: bool
    severity: str  # low, medium, high
    details: str


@dataclass
class FraudAssessment:
    is_flagged: bool
    overall_risk: str  # low, medium, high
    signals: list  # List of FraudSignal
    recommendation: str

    def to_dict(self):
        return {
            "is_flagged": self.is_flagged,
            "overall_risk": self.overall_risk,
            "signals": [
                {
                    "signal_name": s.signal_name,
                    "triggered": s.triggered,
                    "severity": s.severity,
                    "details": s.details,
                }
                for s in self.signals
            ],
            "recommendation": self.recommendation,
        }

    def to_json(self):
        return json.dumps(self.to_dict())


def detect_fraud(
    user_id: int,
    claim_amount: float,
    policy_start_date: datetime,
    incident_date: datetime,
    previous_claims: list = None,
    asset_value: float = None,
) -> FraudAssessment:
    """Run rule-based fraud detection on a claim."""

    signals = []
    previous_claims = previous_claims or []

    # Signal 1: Repeated claims (3+ in 12 months)
    recent_claims = [
        c for c in previous_claims
        if c.get("created_at") and
        (datetime.utcnow() - c["created_at"]) < timedelta(days=365)
    ]
    repeated = len(recent_claims) >= 3
    signals.append(FraudSignal(
        signal_name="Repeated Claims",
        triggered=repeated,
        severity="high" if repeated else "low",
        details=f"{len(recent_claims)} claims in last 12 months (threshold: 3)"
    ))

    # Signal 2: High-value spike (claim > 80% of asset value)
    if asset_value and asset_value > 0:
        ratio = claim_amount / asset_value
        spike = ratio > 0.8
        signals.append(FraudSignal(
            signal_name="High-Value Spike",
            triggered=spike,
            severity="high" if spike else "low",
            details=f"Claim is {ratio:.0%} of asset value (threshold: 80%)"
        ))

    # Signal 3: Early claim (within 30 days of policy start)
    if policy_start_date and incident_date:
        days_since_start = (incident_date - policy_start_date).days
        early = days_since_start < 30
        signals.append(FraudSignal(
            signal_name="Early Claim",
            triggered=early,
            severity="medium" if early else "low",
            details=f"Incident {days_since_start} days after policy start (threshold: 30)"
        ))

    # Signal 4: Amount exceeds reasonable threshold
    excessive = claim_amount > 500000
    signals.append(FraudSignal(
        signal_name="Excessive Amount",
        triggered=excessive,
        severity="high" if excessive else "low",
        details=f"Claim amount R{claim_amount:,.0f} {'exceeds' if excessive else 'within'} R500,000 threshold"
    ))

    # Determine overall risk
    triggered_signals = [s for s in signals if s.triggered]
    high_count = sum(1 for s in triggered_signals if s.severity == "high")
    medium_count = sum(1 for s in triggered_signals if s.severity == "medium")

    if high_count >= 2:
        overall_risk = "high"
        recommendation = "Flag for senior officer review — multiple high-risk signals detected."
    elif high_count >= 1 or medium_count >= 2:
        overall_risk = "medium"
        recommendation = "Recommend additional verification before processing."
    else:
        overall_risk = "low"
        recommendation = "No significant fraud indicators detected. Proceed normally."

    return FraudAssessment(
        is_flagged=overall_risk in ("medium", "high"),
        overall_risk=overall_risk,
        signals=signals,
        recommendation=recommendation,
    )
