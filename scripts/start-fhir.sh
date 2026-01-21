#!/bin/bash
# Start HAPI FHIR Server for EHR simulation
# Usage: ./scripts/start-fhir.sh

set -e

echo "🚀 Starting HAPI FHIR Server..."
docker run -d \
  --name healthcare-scribe-fhir \
  -p 8080:8080 \
  hapiproject/hapi:latest

echo ""
echo "✅ HAPI FHIR Server started!"
echo "  - UI: http://localhost:8080"
echo "  - Base URL: http://localhost:8080/fhir"
