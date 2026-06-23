# Persistence & Settings System — Plan

Status: **reviewed** (design only — implementation deferred)
Date: 2026-06-22

## Goal

Foundational client-side persistence built on `localStorage`. Two consumers:

1. **Save game progress** (the biggest slice) — if a tab is refreshed (or closed and
   reopened), the in-progress run is restored to its current state.
2. **General settings** (now and future) — player name, last-played class, and later
   things like mute/volume/sound, keybindings, etc.

## Non-negotiable storage choice

Use `localStorage` for both saves and settings. The run must survive refresh, tab
close, browser restart, and returning later; `sessionStorage` does not satisfy that
product requirement. Multiple tabs are accepted as last-write-wins for this first
version.

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
  savegame.ts     — serialize / validate / deserialize a GameEngine run
  store.test.ts
  settings.test.ts
  savegame.test.ts
```

### `store.ts` — generic versioned adapter (foundational)

The truly reusable piece. Everything else (settings, saves, future keybindings) sits
on this.

```ts
defineStore<T>({ key, version, defaults, migrate?, fallback?, backend? }) => {
  load(): T            // never throws; corrupt/absent → defaults
  save(value: T): void
  update(patch: Partial<T>): T
  clear(): void
}
```

- Resolves the default backend lazily via a helper, e.g.
  `typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage`,
  so module import stays safe in the `node` test environment. Wraps all I/O in
  try/catch + `console.error` (existing pattern in `discovery.ts:117`).
- Catches `QuotaExceededError` so a full disk never crashes the game.
- `backend` is an injectable `Storage` (defaults to `localStorage`) — this is what
  makes it testable in the `node` vitest env **without** adding jsdom.
- Every blob is wrapped as `{ v: version, data: T }`. On absent/corrupt/version
  mismatch it routes through `migrate` if present, otherwise returns `fallback` (or
  `defaults`). This lets settings fall back to defaults while save-game loading can
  deliberately return `null` through its typed wrapper.

### `settings.ts` — forward-compatible by policy

`loadSettings()` returns defaults merged with stored data, including known nested
objects such as `audio`, so adding a field later (e.g. `audio.volume`) works against
previously saved blobs. Initial fields:

- `playerName` (today hardcoded `'The Wretch'` at `store.svelte.ts:134`)
- `lastClass`  (today hardcoded `'Rogue'` at `store.svelte.ts:135`)
- `audio: { muted: boolean; volume: number }` — placeholder for future sound work

For the current codebase, `playerName` and `lastClass` are UI defaults only. The
settings store may define them now, but implementation should not pretend a real
character-name or class-selection flow exists until that UI is added. Once it exists,
`lastClass` is written whenever a run starts.

### `savegame.ts` — full-state snapshot

Snapshots live engine state directly (see decision below). Engine gains:

- `snapshot(): SaveGameV1`
- `restore(save: SaveGameV1): boolean` — accepts already-validated save data, rebuilds
  engine/runtime structures, updates FOV, dropdowns, logs, and UI state, then returns
  `false` only if it cannot restore and the caller should start fresh.

`savegame.ts` owns runtime validation before anything reaches `restore()`. TypeScript
interfaces do not protect parsed JSON, so `loadSaveGame()` must check the version,
required numeric fields, map/explored dimensions, array shapes, floor-state entries,
and basic player/monster/item/status structure. Unknown extra fields are ignored;
missing or malformed required fields discard the save.

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

`seed` is retained (useful for display / shareable seeds). `state` is the current
internal 32-bit position before the next draw; store it unsigned (`>>> 0`) so JSON
round-trips are stable. This change is tiny, isolated, and unit-testable: a stream
resumed from a captured position must match the original stream exactly. Existing
test fakes that implement `RNG` will need a trivial `getState()` method.

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
The current floor is stored from the engine's live `map`/`explored`/`monsters`/`items`;
`floorStates` contains the other cached floors.

## Integration points

- **Boot** — in `main.ts`, before `engine.initGame()` (`main.ts:20`):
  ```ts
  const save = loadSaveGame();
  if (!save || !engine.restore(save)) engine.initGame();
  engine.draw();
  ```
- **Autosave** — do **not** attach persistence blindly to `updateUI()`. Some code
  calls `updateUI()` mid-command (for example `consumeFood()` updates UI before
  `processTurn()` resolves the monster turn), and saving that intermediate state would
  create subtly wrong resumes. Add an engine-level `onRunChanged`/`autosave` hook and
  call it only after complete state mutations:
  - after `initGame()` creates the fresh run
  - at every terminal return path from `processTurn()` (normal, death, win)
  - after stair travel finishes (`travelStairs()` after `updateFOV()`/UI sync)
  - after successful equipment-only actions that do not consume a turn
  - after balance/config mutations if those remain available in the same build
  Use a trailing debounce around normal writes (~500ms) plus an immediate flush on
  `beforeunload` / `visibilitychange`.
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
  (including nested `audio`, for forward-compat); `update` preserves sibling fields.
- **savegame.test.ts** — headline test: seed an engine, play N turns, `snapshot()`,
  `restore()` into a fresh engine, assert deep-equality of player/monsters/map/floor/
  turn **and that the next RNG draws match** (proves determinism survives the round
  trip); `floorStates` Map survives; stale-version/corrupt/malformed save → `null`;
  restore recomputes `visible` and refreshes UI/log/dropdown state.
- **rng.test.ts** — `getState()` → `makeRng(seed, state)` reproduces the stream
  exactly from an arbitrary point.
- **keyboard verification** — this slice is storage-only, so there is no new keyboard
  behavior to verify. Any later settings UI, picker, or save-slot UI must follow
  `AGENTS.md`: keyboard navigation, Return activation, scoped modal shortcuts, visible
  focus, and no leakage into game movement.

## Known trade-offs

1. **Save format breaks on engine-state changes.** Mitigation: bump `SaveGameV1`→`V2`
   deliberately, and `restore()` fails safe — validates, discards, starts fresh; never
   crashes, never half-restores. Documented rule: *bump the version when you change
   engine state.*
2. **Multiple tabs share one localStorage save** (last-write-wins clobber). Fine for
   "refresh restores the run." Strict per-tab isolation would need `sessionStorage`
   (per-tab, survives refresh) — but that's lost on tab close, defeating "resume
   later." **Decision: localStorage for both**, accept last-write-wins; settings
   belong in localStorage regardless. Revisit only if real multi-tab play becomes a
   problem.

## Discussion items

- Existing `config.ts` already uses `localStorage` directly for dev tunables and does
  not currently guard server/node access the way `discovery.ts` does. The persistence
  slice can leave it alone, but a future cleanup could move config tunables onto the
  shared adapter.
- If save payloads grow toward quota because many floors are cached, the fail-safe is
  already discard/no-crash. A later version could add a small "save failed" UI signal,
  but that is not required for the first implementation.

## Out of scope (future, enabled by this foundation)

- Multiple save slots / named saves.
- Cloud sync.
- Mute/volume wiring once sound effects exist (the `settings.audio` fields are stubbed
  for it).
- Keybinding persistence (another `defineStore` consumer).
