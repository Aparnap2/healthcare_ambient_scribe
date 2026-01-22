# Healthcare Ambient Scribe

> **⚠️ Portfolio Project Only** - This project is for demonstration purposes and is not intended for production use in real clinical settings. It lacks HIPAA compliance verification, security audits, and required healthcare certifications.

A local-first AI-powered clinical documentation system that converts physician-patient conversations into structured SOAP notes using open-source speech-to-text, local LLMs, and text-to-speech technologies.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 15)                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ Audio Recorder│  │  WhisperX API    │  │   Kokoro TTS         │   │
│  │ (MediaRecorder)│→│  (Transcription) │  │   (Text-to-Speech)   │   │
│  └──────────────┘  └──────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     API Layer (Hono + Prisma)                       │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ CRUD         │  │  SOAP Generator   │  │   FHIR R4 Export     │   │
│  │ Encounters   │→│  (AI Integration) │  │   (HL7 Standards)    │   │
│  └──────────────┘  └──────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AI Service (Python FastAPI)                      │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ Ollama       │  │  PII Redaction    │  │   SOAP Generation    │   │
│  │ qwen2.5-coder│←│  (Regex Patterns) │←│   (JSON Structured)   │   │
│  └──────────────┘  └──────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Infrastructure                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ PostgreSQL │  │  WhisperX  │  │   Ollama   │  │  Kokoro    │    │
│  │ (Port 5432)│  │ (Port 8088)│  │(Port 11434)│  │(Port 8080) │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 15, React 19, Tailwind CSS, shadcn/ui |
| **API** | Hono (Node.js), Prisma ORM, TypeScript |
| **AI Service** | Python 3.13, FastAPI, Pydantic |
| **LLM** | Ollama with `qwen2.5-coder:3b` |
| **Speech-to-Text** | WhisperX API (port 8088) |
| **Text-to-Speech** | Kokoro TTS (port 8080) |
| **Database** | PostgreSQL |
| **Package Managers** | pnpm (Node.js), uv (Python) |
| **Testing** | Vitest, Pytest, Playwright |

## Features

- **Audio Recording**: Browser-based recording using MediaRecorder API
- **Transcription**: Speech-to-text via WhisperX API
- **SOAP Generation**: AI-powered clinical note creation
- **PII Redaction**: Automatic masking of names, phones, emails, SSN, dates, MRN
- **FHIR Export**: HL7 FHIR R4 Bundle generation for EHR integration
- **Text-to-Speech**: Listen to generated SOAP notes with Kokoro

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.10+
- pnpm package manager
- uv Python package manager
- Docker (for infrastructure services)

### Infrastructure Services

Start the required containers:

```bash
# PostgreSQL (existing fraud-db container)
docker start fraud-db

# MinIO (object storage)
docker run -d --name healthcare-scribe-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin -e MINIO_ROOT_PASSWORD=password123 \
  minio/minio server /data

# Ollama (pull qwen2.5-coder:3b)
docker run -d --name ollama \
  -p 11434:11434 \
  ollama/ollama
docker exec ollama ollama pull qwen2.5-coder:3b

# WhisperX API
docker run -d --name whisperx-api \
  -p 8088:8000 \
  pluja/whisperx-api

# Kokoro TTS
docker run -d --name kokoro-tts \
  -p 8080:8080 \
  cpu_kokoro-tts:latest
```

### Frontend Setup

```bash
cd frontend
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev:frontend  # Runs on http://localhost:3000
```

### API Server

```bash
cd frontend
pnpm dev:api  # Runs on http://localhost:3001
```

### AI Service

```bash
cd ai_service
uv sync
uv run python main.py  # Runs on http://localhost:8002
```

### Run All Services

```bash
cd frontend
pnpm dev  # Runs frontend, API, and AI service concurrently
```

## API Endpoints

### Encounters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/encounters` | List all encounters |
| GET | `/api/encounters/:id` | Get encounter details |
| POST | `/api/encounters` | Create new encounter |
| PATCH | `/api/encounters/:id` | Update encounter |
| DELETE | `/api/encounters/:id` | Delete encounter |

