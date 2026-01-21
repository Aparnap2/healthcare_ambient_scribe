# Healthcare Ambient Scribe - Backend

FastAPI-based backend for the Healthcare Ambient Scribe application.

## Setup

```bash
uv pip install -e ".[dev]"
```

## Running

```bash
uvicorn src.main:app --reload
```

## Testing

```bash
uv run pytest tests/ -v
```
