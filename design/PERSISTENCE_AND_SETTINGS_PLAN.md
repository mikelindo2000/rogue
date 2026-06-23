# Persistence & Settings System — Plan

Status: **proposed** (design only — implementation deferred pending review)
Date: 2026-06-22

## Goal

Foundational client-side persistence built on `localStorage`. Two consumers:

1. **Save game progress** (the biggest slice) — if a tab is refreshed (or closed and
   reopened), the in-progress run is restored to its current state.
2. **General settings** (now and future) — player name, last-played class, and later
   things like mute/volume/sound, keybindings, etc.

## The core problem

Two kinds of persisted data with **opposite** lifetimes and failure policies:

|                | Game save                              | Settings                          |
| -------------- | -------------------------------------- | --------------------------------- |
| Scope          | One in-progress run                    | Global, cross-run                 |
| Lifetime       | Until death / new game                 | Forever                           |
| Shape churn    | High (engine state changes often)      | Low (occasional new field)        |
| Failure mode   | Stale/invalid → **discard, start new** | Unknown field → **merge defaults**|
| Examples       | floor, player, monsters, RNG position  | playerName, lastClass, mute/volume|

Because the migration policies are opposite, the design is **one shared low-level
adapter** with **two typed stores** layered on top.

## Module layout

All new, mirroring the existing `src/discovery.ts` / `src/config.ts` style (named
exports, single quotes, semicolons, 2-space indent, `typeof localStorage` guard,
try/catch + `console.error`).

```
src/persistence/
  store.ts        — generic versioned localStorage adapter (the foundational slice)
  settings.ts     — playerName, lastClass, audio{muted,volume}, … on top of store.ts
  savegame.ts     — serialize / deserialize a GameEngine run
  store.test.ts
  settings.test.ts
  savegame.test.ts
```

### `store.ts` — generic versioned adapter (foundational)

The truly reusable piece. Everything else (settings, saves, future keybindings) sits
on this.

```ts
defineStore<T>({ key, version, defaults, migrate?, backend? }) => {
  load(): T            // never throws; corrupt/absent → defaults
  save(value: T): void
  update(patch: Partial<T>): T
  clear(): void
}
```

- Guards `typeof localStorage === 'undefined'`; wraps all I/O in try/catch +
  `console.error` (existing pattern in `discovery.ts:117` / `config.ts:226`).
- Catches `QuotaExceededError` so a full disk never crashes the game.
- `backend` is an injectable `Storage` (defaults to `localStorage`) — this is what
  makes it testable in the `node` vitest env **without** adding jsdom.
- Every blob is wrapped as `{ v: version, data: T }`. On version mismatch it routes
  through `migrate` (settings: merge defaults) or returns `defaults`/`null`
  (savegame: discard).

### `settings.ts` — forward-compatible by policy

`load()` returns `{ ...defaults, ...stored.data }`, so adding a field later (e.g.
`audio.volume`) just works against previously saved blobs. Initial fields:

- `playerName` (today hardcoded `'The Wretch'` at `store.svelte.ts:134`)
- `lastClass`  (today hardcoded `'Rogue'` at `store.svelte.ts:135`)
- `audio: { muted: boolean; volume: number }` — placeholder for future sound work

`lastClass` is written whenever a run starts.

### `savegame.ts` — full-state snapshot

Snapshots live engine state directly (see decision below). Engine gains:

- `snapshot(): SaveGameV1`
- `restore(save: SaveGameV1): boolean` — validates shape/version; returns `false` so
  the caller falls back to a fresh game.

## Decision: full snapshot, not seed + action replay

The game is seed-deterministic, so replay is tempting — but it's the wrong choice:

1. **RNG is a live closure, not the seed.** By mid-run it has advanced thousands of
   draws (`rng.ts:26`). Replay would require re-running every action in exact order.
2. **The floor cache holds mutated state.** `floorStates: Map<number, FloorState>`
   (`engine.ts:58`) stores visited floors' monsters/items/explored — not
   reconstructable without full replay.
3. **The game is under active balance/AI churn.** Any change to RNG call *order*
   between versions silently corrupts every old replay-save. A snapshot has no such
   coupling — it only breaks when the *state shape* changes, which is explicit and
   detectable.

