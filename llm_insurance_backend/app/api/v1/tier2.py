from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Claim, ProcessedClaim  # Assuming you have a ProcessedClaim model defined
from app.llm import process_with_tier1_llm  # Assuming you have an LLM processing function

router = APIRouter()

@router.get("/tier2/claims")
def get_tier1_claims(db: Session = Depends(get_db)):
    # Query the database for all claims
    claims = db.query(Claim).all()
    
    processed_claims = []
    for claim in claims:
        # Retrieve the tier information from the database
        if claim.tier == 2:
            # Process the claim with the tier1 LLM
            llm_response = process_with_tier1_llm(claim.to_dict())
            
            # Save the LLM response and generate a report
            processed_claim = ProcessedClaim(
                claim_id=claim.id,
                llm_response=llm_response,
                report=f"Report for claim {claim.id}: {llm_response['summary']}"
            )
            db.add(processed_claim)
            processed_claims.append(processed_claim)
    
    db.commit()
    return {"processed_tier1_claims": [pc.to_dict() for pc in processed_claims]}
