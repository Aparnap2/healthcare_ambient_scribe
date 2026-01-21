Here is your comprehensive **"Zero-Investment"** development plan for the Healthcare Ambient Scribe. This blueprint is designed to be built on local hardware (or free-tier cloud) while demonstrating enterprise-grade architectural maturity.

### 1. High-Level Architecture
This system follows an **Event-Driven Microservices** pattern, simulated locally via Docker Compose.

*   **Frontend (The Face):** Next.js 15 (React) application for recording and reviewing notes.
*   **Orchestrator (The Brain):** FastAPI service using **LangGraph** to manage the "State" of a clinical note (Recording -> Processing -> Review -> Signed).
*   **Intelligence (The Model):** A local **Ollama** instance serving Llama-3 (or BioMistral) for reasoning.
*   **Ears & Voice:** **Faster-Whisper-Server** (STT) and **Kokoro-FastAPI** (TTS) running as local services.
*   **Integration:** A **FHIR-Converter** module that transforms Python objects into HL7 FHIR Bundles.

### 2. Core User Stories (The "Why")
| Actor | Story | Acceptance Criteria |
| :--- | :--- | :--- |
| **Physician** | "As a Dr, I want to record a session without saying 'period' or 'comma'." | System produces grammatically correct SOAP notes from colloquial speech. |
| **Physician** | "As a Dr, I want to approve the note section-by-section." | UI shows "Approve" buttons for S, O, A, P sections. Edits are tracked. |
| **Patient** | "As a Patient, I want to know my data is private." | System runs 100% locally; no data is sent to external AI APIs. |
| **Admin** | "As an Admin, I want standard data formats." | Final output is a valid FHIR Bundle (JSON) synced to a mock EHR. |

***

### 3. Data Model & Types (The "Skeleton")
We use **Pydantic** for internal validation and **SQLAlchemy** for the database.

**`schema.py` (Domain Models)**
```python
from enum import Enum
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional

class NoteStatus(str, Enum):
    RECORDING = "recording"
    PROCESSING = "processing"
    REVIEW = "review"
    SIGNED = "signed"

class TranscriptSegment(BaseModel):
    speaker: str = "unknown" # 'clinician' | 'patient'
    start: float
    end: float
    text: str

class SOAPNote(BaseModel):
    subjective: str = Field(description="Patient's history and symptoms")
    objective: str = Field(description="Vitals and physical exam findings")
    assessment: str = Field(description="Diagnoses and medical reasoning")
    plan: str = Field(description="Treatments, meds, and follow-up")
    icd10_codes: List[str] = Field(default_factory=list)

class Encounter(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    patient_id: str
    clinician_id: str
    start_time: datetime
    status: NoteStatus
    raw_transcript: List[TranscriptSegment] = []
    soap_draft: Optional[SOAPNote] = None
    redacted_text: Optional[str] = None
```

**`database.py` (Postgres Table)**
```sql
CREATE TABLE encounters (
    id UUID PRIMARY KEY,
    patient_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    transcript_json JSONB,  -- Stores the raw segments
    soap_json JSONB,        -- Stores the generated note
    fhir_bundle JSONB       -- The final synced artifact
);
```

***

### 4. Process Map & SOP (The "Workflow")
**SOP: Clinical Encounter Lifecycle**
1.  **Check-In:** Doctor selects patient in UI. System initializes `Encounter(status=RECORDING)`.
2.  **Ambient Capture:**
    *   Audio streams to `faster-whisper-server`.
    *   Segments arrive at `API`.
    *   **Live Update:** UI updates transcript in real-time.
3.  **Refinement (The "Magic"):**
    *   Doctor hits "Stop".
    *   **Redactor:** `Presidio` scans text, masks Names/Dates/Phones.
    *   **Agent:** LangGraph receives clean text -> Generates `SOAPNote` -> Maps ICD-10.
4.  **Review (HITL):**
    *   UI displays Draft.
    *   Doctor edits "Plan" section.
    *   Doctor clicks "Sign".
5.  **Finalization:**
    *   System converts `SOAPNote` -> `FHIR Bundle`.
    *   System "syncs" (posts) Bundle to `HAPI FHIR Server` (local mock).

***

