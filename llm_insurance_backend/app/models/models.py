from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, func
from sqlalchemy.orm import relationship
from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="client")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Asset(Base):
    """Standalone asset owned by a user. Can exist before being insured."""
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_type = Column(String, nullable=False)  # vehicle, property, electronics, furniture, machinery
    description = Column(Text)
    purchase_price = Column(Float, nullable=False)
    purchase_date = Column(DateTime(timezone=True), nullable=False)
    condition = Column(String, default="average")  # excellent, average, poor
    serial_number = Column(String)
    # Vehicle-specific
    make = Column(String)
    model = Column(String)
    year = Column(Integer)
    # Property-specific
    address = Column(String)
    square_footage = Column(Float)
    # Insurance linkage (null = uninsured)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=True)
    insured_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", foreign_keys=[user_id])
    policy = relationship("Policy", back_populates="assets")
    valuations = relationship("AssetValuation", back_populates="asset", order_by="AssetValuation.valuation_date.desc()")
    claims = relationship("Claim", back_populates="asset")


class AssetValuation(Base):
    """Point-in-time valuation snapshot for an asset."""
    __tablename__ = "asset_valuations"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    valuation_date = Column(DateTime(timezone=True), nullable=False)
    current_value = Column(Float, nullable=False)
    depreciation_rate_used = Column(Float, nullable=False)
    years_elapsed = Column(Float, nullable=False)
    condition_at_valuation = Column(String, default="average")
    method = Column(String, default="auto")  # auto, manual, market
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    asset = relationship("Asset", back_populates="valuations")


class Policy(Base):
    __tablename__ = "policies"

    id = Column(Integer, primary_key=True, index=True)
    policy_number = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    valuation_type = Column(String, nullable=False, default="ACV")  # ACV or AGREED
    premium_amount = Column(Float, nullable=False)
    coverage_details = Column(Text)
    duration_months = Column(Integer, nullable=False)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True))
    suggested_premium = Column(Float)
    approved_premium = Column(Float)
    approved_by = Column(Integer, ForeignKey("users.id"))
    approval_timestamp = Column(DateTime(timezone=True))
    status = Column(String, default="active")  # active, expired, cancelled
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])
    assets = relationship("Asset", back_populates="policy")
    claims = relationship("Claim", back_populates="policy")


class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    claim_number = Column(String, unique=True, nullable=False, index=True)
    policy_id = Column(Integer, ForeignKey("policies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    claim_type = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    incident_date = Column(DateTime(timezone=True))
    incident_location = Column(String)
    amount_requested = Column(Float)
    tier = Column(Integer, default=1)  # 1, 2, 3
    status = Column(String, default="submitted")
    # submitted, processing, reviewed, approved, rejected, paid
    risk_score = Column(Float)
    fraud_flag = Column(Boolean, default=False)
    fraud_reason = Column(Text)
    # Human-in-the-loop fields
    suggested_payout = Column(Float)
    approved_payout = Column(Float)
    approved_by = Column(Integer, ForeignKey("users.id"))
    approval_timestamp = Column(DateTime(timezone=True))
    assigned_officer_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    policy = relationship("Policy", back_populates="claims")
    user = relationship("User", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])
    assigned_officer = relationship("User", foreign_keys=[assigned_officer_id])
    asset = relationship("Asset", back_populates="claims")
    reports = relationship("Report", back_populates="claim")


class DepreciationRate(Base):
    __tablename__ = "depreciation_rates"

    id = Column(Integer, primary_key=True, index=True)
    asset_type = Column(String, unique=True, nullable=False)
    annual_rate = Column(Float, nullable=False)  # e.g., 0.15 for 15%


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    claim_id = Column(Integer, ForeignKey("claims.id"), nullable=False)
    summary = Column(Text)
    recommendation = Column(Text)
    risk_breakdown = Column(Text)  # JSON string of risk factors
    depreciation_details = Column(Text)  # JSON string
    llm_output = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    claim = relationship("Claim", back_populates="reports")


class AuditTrail(Base):
    __tablename__ = "audit_trail"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String, nullable=False)  # claim, policy
    entity_id = Column(Integer, nullable=False)
    action = Column(String, nullable=False)  # approved, rejected, modified
    original_system_output = Column(Text)  # JSON
    user_adjustments = Column(Text)  # JSON
    final_value = Column(Float)
    performed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    performer = relationship("User")
