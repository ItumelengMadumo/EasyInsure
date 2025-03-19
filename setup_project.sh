#!/bin/bash

# Set up project directory
PROJECT_NAME="llm_insurance_backend"
mkdir -p $PROJECT_NAME

# Define folder structure
declare -a DIRECTORIES=(
    "$PROJECT_NAME/app/api/v1"
    "$PROJECT_NAME/app/core"
    "$PROJECT_NAME/app/models"
    "$PROJECT_NAME/app/services"
    "$PROJECT_NAME/app/database"
)

# Define files with initial content
declare -A FILES

# Main FastAPI app entry point
FILES["$PROJECT_NAME/main.py"]=$'from fastapi import FastAPI\nfrom app.api.v1 import claims, tier1, tier2, tier3\n\napp = FastAPI()\n\napp.include_router(claims.router, prefix="/api/v1")\napp.include_router(tier1.router, prefix="/api/v1")\napp.include_router(tier2.router, prefix="/api/v1")\napp.include_router(tier3.router, prefix="/api/v1")\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run(app, host="0.0.0.0", port=8000)'

# Configuration file for API keys and database settings
FILES["$PROJECT_NAME/app/core/config.py"]=$'import os\nfrom dotenv import load_dotenv\n\nload_dotenv()\n\nclass Settings:\n    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")\n    DATABASE_URL = os.getenv("DATABASE_URL")\n\nsettings = Settings()'

# Claims API
FILES["$PROJECT_NAME/app/api/v1/claims.py"]=$'from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get("/claims")\ndef get_claims():\n    return {"message": "Retrieve all claims"}'

# Tier-based API endpoints
for TIER in "tier1" "tier2" "tier3"; do
    FILES["$PROJECT_NAME/app/api/v1/$TIER.py"]=$'from fastapi import APIRouter\n\nrouter = APIRouter()\n\n@router.get("/'$TIER'/claims")\ndef get_'$TIER'_claims():\n    return {"message": "Retrieve '$TIER' claims"}'
done

# Database model for claims
FILES["$PROJECT_NAME/app/models/claim.py"]=$'from sqlalchemy import Column, String, Integer, ForeignKey\nfrom sqlalchemy.orm import relationship\nfrom app.database import Base\n\nclass Claim(Base):\n    __tablename__ = "claims"\n\n    id = Column(Integer, primary_key=True, index=True)\n    client_name = Column(String, nullable=False)\n    policy_id = Column(String, nullable=False)\n    incident_description = Column(String, nullable=False)\n    claim_amount = Column(Integer, nullable=False)\n    tier = Column(String, nullable=False)\n    status = Column(String, default="Pending")'

# LLM Service - Routes claims to correct LLM based on tier
FILES["$PROJECT_NAME/app/services/llm_service.py"]=$'from app.services.tier1_llm import analyze_tier1_claim\nfrom app.services.tier2_llm import analyze_tier2_claim\nfrom app.services.tier3_llm import analyze_tier3_claim\n\ndef analyze_claim_by_tier(claim):\n    if claim.tier == "Tier 1":\n        return analyze_tier1_claim(claim)\n    elif claim.tier == "Tier 2":\n        return analyze_tier2_claim(claim)\n    elif claim.tier == "Tier 3":\n        return analyze_tier3_claim(claim)\n    else:\n        return "Invalid claim tier"'

# LLM handlers for different tiers
for TIER in "tier1" "tier2" "tier3"; do
    MODEL="gpt-3.5-turbo"
    if [[ "$TIER" == "tier2" ]]; then MODEL="gpt-4-turbo"; fi
    if [[ "$TIER" == "tier3" ]]; then MODEL="gpt-4"; fi

    FILES["$PROJECT_NAME/app/services/${TIER}_llm.py"]=$'import openai\nfrom app.core.config import settings\n\nopenai.api_key = settings.OPENAI_API_KEY\n\ndef analyze_'$TIER'_claim(claim):\n    prompt = f"Analyze this '$TIER' insurance claim:\\n{claim.incident_description}"\n    response = openai.ChatCompletion.create(\n        model="'$MODEL'",\n        messages=[{"role": "user", "content": prompt}]\n    )\n    return response["choices"][0]["message"]["content"]'
done

# Create all directories
for dir in "${DIRECTORIES[@]}"; do
    mkdir -p $dir
done

# Create all files and write initial content
for file in "${!FILES[@]}"; do
    echo "${FILES[$file]}" > $file
done

# Create requirements.txt
echo -e "fastapi\nuvicorn\nopenai\nsqlalchemy\npsycopg2\npython-dotenv\nredis\ncelery" > $PROJECT_NAME/requirements.txt

echo "Project structure and files successfully created!"
