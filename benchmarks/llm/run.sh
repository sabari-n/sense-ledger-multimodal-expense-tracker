#!/usr/bin/env bash
# Benchmark Ollama models against SenseLedger's extraction prompt.
#
#   ./benchmarks/llm/run.sh llama3.2:1b gemma3:4b qwen2.5:7b
#   ./benchmarks/llm/run.sh gemma3:4b --verbose      # also print each answer
#
# Needs the Docker stack running (expense-api) and Ollama reachable from it.
# Results are printed and saved to benchmarks/llm/results/<timestamp>.json.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONTAINER="${CONTAINER:-expense-api}"
# Under /app so the app's node_modules (ollama) resolve; unique per run so parallel runs don't collide.
# Running several at once still shares the GPU and slows the timings, so run one at a time.
REMOTE_DIR="/app/llm-bench-$(date +%s)-$$"

if [ $# -eq 0 ]; then
  echo "Usage: $0 <model> [model...] [--verbose]"
  echo "Installed models:"; ollama list 2>/dev/null || echo "  (ollama CLI not found)"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER is not running. Start the stack: docker compose up -d"
  exit 1
fi

# Warn about models that aren't pulled yet (they are skipped by the benchmark).
if command -v ollama >/dev/null; then
  for m in "$@"; do
    case "$m" in --*) continue ;; esac
    ollama list | awk 'NR>1{print $1}' | grep -qx "$m" || ollama list | awk 'NR>1{print $1}' | grep -qx "$m:latest" \
      || echo "warning: $m is not pulled. Run: ollama pull $m"
  done
fi

docker exec "$CONTAINER" mkdir -p "$REMOTE_DIR"
docker cp "$HERE/bench.mjs" "$CONTAINER:$REMOTE_DIR/bench.mjs" >/dev/null
docker cp "$HERE/cases.json" "$CONTAINER:$REMOTE_DIR/cases.json" >/dev/null
docker cp "$HERE/fixtures" "$CONTAINER:$REMOTE_DIR/fixtures" >/dev/null
docker exec "$CONTAINER" node "$REMOTE_DIR/bench.mjs" "$@" 2> >(grep -v -i sequelize >&2)

mkdir -p "$HERE/results"
OUT="$HERE/results/$(date +%Y%m%d-%H%M%S).json"
docker cp "$CONTAINER:$REMOTE_DIR/results.json" "$OUT" >/dev/null
docker exec "$CONTAINER" rm -rf "$REMOTE_DIR"
echo; echo "Saved: $OUT"
