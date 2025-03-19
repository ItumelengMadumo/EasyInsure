from fastapi import APIRouter

router = APIRouter()

@router.get("/claims")
def get_claims():
    return {"message": "Retrieve all claims"}
