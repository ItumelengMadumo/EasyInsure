from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.session import Base, engine
from app.api.v1 import auth, assets, claims, policies, tools, tier1, tier2, tier3

# Import all models so they are registered with Base.metadata
from app.models.models import (  # noqa: F401
    User, Asset, AssetValuation, Policy, Claim,
    DepreciationRate, Report, AuditTrail,
)

# Create all tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EasyInsure — LLM-Powered Insurance Platform",
    description="AI-assisted claims processing, underwriting, fraud detection & decision support.",
    version="2.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(assets.router, prefix="/api/v1")
app.include_router(claims.router, prefix="/api/v1")
app.include_router(policies.router, prefix="/api/v1")
app.include_router(tools.router, prefix="/api/v1")
app.include_router(tier1.router, prefix="/api/v1")
app.include_router(tier2.router, prefix="/api/v1")
app.include_router(tier3.router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": "EasyInsure API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
