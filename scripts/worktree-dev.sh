#!/usr/bin/env bash
# Start the Vite dev server for THIS checkout (works in any git worktree) on a
# free port, so several worktrees can run side by side. The repo pins port 3000
# with strictPort, so concurrent worktrees would otherwise fail to bind — this
# picks an open port and hands it to Vite via the PORT env (see vite.config.ts).
#
# Usage:
#   scripts/worktree-dev.sh            # auto-pick a free port starting at 3000
#   scripts/worktree-dev.sh 3107       # use a specific port (fails if taken)
#   HOST=0.0.0.0 scripts/worktree-dev.sh   # expose on the network
#
# It also runs `npm install` automatically if this worktree has no node_modules
# (each worktree needs its own — they are not shared with the main checkout).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

# Free-port check: succeeds (returns 0) when nothing is listening on $1. Uses
# lsof so it catches IPv6-only listeners too — Vite binds localhost as [::1], which
# a bare 127.0.0.1 TCP probe would miss (reporting a taken port as free).
port_free() {
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
  fi
}

if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  PORT="$1"
  if ! port_free "$PORT"; then
    echo "Port $PORT is already in use. Pick another or omit the arg to auto-select." >&2
    exit 1
  fi
else
  PORT=3000
  while ! port_free "$PORT"; do
    PORT=$((PORT + 1))
    if [[ "$PORT" -gt 3099 ]]; then
      echo "No free port found in 3000-3099." >&2
      exit 1
    fi
  done
fi

if [[ ! -d node_modules ]]; then
  echo ">>> node_modules missing in this worktree — running npm install (one-time)…"
  npm install
fi

echo ">>> rogue dev server"
echo "    worktree : $ROOT"
echo "    branch   : $BRANCH"
echo "    url      : http://localhost:$PORT"
echo

# Note: empty-array expansion under `set -u` errors on macOS's bash 3.2, so build
# the optional --host args as a plain string rather than an array.
if [[ -n "${HOST:-}" ]]; then
  exec env PORT="$PORT" npm run dev -- --host "$HOST"
else
  exec env PORT="$PORT" npm run dev
fi
