from sqlalchemy.orm import Session
from sqlalchemy.sql import and_

def get_claims_for_user(user, db: Session):
    if user["role"] == "client":
        # Restrict access to claims belonging to the client
        return db.query(Claim).filter(and_(
            Claim.client_id == user["username"],
            Claim.is_encrypted == False  # Assuming sensitive fields are encrypted
        )).all()
    elif user["role"] == "junior_officer":
        # Restrict access to Tier 1 claims only
        return db.query(Claim).filter(and_(
            Claim.tier == "Tier 1",
            Claim.is_encrypted == False
        )).all()
    elif user["role"] == "senior_officer":
        # Restrict access to Tier 1 and Tier 2 claims
        return db.query(Claim).filter(and_(
            Claim.tier.in_(["Tier 1", "Tier 2"]),
            Claim.is_encrypted == False
        )).all()
    elif user["role"] == "superuser":
        # Superuser can access all claims, but ensure encryption is handled
        return db.query(Claim).filter(Claim.is_encrypted == False).all()
    else:
        # Return an empty list for unauthorized roles
        return []
