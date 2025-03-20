from sqlalchemy import Column, Integer, String, Float, ForeignKey, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

Base = declarative_base()

# Define the InsurancePolicy model
class InsurancePolicy(Base):
    __tablename__ = 'insurance_policies'
    id = Column(Integer, primary_key=True)
    policy_number = Column(String, unique=True, nullable=False)
    policy_holder = Column(String, nullable=False)
    premium_amount = Column(Float, nullable=False)
    coverage_details = Column(String, nullable=False)
    duration_months = Column(Integer, nullable=False)  # Duration of the policy in months
    start_date = Column(String, nullable=False)  # Start date of the policy
    premature_payout = Column(Float, nullable=True)  # Payout amount if policy is terminated prematurely
    full_payout = Column(Float, nullable=False)  # Full payout amount at the end of the policy

# Define the Asset model
class Asset(Base):
    __tablename__ = 'assets'
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    value = Column(Float, nullable=False)
    type = Column(String, nullable=False)  # Type of asset (e.g., 'Car', 'Building', etc.)
    policy_id = Column(Integer, ForeignKey('insurance_policies.id'))
    policy = relationship("InsurancePolicy", back_populates="assets")

    # Additional fields for specific asset types
    make = Column(String, nullable=True)  # For cars or similar assets
    model = Column(String, nullable=True)  # For cars or similar assets
    year = Column(Integer, nullable=True)  # For cars or similar assets
    address = Column(String, nullable=True)  # For buildings or similar assets
    square_footage = Column(Float, nullable=True)  # For buildings or similar assets

InsurancePolicy.assets = relationship("Asset", order_by=Asset.id, back_populates="policy")

# Database setup
DATABASE_URL = "sqlite:///insurance.db"  # Replace with your database URL
engine = create_engine(DATABASE_URL)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
session = Session()

# Functions for saving, posting, and retrieving data
def save_insurance_policy(policy_data):
    policy = InsurancePolicy(**policy_data)
    session.add(policy)
    session.commit()
    return policy

def save_asset(asset_data):
    asset = Asset(**asset_data)
    session.add(asset)
    session.commit()
    return asset

def get_insurance_policies():
    return session.query(InsurancePolicy).all()

def get_assets():
    return session.query(Asset).all()

def post_insurance_policy(policy_data):
    return save_insurance_policy(policy_data)

def post_asset(asset_data):
    return save_asset(asset_data)

# Example usage
if __name__ == "__main__":
    # Example of saving a policy
    policy_data = {
        "policy_number": "POL12345",
        "policy_holder": "John Doe",
        "premium_amount": 500.0,
        "coverage_details": "Full coverage for vehicle"
    }
    policy = post_insurance_policy(policy_data)
    print(f"Saved policy: {policy}")

    # Example of saving an asset
    asset_data = {
        "name": "Car",
        "value": 20000.0,
        "policy_id": policy.id
    }
    asset = post_asset(asset_data)
    print(f"Saved asset: {asset}")

    # Retrieve all policies and assets
    policies = get_insurance_policies()
    print(f"All policies: {policies}")

    assets = get_assets()
    print(f"All assets: {assets}")