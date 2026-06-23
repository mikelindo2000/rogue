# End-Game Stats & Browser Records Plan

Status: **draft for review**
Date: 2026-06-22

## Goal

When a run ends, replace the small "Victory / You died" card with a full end-run
screen that feels like a score sheet, obituary, trophy case, and local rivalry all
at once. The screen should show the current run's story, call out new browser
records, and keep a history of previous completed runs in `localStorage`.

The browser is the scope. No account system, no server leaderboard, and no cross-
device sync.

## Current state

- Terminal state already lives in the engine as `gameOver` and `gameWon`.
- `CenterStage.svelte` renders a compact end overlay with title, subtitle, and
  `R` restart hint.
- `GameEngine.snapshot()` and `restore()` already preserve finished runs through
  the save-game path.
- `src/persistence/store.ts` provides the right low-level `localStorage` adapter:
  versioned blobs, injectable `Storage`, safe fallback, and no crashes on bad data.
- The victory gate must remain tied to the real final encounter. The floor-1
  Marcus test spawn can have `special: 'boss'`, so stats should treat the run as a
  win only when `engine.gameWon` is true, not when any boss-tagged monster dies.

## Product shape

The end screen has three jobs:

1. Tell the run's story in a fun way.
2. Compare this run to the browser's prior runs.
3. Make the next action obvious from the keyboard.

Recommended layout:

```
EndRunScreen
  Hero result band
    outcome, title line, epitaph/victory line, seed, date, duration
    primary record badges
  Scoreboard strip
    score, deepest floor, turns, gold, level, kills
  Tabs or columns
    Run Story
    Combat
    Loot & Gear
    Exploration
    Records
    History
  Action row
    Restart, Copy summary, Clear local history
```

The screen should open automatically when `ui.gameOver || ui.gameWon`. It can be a
center-stage overlay rather than a global modal, but it should behave like an
active overlay: movement keys should not leak into the game, focus should land on
the first action, and `R` should still restart.

## Stats to collect

Some stats can be derived from final engine state. Most of the interesting ones
need to be tracked during the run because the final state no longer contains
everything that happened.

### Final-state stats

- Outcome: victory or death.
- Floor reached and deepest floor reached.
- Turn count.
- Player level, XP, HP, max HP, defense, hunger state.
- Gold held.
- Inventory carried at the end: food, potions by type, weapons, armor, shields.
- Equipped gear at the end.
- Seed.
- Final log lines.
- Whether the game ended on floor 20.

### Run timeline stats

Add a `RunStats` object owned by `GameEngine` and included in save snapshots:

- `runId` generated at `initGame()`.
- `startedAt`, `endedAt`, and elapsed milliseconds.
- Restart count is not part of a run. A new run gets a new `runId`.
- Player actions:
  - steps walked
  - run-command steps
  - attacks made
  - searches attempted
  - successful secret reveals
  - stair descents
  - stair ascents
  - turns spent starving
- Combat:
  - monsters killed
  - kills by monster ID
  - kills by archetype
  - bosses defeated
  - heroes defeated
  - damage dealt
  - damage taken
  - biggest hit dealt
  - biggest hit taken
  - misses or dodges, where the engine can observe them cleanly
  - killing blow source when the player dies, if known
- Progression:
  - levels gained
  - XP gained from combat
  - XP gained from chests
  - deepest floor reached
  - unique floors visited
- Exploration:
  - tiles first explored
  - rooms entered, if room metadata exists by then
  - secrets found
  - dead-end search hints shown
  - floors revisited
- Loot:
  - gold collected
  - chests opened
  - food picked up
  - food eaten
  - potions picked up by type
  - potions drunk by type
  - scrolls triggered by effect
  - gear picked up by rarity and slot
  - equipment changes
- Survival texture:
  - lowest HP survived
  - lowest hunger survived
  - times low-health warning crossed
  - times critical-health warning crossed
  - turns invisible, armored, strengthened, vigor-active, or Midas-active

Keep each counter increment close to the action that causes it. The end screen
should not infer "potions drunk" by comparing inventory lengths.

## Fun presentation

The fun layer should be deterministic and data-driven, not random confetti.

### Run titles

Pick one title from ordered rules:

