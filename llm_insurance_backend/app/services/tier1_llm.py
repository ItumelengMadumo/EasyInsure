import openai
from app.core.config import settings

openai.api_key = settings.OPENAI_API_KEY


def analyze_tier1_claim(claim):
    prompt = f"Analyze this tier1 insurance claim:\n{claim.description}"
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}]
    )
    return response["choices"][0]["message"]["content"]
