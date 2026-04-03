"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ── Auth ──
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "client"


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Asset (standalone, before insurance) ──
class AssetCreate(BaseModel):
    asset_type: str  # vehicle, property, electronics, furniture, machinery
    description: Optional[str] = None
    purchase_price: float
    purchase_date: datetime
    condition: str = "average"
    serial_number: Optional[str] = None
    # Vehicle-specific
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    # Property-specific
    address: Optional[str] = None
    square_footage: Optional[float] = None


class AssetUpdate(BaseModel):
    condition: Optional[str] = None
    description: Optional[str] = None
    serial_number: Optional[str] = None


class ManualValuation(BaseModel):
    current_value: float
    condition: str = "average"
    notes: Optional[str] = None


# ── Policy ──
class PolicyCreate(BaseModel):
    valuation_type: str = "ACV"
    premium_amount: float
    coverage_details: Optional[str] = None
    duration_months: int
    start_date: datetime
    asset_ids: List[int]  # which assets to insure under this policy


# ── Claim ──
class ClaimCreate(BaseModel):
    asset_id: int  # required — policy auto-resolved from insured asset
    claim_type: str
    description: str
    incident_date: Optional[datetime] = None
    incident_location: Optional[str] = None
    amount_requested: Optional[float] = None


class ClaimApproval(BaseModel):
    approved_payout: float


class ClaimRejection(BaseModel):
    reason: str


# ── Risk Engine ──
class RiskCalculationRequest(BaseModel):
    asset_type: str = "vehicle"
    asset_value: float
    driver_age: Optional[int] = None
    location: Optional[str] = None
    previous_claims_count: int = 0
    driving_experience_years: Optional[int] = None


# ── Depreciation ──
class DepreciationRequest(BaseModel):
    purchase_price: float
    purchase_date: datetime
    asset_type: str = "vehicle"
    condition: str = "average"
    market_value: Optional[float] = None
    excess: float = 500.0
    valuation_type: str = "ACV"
    agreed_value: Optional[float] = None