| Rule | Example title |
| --- | --- |
| Victory under a turn threshold | "Fastest blade in the dungeon" |
| Victory with very low final HP | "Won by a heartbeat" |
| Died on floor 20 | "So close to daylight" |
| Died to starvation | "The pantry was the real boss" |
| Found many secrets | "Wall whisperer" |
| Killed many monsters | "Dungeon cleaner" |
| Hoarded lots of gold | "Chest enthusiast" |
| Default victory | "Escaped the dungeon" |
| Default death | "The dungeon claims another" |

### Awards

Show 3-6 awards based on the current run:

- "New browser record" for any record this run sets.
- "Deepest dive" for a new deepest floor.
- "Gold fever" for a high-gold run.
- "Cartographer" for high tile exploration.
- "Brawler" for high kills.
- "Barely breathing" for surviving at 1 HP.
- "Secret keeper" for multiple hidden doors found.
- "Stair master" for many floor transitions.
- "Potion sommelier" for using many potions.
- "Ration discipline" for winning with food left over.

Awards should have plain text labels and short flavor lines. Do not depend on
emoji for meaning.

### Comparisons

For each major stat, compare against browser history:

- `new record`
- `tied record`
- `+12 over best`
- `3 turns slower than best victory`
- `top 10 percent of local runs`, when there are enough prior runs
- `first victory in this browser`

Records should be computed from completed run summaries only. The current
in-progress save should not count.

## Score model

A score makes the screen scan quickly, but it should not become the only truth.

Implemented first-pass tuned formula:

```ts
score =
  deepestFloor * 1200 +
  playerLevel * 650 +
  Math.round(goldCollected * 0.75) +
  monstersKilled * 90 +
  bossesDefeated * 1600 +
  secretsFound * 350 +
  (gameWon ? 16000 : 0) +
  (gameWon ? Math.max(0, 8000 - turns * 3) : 0) -
  Math.floor(turns / 6) -
  Math.floor(damageTaken / 12);
```

Clamp at `0`. Store the formula version on the run summary:

```ts
scoreVersion: 2
```

This was tuned against sample early-death, mid-depth death, deep-death, slow-win,
and fast-win runs. The chosen shape keeps deep progress valuable, makes victory
clearly beat a comparable deep death, and gives fast victories enough bonus to
compete with slower loot-heavy wins.

If the formula changes later, old summaries remain comparable within their
version and can be displayed with the stored numeric score.

## Persistence design

Add a new typed store:

```
src/persistence/runHistory.ts
```

Use `defineStore()` from `store.ts` rather than touching `localStorage` directly.

Storage key:

```ts
rogue_run_history
```

Version:

```ts
1
```

Shape:

```ts
interface RunHistoryV1 {
  runs: RunSummaryV1[];
}

interface RunSummaryV1 {
  runId: string;
  completedAt: string;
  outcome: 'won' | 'died';
  scoreVersion: 1;
  score: number;

  seed: number;
  turns: number;
  elapsedMs: number;
  floorReached: number;
  deepestFloor: number;
  playerLevel: number;
  goldHeld: number;
  goldCollected: number;

  monstersKilled: number;
  killsByMonsterId: Record<string, number>;
  bossesDefeated: number;
  damageDealt: number;
  damageTaken: number;

  secretsFound: number;
  tilesExplored: number;
  chestsOpened: number;
  foodEaten: number;
  potionsDrunk: Record<string, number>;
  gearPickedUpByRarity: Record<string, number>;

  deathCause?: string;
  killedByMonsterId?: string;
  title: string;
  awards: string[];
}
```

Keep the history bounded. Recommended cap: the newest 100 completed runs. This
keeps the blob small while still giving records enough data to be satisfying.

### Dedupe rule

Finalization must be idempotent. A refresh on the game-over screen should not add
the same run twice.

Use `runId` as the stable key:

- `upsertRunSummary(summary)` replaces an existing run with the same `runId`.
- New terminal runs are inserted at the front.
- After insertion, trim to the newest 100 summaries.

### Records API

Expose pure helpers:

```ts
loadRunHistory(backend?: Storage | null): RunHistoryV1
saveRunHistory(history: RunHistoryV1, backend?: Storage | null): void
upsertRunSummary(summary: RunSummaryV1, backend?: Storage | null): RunHistoryV1
clearRunHistory(backend?: Storage | null): void
computeRecords(history: RunHistoryV1): BrowserRecords
compareRunToRecords(summary: RunSummaryV1, recordsBeforeCurrent: BrowserRecords): RunRecordComparison
```

Compute comparisons against the history before adding the current run, then upsert
the summary. This lets the screen say "new record" honestly.

