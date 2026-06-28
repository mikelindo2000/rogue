# Working in git worktrees

Worktrees let several branches of this repo be checked out at once, each in its
own directory, so an agent (or you) can build a feature in isolation without
disturbing the main checkout. This doc is the quick path; the scripts handle the
sharp edges.

## TL;DR

```bash
# from the main checkout (or any worktree):
scripts/worktree-new.sh my-feature v3     # create branch+worktree off active project base
cd ../rogue-worktrees/my-feature
scripts/worktree-dev.sh                    # npm install (auto) + dev server on a free port
```

Open the printed `http://localhost:<port>` URL. Done.

## Layout

Worktrees are created as siblings of the main repo, never nested inside it:

```
code/
  rogue/                      # main checkout (active project branch v3)
  rogue-worktrees/
    my-feature/               # one worktree per branch
    another-thing/
```

Nesting a worktree *inside* `rogue/` would put a second project tree under Vite's
root and the asset globs — keep them siblings.

## The three things that bite, and how the scripts handle them

1. **Wrong base branch.** The active project branch is `v3`. Worktrees should be
   created from `v3` or from a branch that already descends from `v3`. The helper
   scripts validate that base before creating or serving a worktree, and they
   stop with a recovery hint if the checkout is detached, at a root commit, or
   from an older project branch.

2. **Port collisions.** `vite.config.ts` pins port `3000` with `strictPort: true`,
   so a second dev server can't fall back to another port on its own — it just
   fails. The config now reads `PORT`/`VITE_PORT` from the environment (default
   3000), and `scripts/worktree-dev.sh` finds a free port (3000–3099) and passes
   it through. So every worktree gets its own server. A bare `npm run dev` still
   uses 3000.

3. **Per-worktree `node_modules`.** Each worktree has its own working tree and so
   needs its own install — they are not shared with the main checkout.
   `scripts/worktree-dev.sh` runs `npm install` automatically the first time it
   sees a worktree with no `node_modules`.

## Scripts

- **`scripts/worktree-dev.sh [port]`** — start the dev server for the current
  checkout (works in the main checkout too) after verifying it is on a branch
  based on `v3`. Auto-picks a free port, or takes an explicit one. Installs deps
  if missing. `HOST=0.0.0.0 scripts/worktree-dev.sh` exposes it on the network.
- **`scripts/worktree-new.sh <branch> [base]`** — create a new branch + sibling
  worktree (base defaults to `v3`) and print the next steps. Override the active
  base only for future branch migrations with `ROGUE_WORKTREE_BASE=<branch>`.

## Correct base branch flow

Use `v3` unless the task explicitly names a later active project branch:

```bash
git switch v3
git pull --ff-only
scripts/worktree-new.sh my-feature
cd ../rogue-worktrees/my-feature
scripts/worktree-dev.sh
```

You can also pass the base explicitly:

```bash
scripts/worktree-new.sh my-feature v3
```

If a worktree opens detached, at the initial/root commit, or on a branch that is
not descended from `v3`, do not start development there. Either create a fresh
worktree from `v3`, or move the branch onto `v3` if it contains work you need:

```bash
git fetch origin v3
git rebase v3
scripts/worktree-dev.sh
```

## Manual equivalent (no scripts)

```bash
git worktree add -b my-feature ../rogue-worktrees/my-feature v3
cd ../rogue-worktrees/my-feature
npm install
PORT=3107 npm run dev       # any free port
```

## Cleaning up

```bash
git worktree remove ../rogue-worktrees/my-feature   # when the branch is merged/abandoned
git worktree list                                   # see what exists
```

`git worktree remove` refuses if the tree is dirty; commit/stash or add `--force`.
Note `deploy/.build-worktree` is a long-lived deploy worktree (gitignored) — leave
it alone.
