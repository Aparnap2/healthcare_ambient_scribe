#!/bin/bash
# Stop all healthcare-scribe containers
# Usage: ./scripts/stop-all.sh

echo "🛑 Stopping all healthcare-scribe containers..."

docker stop healthcare-scribe-db healthcare-scribe-minio healthcare-scribe-ollama healthcare-scribe-fhir 2>/dev/null || true
docker rm healthcare-scribe-db healthcare-scribe-minio healthcare-scribe-ollama healthcare-scribe-fhir 2>/dev/null || true

echo "✅ All containers stopped and removed."
