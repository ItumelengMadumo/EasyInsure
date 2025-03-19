from fastapi import APIRouter

router = APIRouter()

@router.get("/tier1/claims")\ndef get_tier1_claims():\n    return {"message": "Retrieve tier1 claims"}
