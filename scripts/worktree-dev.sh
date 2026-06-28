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
ACTIVE_BASE_BRANCH="${ROGUE_WORKTREE_BASE:-v3}"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"

die() {
  echo "error: $*" >&2
  exit 1
}

ref_commit() {
  git rev-parse --verify --quiet "$1^{commit}"
}

is_root_commit() {
  local commit="$1"
  local roots
  roots="$(git rev-list --max-parents=0 "$commit")"
  [[ "$roots" == *"$commit"* ]]
}

print_checkout_help() {
  cat >&2 <<EOF

Expected Rogue worktree flow:
  scripts/worktree-new.sh <branch> $ACTIVE_BASE_BRANCH
  cd ../rogue-worktrees/<branch>
  scripts/worktree-dev.sh

This repo's active project branch is '$ACTIVE_BASE_BRANCH'. If this worktree
opened on the wrong commit, create a new worktree from '$ACTIVE_BASE_BRANCH' or
move this branch onto the right base:
  git fetch origin $ACTIVE_BASE_BRANCH
  git rebase $ACTIVE_BASE_BRANCH
EOF
}

validate_project_base() {
  local active_commit
  local head_commit

  active_commit="$(ref_commit "$ACTIVE_BASE_BRANCH")" || {
    print_checkout_help
    die "active project branch '$ACTIVE_BASE_BRANCH' was not found locally"
  }
  head_commit="$(ref_commit HEAD)" || die "not inside a valid git checkout"

  if [[ "$BRANCH" == "HEAD" ]]; then
    print_checkout_help
    die "checkout is detached; switch to a branch based on '$ACTIVE_BASE_BRANCH' before starting dev"
  fi

  if is_root_commit "$head_commit"; then
    print_checkout_help
    die "checkout is at a root commit, not the active project branch '$ACTIVE_BASE_BRANCH'"
  fi

  local merge_base
  merge_base="$(git merge-base "$active_commit" "$head_commit" 2>/dev/null || true)"
  if [[ -z "$merge_base" || "$(is_root_commit "$merge_base"; echo $?)" == "0" ]]; then
    print_checkout_help
    die "branch '$BRANCH' does not share a non-root base with active project branch '$ACTIVE_BASE_BRANCH'"
  fi

  if ! git merge-base --is-ancestor "$active_commit" "$head_commit"; then
    echo "warning: '$ACTIVE_BASE_BRANCH' has advanced since '$BRANCH' branched." >&2
    echo "         Continue for local dev; rebase onto '$ACTIVE_BASE_BRANCH' before merge if needed." >&2
  fi
}

validate_project_base

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
