#!/bin/bash
# Start Ollama with the qwen2.5-coder:3b model
# Usage: ./scripts/start-llm.sh

set -e

echo "🚀 Starting Ollama..."
docker run -d \
  --name healthcare-scribe-ollama \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  ollama/ollama

echo "⏳ Waiting for Ollama to be ready..."
sleep 5

echo "📦 Pulling qwen2.5-coder:3b model (this may take a few minutes)..."
docker exec healthcare-scribe-ollama ollama pull qwen2.5-coder:3b

echo ""
echo "✅ Ollama started!"
echo "  - API: localhost:11434"
echo "  - Model: qwen2.5-coder:3b"
