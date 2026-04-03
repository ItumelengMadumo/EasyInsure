import openai
from app.core.config import settings

openai.api_key = settings.OPENAI_API_KEY


def analyze_tier3_claim(claim):
    prompt = f"Analyze this tier3 insurance claim:\n{claim.description}"
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    return response["choices"][0]["message"]["content"]
