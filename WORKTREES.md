# Working in git worktrees

Worktrees let several branches of this repo be checked out at once, each in its
own directory, so an agent (or you) can build a feature in isolation without
disturbing the main checkout. This doc is the quick path; the scripts handle the
sharp edges.

## TL;DR

```bash
# from the main checkout (or any worktree):
scripts/worktree-new.sh my-feature v2     # create branch+worktree off v2
cd ../rogue-worktrees/my-feature
scripts/worktree-dev.sh                    # npm install (auto) + dev server on a free port
```

Open the printed `http://localhost:<port>` URL. Done.

## Layout

Worktrees are created as siblings of the main repo, never nested inside it:

```
code/
  rogue/                      # main checkout (e.g. branch v2)
  rogue-worktrees/
    my-feature/               # one worktree per branch
    another-thing/
```

Nesting a worktree *inside* `rogue/` would put a second project tree under Vite's
root and the asset globs — keep them siblings.

## The two things that bite, and how the scripts handle them

1. **Port collisions.** `vite.config.ts` pins port `3000` with `strictPort: true`,
   so a second dev server can't fall back to another port on its own — it just
   fails. The config now reads `PORT`/`VITE_PORT` from the environment (default
   3000), and `scripts/worktree-dev.sh` finds a free port (3000–3099) and passes
   it through. So every worktree gets its own server. A bare `npm run dev` still
   uses 3000.

2. **Per-worktree `node_modules`.** Each worktree has its own working tree and so
   needs its own install — they are not shared with the main checkout.
   `scripts/worktree-dev.sh` runs `npm install` automatically the first time it
   sees a worktree with no `node_modules`.

## Scripts

- **`scripts/worktree-dev.sh [port]`** — start the dev server for the current
  checkout (works in the main checkout too). Auto-picks a free port, or takes an
  explicit one. Installs deps if missing. `HOST=0.0.0.0 scripts/worktree-dev.sh`
  exposes it on the network.
- **`scripts/worktree-new.sh <branch> [base]`** — create a new branch + sibling
  worktree (base defaults to the current branch) and print the next steps.

## Manual equivalent (no scripts)

```bash
git worktree add -b my-feature ../rogue-worktrees/my-feature v2
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