### SOAP Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/encounters/:id/generate-soap` | Generate SOAP note from transcript |

### FHIR Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/encounters/:id/fhir` | Get FHIR Bundle |
| POST | `/api/encounters/:id/fhir-export` | Export to external FHIR server |

### AI Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/generate-soap` | Generate SOAP note |
| POST | `/api/ai/redact` | Redact PII from text |

## Project Structure

```
healthcare_ambient_scribe/
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main dashboard UI
│   │   └── layout.tsx
│   ├── api/
│   │   ├── index.ts           # Hono API server
│   │   └── fhir.test.ts       # FHIR unit tests
│   ├── prisma/
│   │   └── schema.prisma      # Database schema
│   └── package.json
├── ai_service/
│   ├── main.py                # FastAPI AI service
│   ├── test_redaction.py      # PII redaction tests
│   └── pyproject.toml
└── README.md
```

## Database Schema

```prisma
model Clinician {
  id        String @id
  name      String
  specialty String?
  encounters Encounter[]
}

model Patient {
  id        String @id
  name      String
  dob       DateTime?
  mrn       String?
  encounters Encounter[]
}

model Encounter {
  id              String @id
  clinicianId     String
  patientId       String
  status          EncounterStatus @default(RECORDING)
  audioUrl        String?
  transcript      String?
  soapSubjective  String?
  soapObjective   String?
  soapAssessment  String?
  soapPlan        String?
  icd10Codes      String[]
  fhirBundleId    String?
  encounterDate   DateTime @default(now())
  signedAt        DateTime?
}

enum EncounterStatus {
  RECORDING
  PROCESSING
  REVIEW
  SIGNED
}
```

## Testing

### Frontend Tests (Vitest)

```bash
cd frontend
pnpm vitest run api/fhir.test.ts
```

### AI Service Tests (Pytest)

```bash
cd ai_service
uv run pytest test_redaction.py -v
```

### End-to-End Tests (Playwright)

```bash
cd frontend
pnpm test:e2e
```

## Test Results

### Unit Tests (19 passing)

| Test Suite | Tests | Status |
|------------|-------|--------|
| PII Redaction | 14 | ✅ All passed |
| FHIR Bundle | 5 | ✅ All passed |

#### PII Redaction Tests (`ai_service/test_redaction.py`)
- Phone number formats (US variants)
- Email addresses (standard + subdomains)
- SSN formats (dashed, spaced, plain)
- Date formats (MM/DD/YYYY, YYYY-MM-DD)
- MRN patterns
- Full name detection
- Clinical text preservation
- Edge cases (empty input, no PII)

#### FHIR Bundle Tests (`frontend/api/fhir.test.ts`)
- Valid FHIR Bundle generation
- Patient resource with MRN, name, DOB
- Practitioner resource with specialty
- Encounter status mapping
- Composition with SOAP sections

## FHIR R4 Bundle Structure

The system generates standard HL7 FHIR R4 bundles:

```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    { "resource": { "resourceType": "Patient", ... } },
    { "resource": { "resourceType": "Practitioner", ... } },
    { "resource": { "resourceType": "Encounter", ... } },
    { "resource": { "resourceType": "Composition", "section": [...] } }
  ]
}
```

## PII Redaction Patterns

| Entity Type | Pattern Example |
|-------------|-----------------|
| Name | `John Doe` → `[NAME]` |
| Phone | `(555) 123-4567` → `[PHONE]` |
| Email | `john@hospital.com` → `[EMAIL]` |
| SSN | `123-45-6789` → `[SSN]` |
| Date | `01/15/2024` → `[DATE]` |
| MRN | `MRN: 12345` → `[MRN]` |

## License

MIT License - See [LICENSE](LICENSE) for details.

## Disclaimer

This is a **portfolio project** for demonstrating full-stack engineering skills including:
- Local-first AI integration
- Healthcare interoperability standards (FHIR)
- Type-safe API design
- Comprehensive testing strategies

It is **NOT** certified for:
- HIPAA compliance
- Real patient data handling
- Production clinical workflows
- Medical decision support

For production healthcare applications, proper security audits, compliance certifications, and regulatory approvals are required.
