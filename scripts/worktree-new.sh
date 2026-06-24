#!/usr/bin/env bash
# Create a new git worktree for a feature branch and get it ready to run.
# Worktrees are created as siblings of the main checkout under ../rogue-worktrees/
# so they never nest inside the repo (which would confuse Vite/globs).
#
# Usage:
#   scripts/worktree-new.sh <branch> [base]
#     <branch>  name of the new branch + worktree dir (e.g. map-3d-plane)
#     [base]    branch/commit to fork from (default: current branch)
#
# Example:
#   scripts/worktree-new.sh fog-of-war v2
#   cd ../rogue-worktrees/fog-of-war
#   scripts/worktree-dev.sh          # installs deps + serves on a free port
set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH="${1:-}"
if [[ -z "$BRANCH" ]]; then
  echo "Usage: scripts/worktree-new.sh <branch> [base]" >&2
  exit 1
fi
BASE="${2:-$(git rev-parse --abbrev-ref HEAD)}"

DEST="../rogue-worktrees/$BRANCH"
if [[ -e "$DEST" ]]; then
  echo "Worktree path already exists: $DEST" >&2
  exit 1
fi

echo ">>> Creating worktree '$BRANCH' from '$BASE' at $DEST"
git worktree add -b "$BRANCH" "$DEST" "$BASE"

echo
echo "Next:"
echo "  cd $DEST"
echo "  scripts/worktree-dev.sh        # npm install (auto) + dev server on a free port"
