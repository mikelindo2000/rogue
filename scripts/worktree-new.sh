#!/usr/bin/env bash
# Create a new git worktree for a feature branch and get it ready to run.
# Worktrees are created as siblings of the main checkout under ../rogue-worktrees/
# so they never nest inside the repo (which would confuse Vite/globs).
#
# Usage:
#   scripts/worktree-new.sh <branch> [base]
#     <branch>  name of the new branch + worktree dir (e.g. map-3d-plane)
#     [base]    branch/commit to fork from (default: v3)
#
# Example:
#   scripts/worktree-new.sh fog-of-war v3
#   cd ../rogue-worktrees/fog-of-war
#   scripts/worktree-dev.sh          # installs deps + serves on a free port
set -euo pipefail

cd "$(dirname "$0")/.."

ACTIVE_BASE_BRANCH="${ROGUE_WORKTREE_BASE:-v3}"

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

print_base_help() {
  cat >&2 <<EOF

Expected Rogue worktree flow:
  scripts/worktree-new.sh <branch> $ACTIVE_BASE_BRANCH

This repo's active project branch is '$ACTIVE_BASE_BRANCH'. If this checkout is
detached or opened at the initial/root commit, switch back to the project base:
  git switch $ACTIVE_BASE_BRANCH
  git pull --ff-only
EOF
}

validate_current_checkout() {
  local current_branch
  current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"

  if [[ "$current_branch" == "HEAD" ]]; then
    echo "warning: current checkout is detached; new worktree base will be validated explicitly." >&2
  fi

  local head_commit
  head_commit="$(ref_commit HEAD)" || die "not inside a valid git checkout"
  if is_root_commit "$head_commit"; then
    echo "warning: current checkout is at a root commit; use '$ACTIVE_BASE_BRANCH' as the worktree base." >&2
  fi
}

validate_base_ref() {
  local base_ref="$1"
  local active_commit
  local base_commit

  active_commit="$(ref_commit "$ACTIVE_BASE_BRANCH")" || {
    print_base_help
    die "active project branch '$ACTIVE_BASE_BRANCH' was not found locally"
  }
  base_commit="$(ref_commit "$base_ref")" || {
    print_base_help
    die "base '$base_ref' is not a valid branch, tag, or commit"
  }

  if is_root_commit "$base_commit"; then
    print_base_help
    die "base '$base_ref' resolves to a root commit, not the active project branch"
  fi

  if ! git merge-base --is-ancestor "$active_commit" "$base_commit"; then
    print_base_help
    die "base '$base_ref' is not based on active project branch '$ACTIVE_BASE_BRANCH'"
  fi
}

BRANCH="${1:-}"
if [[ -z "$BRANCH" ]]; then
  echo "Usage: scripts/worktree-new.sh <branch> [base]" >&2
  exit 1
fi
BASE="${2:-$ACTIVE_BASE_BRANCH}"

validate_current_checkout
validate_base_ref "$BASE"

DEST="../rogue-worktrees/$BRANCH"
if [[ -e "$DEST" ]]; then
  die "worktree path already exists: $DEST"
fi

echo ">>> Creating worktree '$BRANCH' from '$BASE' at $DEST"
git worktree add -b "$BRANCH" "$DEST" "$BASE"

echo
echo "Next:"
echo "  cd $DEST"
echo "  scripts/worktree-dev.sh        # npm install (auto) + dev server on a free port"
