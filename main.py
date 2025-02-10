from fastapi import FastAPI, UploadFile, File
import openai
from pydantic import BaseModel
import os

app = FastAPI()

# OpenAI API Key (Use environment variables in production)
OPENAI_API_KEY = "your_openai_api_key"
openai.api_key = OPENAI_API_KEY

class ClaimRequest(BaseModel):
    policy_number: str
    claimant_name: str
    claim_description: str

@app.post("/assess-claim/")
def assess_claim(claim: ClaimRequest):
    """Processes an insurance claim using an LLM to generate a report."""
    prompt = f"""
    Analyze the following insurance claim and generate a structured report:
    Policy Number: {claim.policy_number}
    Claimant: {claim.claimant_name}
    Description: {claim.claim_description}
    """
    
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    
    report = response["choices"][0]["message"]["content"].strip()
    return {"claim_report": report}

@app.post("/upload-document/")
def upload_document(file: UploadFile = File(...)):
    """Endpoint for document upload and future OCR processing."""
    return {"filename": file.filename, "message": "File received, processing pending."}

@app.get("/claim-information")
def get_claim_information(policy_number: str):
    """Retrieves claim information based on policy number."""
    # TO DO: Implement database query or API call to retrieve claim information
    return {"claim_status": "pending", "claim_amount": 1000.0}
             
