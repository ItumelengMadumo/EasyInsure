from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.api.v1 import claims, tier1, tier2, tier3  # Ensure these modules exist and are correctly implemented

# Database configuration
DATABASE_URL = "postgres:admin@localhost:5433/Insurance_llm"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

# Define a Database Model
class Claim(Base):
    __tablename__ = "claims"
    id = Column(Integer, primary_key=True, index=True)
    claim_number = Column(String, unique=True, index=True)
    description = Column(String)
    status = Column(String, default="pending")

Base.metadata.create_all(bind=engine)

# Pydantic Model for Validation
class ClaimRequest(BaseModel):
    claim_number: str
    description: str
    status: str

# Initialize FastAPI app
app = FastAPI()

# Include routers
app.include_router(claims.router, prefix="/api/v1")
app.include_router(tier1.router, prefix="/api/v1")
app.include_router(tier2.router, prefix="/api/v1")
app.include_router(tier3.router, prefix="/api/v1")

# Endpoint for submitting claims
@app.post("/submit-claim/")
def submit_claim(claim: ClaimRequest):
    db = SessionLocal()
    new_claim = Claim(**claim.dict())
    db.add(new_claim)
    db.commit()
    db.refresh(new_claim)
    return {"message": "Claim submitted successfully!", "claim": new_claim}

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
