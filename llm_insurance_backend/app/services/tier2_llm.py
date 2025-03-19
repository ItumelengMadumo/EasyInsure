import openai
from app.core.config import settings

openai.api_key = settings.OPENAI_API_KEY

def analyze_tier2_claim(claim):\n    prompt = f"Analyze this tier2 insurance claim:\\n{claim.incident_description}"\n    response = openai.ChatCompletion.create(\n        model="gpt-4-turbo",\n        messages=[{"role": "user", "content": prompt}]\n    )\n    return response["choices"][0]["message"]["content"]
