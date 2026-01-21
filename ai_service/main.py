"""
Healthcare AI Service - SOAP Note Generation

FastAPI service that generates clinical SOAP notes from transcripts
using Ollama (qwen2.5-coder:3b).
"""
import os
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx

app = FastAPI(title="Healthcare AI Service")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:3b")


# PII Patterns for redaction
PII_PATTERNS = {
    "NAME": r'\b[A-Z][a-z]+\s+[A-Z][a-z]+\b',
    "PHONE": r'\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
    "EMAIL": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "SSN": r'\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b',
    "DATE": r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b',
    "MRN": r'\b(MRN|mrn)[-:#]?\s*\d+\b',
    "ADDRESS": r'\d{1,5}\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Circle|Cir)\b',
}


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


class RedactRequest(BaseModel):
    text: str


class RedactResponse(BaseModel):
    redacted_text: str
    entities_found: dict


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


@app.post("/api/ai/redact", response_model=RedactResponse)
async def redact_pii(request: RedactRequest) -> RedactResponse:
    """
    Redact PII from text using regex patterns.
    This is a lightweight implementation for demo purposes.
    For production, consider using Microsoft Presidio.
    """
    text = request.text
    entities_found = {}

    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.findall(pattern, text)
        if matches:
            entities_found[pii_type] = len(matches)
            # Replace with placeholder
            text = re.sub(pattern, f"[{pii_type}]", text)

    # Also replace common name patterns in clinical context
    common_replacements = [
        (r'\b(Patient|pt|Pt)\s+[A-Z][a-z]+\b', '[PATIENT_NAME]'),
        (r'\b(Doctor|Dr\.?)\s+[A-Z][a-z]+\b', '[PROVIDER_NAME]'),
    ]

    for pattern, replacement in common_replacements:
        matches = re.findall(pattern, text)
        if matches:
            entities_found["CONTEXT_NAMES"] = entities_found.get("CONTEXT_NAMES", 0) + len(matches)
            text = re.sub(pattern, replacement, text)

    return RedactResponse(
        redacted_text=text,
        entities_found=entities_found
    )


@app.post("/api/ai/redact-stream")
async def redact_pii_stream(request: RedactRequest):
    """
    Redact PII and return structured data for streaming.
    Returns redacted text along with a mapping of what was redacted.
    """
    text = request.text
    redaction_map = []

    for pii_type, pattern in PII_PATTERNS.items():
        matches = re.finditer(pattern, text)
        for match in matches:
            redaction_map.append({
                "type": pii_type,
                "original": match.group(),
                "replacement": f"[{pii_type}]"
            })

    # Apply redactions
    for pii_type, pattern in PII_PATTERNS.items():
        text = re.sub(pattern, f"[{pii_type}]", text)

    return {
        "redacted_text": text,
        "redaction_map": redaction_map,
        "warnings": ["This is a regex-based redaction. For production use, consider Microsoft Presidio for NLP-based detection."]
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
