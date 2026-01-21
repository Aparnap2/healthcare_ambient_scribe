"""
Healthcare AI Service - SOAP Note Generation

FastAPI service that generates clinical SOAP notes from transcripts
using Ollama (qwen2.5-coder:3b).
"""
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx

app = FastAPI(title="Healthcare AI Service")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:3b")


class SoapRequest(BaseModel):
    transcript: str
    patientName: Optional[str] = None


class SoapSection(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class SoapResponse(BaseModel):
    soap: SoapSection
    icd10_codes: List[str]
    processing_time_ms: float


class GenerateSoapRequest(BaseModel):
    transcript: str


@app.post("/api/ai/generate-soap", response_model=SoapResponse)
async def generate_soap(request: GenerateSoapRequest) -> SoapResponse:
    """
    Generate a SOAP note from a clinical transcript.
    """
    import time
    start = time.time()

    system_prompt = """You are a medical scribe assistant. Convert the following
clinical transcript into a structured SOAP note. Return ONLY valid JSON.

## Output Format
{
  "subjective": "Patient's symptoms and history",
  "objective": "Vitals and physical exam findings",
  "assessment": "Diagnoses and medical reasoning",
  "plan": "Treatments, medications, and follow-up",
  "icd10_codes": ["list", "of", "codes"]
}

## Rules
- Use medical terminology appropriately
- Include relevant ICD-10 codes when diagnoses are mentioned
- Be concise but complete
- Use professional medical documentation style
- Do not include patient names (use "Patient")
"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": f"{system_prompt}\n\nTranscript:\n{request.transcript}",
                "format": "json",
                "stream": False,
            },
            timeout=120.0,
        )

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Ollama error: {response.text}")

        result = response.json()
        content = result.get("response", "")

        # Parse JSON from response
        import json
        try:
            soap_data = json.loads(content)
        except json.JSONDecodeError:
            # Extract JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                soap_data = json.loads(json_match.group())
            else:
                raise HTTPException(status_code=500, detail="Failed to parse SOAP response")

    elapsed = (time.time() - start) * 1000

    return SoapResponse(
        soap=SoapSection(
            subjective=soap_data.get("subjective", ""),
            objective=soap_data.get("objective", ""),
            assessment=soap_data.get("assessment", ""),
            plan=soap_data.get("plan", ""),
        ),
        icd10_codes=soap_data.get("icd10_codes", []),
        processing_time_ms=elapsed,
    )


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