Good news from the state audit: nearly everything is already plain JSON-friendly —
`player`, `monsters` (incl. their `ai` runtime blob), `items`, `map`, `explored`,
`statusEffects`, `logs`, `floorStates`. The only non-serializable things are the RNG
closure (handled below) and the UI-layer `WeakMap` animation caches in `ui.ts`
(`moveAnim`/`lastTile`/`dodgeAnim`) — and those rebuild themselves each turn, so we
skip them.

## The one engine-side change: snapshot the RNG position

To restore mid-run determinism we need the RNG's internal position — currently a
private `let state` in `makeRng` (`rng.ts:26`). mulberry32's state is a single 32-bit
int that advances by a fixed increment, so capturing/restoring it is exact and cheap.

```ts
interface RNG { /* … */; getState(): number }   // current 32-bit position
export function makeRng(seed: number, state?: number): RNG  // resume from a position
```

`seed` is retained (useful for display / shareable seeds). This change is tiny,
isolated, and unit-testable: a stream resumed from a captured position must match the
original stream exactly.

## `SaveGameV1` contents

Serialized from `GameEngine` (`engine.ts:28`):

- `seed`, `rngState`
- `player`
- `dungeonFloor`, `turn`, `gameOver`, `gameWon`
- `logs`, `statusEffects`
- `map`, `explored`
- `monsters`, `items`
- `floorStates` → serialized as `[floor, FloorState][]` entries
- private run flags: `searchHintShown`, `secretsFoundThisRun`

**Skipped:** `visible` (recomputed via `updateFOV()`), the `ui.ts` WeakMaps, and
`discovery` (already persisted independently via `discovery.ts` — left untouched).

## Integration points

- **Boot** — in `main.ts`, before `engine.initGame()` (`main.ts:20`):
  ```ts
  const save = loadSaveGame();
  if (save && engine.restore(save)) engine.draw();
  else engine.initGame();
  ```
- **Autosave** — every turn already funnels through `updateUI()` after `this.turn++`
  (`engine.ts:764`, `engine.ts:842`). Add one throttled `autosave()` there (trailing
  debounce ~500ms; writes are a few KB and synchronous, so the throttle is insurance)
  plus a flush on `beforeunload` / `visibilitychange`.
- **Lifecycle** — `initGame()` overwrites the save (fresh run). Death/win keeps the
  final snapshot so a refresh still shows the death screen.

## Testing strategy

Matches the existing `node`-env, no-jsdom convention (`vitest.config.ts`). The
injectable `backend` lets storage logic be tested without jsdom via a ~20-line
in-memory `MemoryStorage` implementing the `Storage` interface — the same pure-logic /
I/O separation `discovery.ts` already uses.

- **store.test.ts** — empty→defaults; round-trip; corrupt JSON→defaults (no throw);
  version mismatch→migrate/discard; quota error swallowed; absent backend→no-op.
- **settings.test.ts** — defaults; partial stored blob merges with defaults
  (forward-compat); `update` preserves sibling fields.
- **savegame.test.ts** — headline test: seed an engine, play N turns, `snapshot()`,
  `restore()` into a fresh engine, assert deep-equality of player/monsters/map/floor/
  turn **and that the next RNG draws match** (proves determinism survives the round
  trip); `floorStates` Map survives; stale-version/corrupt save → `null`.
- **rng.test.ts** — `getState()` → `makeRng(seed, state)` reproduces the stream
  exactly from an arbitrary point.

## Known trade-offs

1. **Save format breaks on engine-state changes.** Mitigation: bump `SaveGameV1`→`V2`
   deliberately, and `restore()` fails safe — validates, discards, starts fresh; never
   crashes, never half-restores. Documented rule: *bump the version when you change
   engine state.*
2. **Multiple tabs share one localStorage save** (last-write-wins clobber). Fine for
   "refresh restores the run." Strict per-tab isolation would need `sessionStorage`
   (per-tab, survives refresh) — but that's lost on tab close, defeating "resume
   later." **Recommendation: localStorage for both**, accept last-write-wins; settings
   belong in localStorage regardless. Revisit if needed.

## Open question for review

- localStorage vs sessionStorage for the **save slot** (trade-off #2). Recommendation
  is localStorage.

## Out of scope (future, enabled by this foundation)

- Multiple save slots / named saves.
- Cloud sync.
- Mute/volume wiring once sound effects exist (the `settings.audio` fields are stubbed
  for it).
- Keybinding persistence (another `defineStore` consumer).
