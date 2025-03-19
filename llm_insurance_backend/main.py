from fastapi import FastAPI
from app.api.v1 import claims, tier1, tier2, tier3

app = FastAPI()

app.include_router(claims.router, prefix="/api/v1")
app.include_router(tier1.router, prefix="/api/v1")
app.include_router(tier2.router, prefix="/api/v1")
app.include_router(tier3.router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