## Save-game interaction

The run telemetry must survive refresh before the run ends. Add `stats` to the
save-game snapshot.

Recommended shape:

```ts
interface SaveGameV2 {
  // existing SaveGameV1 fields
  stats: RunStatsV1;
}
```

Implementation options:

1. Bump the save version to V2 and discard old V1 saves. This matches the current
   save policy.
2. Add a tiny V1-to-V2 migration that builds a baseline `RunStatsV1` from the
   current snapshot. This preserves old in-progress saves but cannot recover
   missing timeline stats.

Option 1 is simpler and consistent with the existing persistence plan. Option 2 is
friendlier if there are active testers with long runs in progress.

Terminal summary creation should happen once, in the same engine path that flips
`gameOver` or `gameWon`, after the final UI/log state is updated. The summary can
be stored on UI state so `EndRunScreen.svelte` renders it without recomputing.

## Engine integration

Add a small stats module:

```
src/runStats.ts
```

Responsibilities:

- create a fresh `RunStatsV1`
- increment counters through named helpers
- build a final `RunSummaryV1`
- choose title and awards
- calculate score

Keep the engine readable by avoiding dozens of inline counter mutations. Good
call-site shape:

```ts
recordMonsterKilled(this.stats, monster, {
  floor: this.dungeonFloor,
  xpGained,
});
```

Likely engine call sites:

- `initGame()` creates fresh stats.
- `restore()` restores stats from the save.
- `handlePlayerMove()` records player steps and run-command steps.
- `search()` and `tryBumpSearch()` record search attempts.
- `revealSecretDoor()` records secrets.
- `travelStairs()` records ascents, descents, floor visits, and deepest floor.
- `executeStrike()` records outgoing damage and biggest hit.
- the monster AI damage check in `processTurn()` records incoming damage.
- `playerAttack()` records kills, boss kills, hero kills, XP gains, and death of
  named monsters.
- `checkItems()` records pickups, chests, gold, scroll effects, and gear rarity.
- `usePotion()` and `consumeFood()` record consumable use.
- terminal branches record `endedAt`, outcome, and death cause.

Death cause can start simple:

- starvation branch: `starvation`
- monster-damage branch: `monster`
- trap scroll branch, if it kills the player in the future: `trap_scroll`
- unknown fallback: `unknown`

If monster AI does not currently expose the attacking monster, record `monster`
without a specific `killedByMonsterId` in the first slice. Do not over-thread the
AI just for flavor text unless the change stays small.

## UI implementation

New files:

```
src/ui/components/EndRunScreen.svelte
src/ui/endRunView.ts
```

`endRunView.ts` should prepare display-ready sections from `RunSummaryV1`,
`BrowserRecords`, and comparison results. Keep the Svelte component mostly markup.

State additions in `src/ui/store.svelte.ts`:

```ts
endRunSummary: RunSummaryV1 | null;
endRunRecords: BrowserRecords | null;
endRunComparison: RunRecordComparison | null;
endRunHistory: RunSummaryV1[];
```

Actions:

```ts
copyEndRunSummary(): void
clearRunHistory(): void
```

The first version can skip copy-to-clipboard if it would distract from the core
screen. If included, use a real button and visible success/failure text.

### Keyboard behavior

Required keyboard parity:

- End screen opens with focus on `Restart`.
- `R` restarts from the end screen.
- `Escape` should do nothing destructive. It may move focus back to `Restart`, but
  it should not close the end screen and expose an ended game underneath.
- `Tab` moves through actions.
- Arrow left/right switches stat tabs or columns.
- Arrow up/down navigates history rows when the history tab is active.
- `Return` activates the focused action or selected history row.
- Clear history must require confirmation, with focus moved into the confirmation
  controls and restored after cancel.

Global movement shortcuts must remain inert while the end screen is active. The
existing `overlayOpen()` query can work if the end screen uses `role="dialog"`, or
the keyboard manager can get an explicit `end` context.

### Visual direction

Use the existing UI tokens and stage styling. The screen should feel like it
belongs to the current chrome:

- compact stat chips for headline numbers
- a larger outcome title only at the top
- record badges with restrained accent color
- tabular history for old runs
- no nested card walls
- no giant marketing-style hero section

Keep the dungeon canvas dimmed behind the screen so the final board still matters.

## Browser records

Initial records:

