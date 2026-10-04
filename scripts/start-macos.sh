#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This release targets macOS. Windows support is planned later." >&2
  exit 1
fi
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Install Node.js 24 or newer, then launch Sparr again." >&2
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Node.js 24 or newer is required.");process.exit(1)}'
if [[ ! -d node_modules ]]; then npm ci --cache "$HOME/Library/Caches/Sparr/npm"; fi
sparr_port="$(node --env-file-if-exists=.env -p 'process.env.SPARR_PORT || 4318')"
if curl --silent --fail "http://127.0.0.1:$sparr_port/api/health" | /usr/bin/grep -q '"version":"0.1.0"'; then
  open "http://127.0.0.1:$sparr_port"
  echo "Sparr is already running."
  exit 0
fi
npm run build
NODE_ENV=production node --env-file-if-exists=.env --import tsx src/server/index.ts &
sparr_pid=$!
trap 'kill "$sparr_pid" 2>/dev/null || true' EXIT INT TERM
for ((i=0; i<60; i++)); do
  if curl --silent --fail "http://127.0.0.1:$sparr_port/api/health" >/dev/null; then
    open "http://127.0.0.1:$sparr_port"
    echo "Keep this terminal open while using Sparr. Press Control-C to stop."
    wait "$sparr_pid"
    exit $?
  fi
  if ! kill -0 "$sparr_pid" 2>/dev/null; then wait "$sparr_pid"; exit 1; fi
  sleep 0.5
done
echo "Sparr did not become ready. Check the startup errors above." >&2
exit 1
