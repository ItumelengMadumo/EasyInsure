from app.services.tier1_llm import analyze_tier1_claim
from app.services.tier2_llm import analyze_tier2_claim
from app.services.tier3_llm import analyze_tier3_claim

def analyze_claim_by_tier(claim):
    if claim.tier == "Tier 1":
        return analyze_tier1_claim(claim)
    elif claim.tier == "Tier 2":
        return analyze_tier2_claim(claim)
    elif claim.tier == "Tier 3":
        return analyze_tier3_claim(claim)
    else:
        return "Invalid claim tier"
