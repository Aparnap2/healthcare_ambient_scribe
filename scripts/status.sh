#!/bin/bash
# Check status of all healthcare-scribe containers
# Usage: ./scripts/status.sh

echo "📊 Container Status:"
docker ps -a --filter "name=healthcare-scribe*" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