| Record | Applies to |
| --- | --- |
| Highest score | all completed runs |
| Deepest floor | all completed runs |
| Most gold collected | all completed runs |
| Most monsters killed | all completed runs |
| Most secrets found | all completed runs |
| Highest level | all completed runs |
| Longest survival by turns | all completed runs |
| Fastest victory by turns | victories only |
| Fastest victory by elapsed time | victories only |
| Fewest damage taken in a victory | victories only |
| First victory date | victories only |
| Total runs | all completed runs |
| Total victories | victories only |

Tie behavior:

- If the value equals the current record, show `tied record`.
- For "fastest" records, lower is better.
- For all other numeric records, higher is better.
- A first run sets records, but the UI should phrase it as "first recorded run"
  instead of flooding the screen with every possible "new record" badge.

## Privacy and controls

Everything is local to the browser.

Add a small footer line in the history tab:

> Saved in this browser only.

Add a clear-history action. Because this deletes local stats, require a confirm
step:

- First activation opens a compact confirmation row.
- `Return` on confirm clears `rogue_run_history`.
- `Escape` or Cancel aborts and restores focus.

Do not clear history when starting a new game. Do not tie history to the in-
progress save key.

## Implementation slices

### Slice 1: Data model and pure history store

- Add `src/runStats.ts`.
- Add `src/persistence/runHistory.ts`.
- Add unit tests for score calculation, awards, records, comparisons, storage
  fallback, upsert dedupe, and trimming to 100 runs.

Acceptance:

- Pure tests pass in the node Vitest environment with injected memory storage.
- A duplicate `runId` replaces the old summary instead of adding a second row.

### Slice 2: Engine telemetry

- Add `stats` to `GameEngine`.
- Increment counters at the call sites listed above.
- Include stats in snapshot/restore.
- Finalize a summary on death and victory.

Acceptance:

- Existing save/restore tests still pass after the save version decision.
- A seeded test run can kill a monster, pick up loot, travel stairs, save/restore,
  then finish with counters intact.
- Killing a boss-tagged non-final Marcus does not produce a victory summary.

### Slice 3: End screen UI

- Add `EndRunScreen.svelte` and render it from `App.svelte` or `CenterStage.svelte`.
- Replace the compact end card.
- Add records/history display.
- Wire restart, optional copy summary, and clear-history confirmation.

Acceptance:

- End screen appears for both death and victory.
- Restart works with `R`, focused button + `Return`, and pointer click.
- Movement keys do not move the ended game while the screen is up.
- History tab can be navigated with the keyboard.

### Slice 4: Polish and browser proof

- Tune title and award rules after a few real endings.
- Add visual QA for narrow and wide viewports.
- Confirm localStorage behavior across refresh:
  - refresh during a run preserves current telemetry
  - refresh on an ended run does not duplicate history
  - clearing history removes records but does not break restart

Acceptance:

- `npm run check` passes.
- Manual keyboard pass covers death screen, victory screen, history navigation,
  clear-history confirmation, and restart.

## Test plan

Unit tests:

- `runStats.test.ts`
  - creates default stats
  - records combat, loot, exploration, consumable, and stair counters
  - builds a summary with expected score
  - chooses deterministic titles and awards
- `runHistory.test.ts`
  - empty history loads as `{ runs: [] }`
  - corrupt JSON falls back safely
  - upsert dedupes by `runId`
  - history trims to newest 100
  - records handle first run, ties, higher-is-better, and lower-is-better
- `savegame.test.ts`
  - stats survive snapshot/restore
  - old or malformed stats fail safe according to the chosen save-version policy
- `engine.test.ts`
  - death finalizes once
  - victory finalizes once
  - non-final boss-tagged Marcus does not count as a win

UI/manual tests:

- End a run by death, then keyboard through every control.
- End a run by victory, confirm record badges and restart.
- Refresh on the end screen; history should still contain one summary for the
  same `runId`.
- Start a new run; previous records remain.
- Clear history; records disappear and the current ended run remains visible until
  restart unless the user clears while viewing history.

## Open decisions

1. Save-game version policy: discard old V1 saves or migrate them with incomplete
   stats.
2. Copy summary: ship in the first pass or leave it for a follow-up.
3. History size: 100 runs is recommended; 250 is still reasonable if we want a
   bigger local archive.
4. Score formula: the proposed formula is intentionally simple. We should adjust
   it after seeing real run distributions.
5. Death attribution: first pass can record broad causes; exact monster names may
   need a small AI event change.
