from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True)
    client_name = Column(String, nullable=False)
    policy_id = Column(String, nullable=False)
    incident_description = Column(String, nullable=False)
    claim_amount = Column(Integer, nullable=False)
    tier = Column(String, nullable=False)
    status = Column(String, default="Pending")
