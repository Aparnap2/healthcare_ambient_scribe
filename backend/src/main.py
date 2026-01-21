from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Healthcare Ambient Scribe API")


class HealthResponse(BaseModel):
    status: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="healthy", version="0.1.0")


@app.get("/")
async def root():
    return {"message": "Healthcare Ambient Scribe API", "docs": "/docs"}