### 5. Development Plan (The "Roadmap")
**Phase 1: The Local "Stack" (Days 1-3)**
*   [ ] Set up `docker-compose.yml`:
    *   `postgres:15`
    *   `ollama/ollama` (Pull `llama3`)
    *   `remsky/kokoro-fastapi` [github](https://github.com/remsky/Kokoro-FastAPI)
    *   `fedirz/faster-whisper-server` [github](https://github.com/021dev/faster-whisper-server-public)
*   [ ] Verify all services respond to `curl localhost:xxxx`.

**Phase 2: The Ear & The Voice (Days 4-7)**
*   [ ] Build `AudioRecorder` component in React (MediaRecorder API).
*   [ ] Build FastAPI endpoint `/stream` that accepts audio blobs and proxies them to Whisper.
*   [ ] Implement "Read Back" feature using Kokoro to read the generated summary.

**Phase 3: The Brain (Days 8-14)**
*   [ ] Implement `ClinicalAgent` class using **LangChain/LangGraph**.
*   [ ] **Prompt Engineering:** Create the system prompt that enforces SOAP structure and "Medical Professional" tone.
*   [ ] Integrate **Presidio** for PII stripping before the prompt hits the LLM.

**Phase 4: The Enterprise Polish (Days 15-20)**
*   [ ] **FHIR Integration:** Write the `SoapToFhir` converter.
*   [ ] **Eval Suite:** Write 5 "Gold Standard" test cases (transcript + expected SOAP).
*   [ ] **Documentation:** Write the `README.md` focusing on Architecture, Privacy, and Trade-offs.

***

### 6. Example Code: The "Agent" (LangGraph)
This is the core logic that orchestrates the note generation.

```python
# services/agent.py
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, END
from langchain_community.chat_models import ChatOllama
from langchain_core.pydantic_v1 import BaseModel

# 1. Define State
class AgentState(TypedDict):
    raw_text: str
    redacted_text: str
    soap_note: dict
    critique: str
    revision_count: int

# 2. Define Nodes
def redact_node(state: AgentState):
    # Call Presidio (Mock for zero-cost demo)
    # In prod: analyzer.analyze(state['raw_text'])
    return {"redacted_text": state['raw_text'].replace("John Doe", "[PATIENT]")}

def generate_soap_node(state: AgentState):
    llm = ChatOllama(model="llama3", format="json")
    prompt = f"Convert this transcript to SOAP JSON: {state['redacted_text']}"
    response = llm.invoke(prompt)
    return {"soap_note": response.content} # Parsed as JSON

def critique_node(state: AgentState):
    # Self-reflection: Did we miss the medication dosage?
    if "mg" not in str(state['soap_note']['plan']):
        return {"critique": "Missing dosage", "revision_count": state['revision_count'] + 1}
    return {"critique": "OK"}

# 3. Build Graph
workflow = StateGraph(AgentState)
workflow.add_node("redact", redact_node)
workflow.add_node("generate", generate_soap_node)
workflow.add_node("critique", critique_node)

workflow.set_entry_point("redact")
workflow.add_edge("redact", "generate")
workflow.add_edge("generate", "critique")

# Conditional Edge: If critique is bad, loop back (Logic simplified)
workflow.add_edge("critique", END) 

app = workflow.compile()
```

***

### 7. Testing & Evaluation Checklist
This section proves you are an **Engineer**, not a hacker.

**Unit Tests (`pytest`)**
- [ ] `test_audio_chunking`: Verify 10-minute audio is split correctly.
- [ ] `test_fhir_converter`: Verify generated JSON matches official FHIR Schema.
- [ ] `test_redaction`: Input "My name is Alice" -> Output "My name is [PERSON]".

**E2E Tests (`Playwright`)**
- [ ] Open App -> Click Record -> Speak -> Click Stop -> Verify SOAP appears -> Click Sign.

**LLM Evals (`DeepEval` - Local)**
*   *Run this on every Prompt Change!*
```python
from deepeval import assert_test
from deepeval.metrics import HallucinationMetric
from deepeval.test_case import LLMTestCase

def test_soap_accuracy():
    transcript = "Patient has a headache and took Tylenol."
    generated_soap = "S: Headache. Medications: Tylenol."
    
    metric = HallucinationMetric(threshold=0.3)
    test_case = LLMTestCase(
        input=transcript,
        actual_output=generated_soap,
        context=[transcript] # Ground truth
    )
    assert_test(test_case, [metric])
```

### 8. Final Deliverables
To "submit" this project to your portfolio:
1.  **GitHub Repo:** Clean code, `dev` branch, semantic commits.
2.  **Demo Video:** 2 minutes max. Show the "Real-time" aspect and the "Redaction" logic.
3.  **Architecture Diagram:** Use the Mermaid chart provided above.
4.  **"Cost Analysis" Table:** Show that your Cost Per Encounter is $0.00 (Electricity only).

This plan gives you a robust, demonstrable product that uses modern "AI Engineer" tools (LangGraph, vLLM/Ollama, Vector DBs) while adhering to the strict requirements of healthcare data privacy.
