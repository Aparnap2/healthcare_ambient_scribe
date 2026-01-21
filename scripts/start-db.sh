#!/bin/bash
# Start PostgreSQL and MinIO for local development
# Usage: ./scripts/start-db.sh

set -e

echo "🚀 Starting PostgreSQL..."
docker run -d \
  --name healthcare-scribe-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ambient_scribe \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15

echo "🚀 Starting MinIO (S3-compatible storage)..."
docker run -d \
  --name healthcare-scribe-minio \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=password \
  -p 9000:9000 \
  -p 9001:9001 \
  -v minio_data:/data \
  minio/minio server /data --console-address ":9001"

echo ""
echo "✅ Services started!"
echo "  - PostgreSQL: localhost:5432 (postgres/postgres)"
echo "  - MinIO Console: http://localhost:9001 (admin/password)"
echo "  - MinIO API: localhost:9000"
echo ""
echo "Create bucket 'audio-files' in MinIO console for audio storage."
