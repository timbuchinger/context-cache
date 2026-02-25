#!/bin/sh
set -e

echo "🚀 context-cache KB indexer starting"
echo "   Knowledge base : ${CONTEXT_CACHE_KB_PATH}"
echo "   Database        : ${CONTEXT_CACHE_DB_PATH}"
echo ""

while true; do
  echo "⏰  $(date -u '+%Y-%m-%d %H:%M:%S UTC') — running indexer..."
  if node /app/dist/indexer-cli.js --quiet; then
    echo "✅  Indexer completed successfully"
  else
    echo "❌  Indexer exited with error (exit code $?)"
  fi
  echo "💤  Sleeping 60 seconds..."
  echo ""
  sleep 60
done
