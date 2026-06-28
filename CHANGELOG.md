# Changelog

All notable changes to this project will be documented in this file.

## [2026-06-28]

### Added
- Added a planning audit for fast-moving subsystems, covering refactor
  candidates around the presentation split, turn/action choreography,
  ChromePresenter, AsciiCanvasRenderer, inventory identity, status timers,
  audio runtime coupling, and documentation drift.
- **Level-Up Experience**:
  - Added a golden "level-up bloom" — a warm vignette that flares in from the screen edges in three soft blinks when the player gains a level, the reward counterpart to the crimson boss-tension wash. Rendered as a DOM `stage-overlay` layer like the survival/boss washes, so it covers the whole board area (not just the map canvas).
  - Regenerated the level-up chime (`player-levelup`) with a brighter ascending-arpeggio prompt, and added `scripts/gen-progression-sfx.mjs` to reproducibly generate the player vitals & progression cues.
  - Added a dedicated Amulet-of-Ballard discovery stinger (`game.amuletFound` → `amulet-found`), generated via ElevenLabs.
  - Added a `Play level-up FX` Dev-tab action (and a `window.rogueLevelUpFx` helper) to replay the bloom + chime without grinding XP.

### Changed
- Narrowed the `GamePresenter` stats/inventory API so the engine publishes
  typed `publishStats` / `publishInventory` snapshots while the browser adapter
  preserves the existing `GameUI` forwarding behavior.
- Sound assets now **preload by default** after the audio context unlocks, so a newly added cue is ready on first play; only the bulk per-monster death cascade opts out (`preload: false`) to avoid eager-loading dozens of clips that may never play in a run.
- Documented the full-stage effect-rendering convention in `src/ui/visualEffects.ts` (with a redirect from the canvas renderer) so future screen-wide effects use the DOM `stage-overlay` layer rather than the map canvas, which clips to the tile rect.

### Fixed
- The Amulet of Ballard pickup played the level-up chime as a stand-in; it now has its own discovery stinger, distinct from the escape-victory fanfare.
- Removed debug wand seeding from `createPlayer()` (a rare Wand of Cold + epic Staff of Lightning that shipped at game start); the player again starts with no wands, fixing five wand tests.
- Kept the level-up bloom static under `prefers-reduced-motion`, and deferred fallback audio prewarming until after the first audio unlock so preload-by-default does not start eager audio work on page load.

## [2026-06-27]

### Added
- **Boss-Fight Intensity**:
  - Added boss-encounter FX that escalate with the fight: a crimson "dread" tension vignette and a slow map-plane sway whose strength ramps from a baseline up to a peak as the boss is worn down (with an extra enrage bump in the final quarter).
  - Added a boss health rail + name banner that slides in on engage, with `ENRAGED`/`FRENZIED` phase labels and a frame that pulses harder each phase.
  - Generated boss sound stingers via ElevenLabs (encounter, phase-change roar, defeat boom, and a dread heartbeat throb), layered over the existing boss music bed; added `scripts/gen-boss-sfx.mjs`.
  - Added a stateful `BossEncounterTracker` driving the cue lifecycle and phase jolts, with shared phase/intensity math in `src/boss.ts`.
  - Added `Spawn boss` / `Spawn frenzied boss` Dev-tab actions (and a `window.rogueSpawnBoss` helper) to exercise the FX without descending to floor 20.
- **Sound Debug Overlay & Dev Toggle**:
  - Introduced a floating, beautiful debug log overlay displaying the names of sound cues as they are played, themed to match the game's dark aesthetic.
  - Added a "Show sound debug overlay" toggle setting inside the Dev tab (third tab) of the dev panel (`Command-B`).
  - Implemented consecutive sound de-duplication with a visual multiplier badge, ensuring the badge text itself is not copied.
  - Automatically scrolls the sound log overlay to the newest message using Svelte 5 reactive effects.
- **Monster Abilities Framework & Integration**:
  - Implemented `bonusDamage` abilities adding a flat +N on-hit damage.
  - Implemented `silenceMagic` to seal player wand zaps.
  - Implemented `missChance` causing player attacks to occasionally whiff.
  - Implemented `weaponDebuff` to force player disarming.
  - Implemented `atkDebuff` and `armorDebuff` to temporarily reduce player attack/defense.
  - Implemented `fear` causing players to move randomly due to confusion.
  - Added a `stun` status effect and assigned it to Yeti, Michael, Gary, Cyclops, and Xelhua.
  - Backfilled Damage-over-Time (DoT) abilities via the per-monster `MONSTER_ABILITIES` map.
  - Added a player status-effect UI spine and integrated Brown Bat poison DoT.
  - Added DoT countdowns in the message log.
  - Added documentation and project skill guidelines for adding new monster abilities.
- **UI & HUD**:
  - Added rendering of monster abilities within the Bestiary compendium.
  - Created a planning document for splitting the GameUI and support for boss presentation modes.
  - Added immutable map snapshots for the engine-to-presenter render path.
  - Routed gameplay visual effects through typed presentation events while preserving the existing GameUI adapter behavior.
  - Added first-class presentation mode state and room-scoped map snapshots for future boss encounter framing.
  - Extracted the current ASCII canvas board into `AsciiCanvasRenderer` behind a `MapViewController`.
  - Extracted Svelte chrome projection into `ChromePresenter`, covering HUD stats, inventory/action views, logs, discovery, end-run state, and board-derived overlays.
  - Documented presentation ownership boundaries and tightened mapper, mode handoff, and renderer lifecycle test coverage.
- **Assets**:
  - Refined the asset readiness pipeline plan.
  - Added development-only asset readiness diagnostics and baseline readiness budgets.
  - Added a browser-only `AssetReadinessService` image queue with dedupe, priority promotion, bounded decoded-image caching, and stale prediction handling.
  - Warmed current and likely next floor stage backgrounds/chrome overlays through the asset readiness queue, with floor background swaps waiting up to 180 ms for decode before crossfading.
  - Warmed carried inventory/equipment art after HUD updates and promoted visible inventory modal art plus active combat portraits through the asset readiness queue.
  - Warmed only the selected opening end-run artwork as critical readiness, with a 220 ms fallback cap that preserves lazy monster-specific death variants.

### Changed
- **Developer Workflow**:
  - Added worktree bootstrap guardrails so new/dev worktree scripts validate the active `v3` project base and diagnose detached, root-commit, or wrong-base checkouts before serving.
  - Renamed the dev "Balance panel" to the **Debug panel** (`Command-B`); the balance reports stay as its Per-monster/Full-run tabs alongside the Dev tab. Documented in `AGENTS.md` that manual test/debug affordances belong here.
- **Boss HUD**:
  - The default nearby-monster tooltip now yields to the boss banner during a boss fight, so the two no longer overlap — the banner carries the same boss name and current/max HP in the boss style.
- **Dungeon View**:
  - Reverted the drop shadow effect on the map canvas.
- **Audio**:
  - Synchronized item pickup sounds with the player's movement during run mode by calculating run path velocities and scheduling sound playback with a matching delay.
  - Added support for delayed SoundEvents in `AudioService.emit` using faked/real timer scheduling.

### Fixed
- Fixed review findings in the effect-kinds layer.
- Kept rare-tier asset readiness requests lazy instead of scheduling them through the idle loader.
- Applied the initial reduced-motion preference before mounting the ASCII map renderer.
- Preserved the ASCII map renderer receiver when dispatching player-run and death-transition extras.
- Fixed CenterStage asset-readiness helper signatures so the Vite/Svelte build parser accepts them.
- Allowed worktree dev servers to start from feature branches created before the latest `v3` tip, while still warning that a rebase may be needed before merge.

---

## [2026-06-25]

### Added
- **Maze Enhancements**:
  - Added searchable maze details and content site analysis.
  - Added optional maze hazards to increase environmental complexity.
  - Added optional maze denizens (monsters specific to maze structures).
  - Added visible, discoverable maze caches.
- **HUD & UI**:
  - Re-architected the inventory grid to render the entire item pack (instead of capping at 20 items) and allowed the grid to scroll when it overflows the sidebar rail.

### Changed
- **Game Balance**:
  - Realigned the XP economy so that player level and maximum HP better track the depth descent.
  - Gated gear tiers by floor depth to prevent early-game issues (e.g., getting a Titan Maul too early and one-shotting mobs).
  - Addressed various balance findings from independent reviews.
- **Monster Mechanics**:
  - Enhanced the Nymph's item-stealing ability: stolen items are now recoverable, and the Nymph blinks away upon success.
- **Audio & Sound**:
  - Regenerated wand zap SFX to sound whooshier and more electric rather than metallic.
  - Added a fifth variant for combat hit rumbles.

### Fixed
- Increased map generation sweep test timeouts to prevent false test failures.

---

## [2026-06-24]

### Added
- **Scroll System Expansion**:
  - Created a scroll authoring guide for adding future scrolls.
  - Planned and implemented the Monster Detection scroll.
- **Audio & Sound**:
  - Added per-monster death sound effects and a distinct wand zap audio cue.
  - Added sound audit scripts to analyze coverage of game audio events.
- **Visuals & Transitions**:
  - Added a death transition adapter and a preview hook for test runs.
  - Triggered a fullscreen visual hunger overlay at the "Hungry" status threshold, incorporating a warning green/tint overlay.
  - Shown framed monster portraits in UI layouts during active combat encounters.

### Changed
- **Game Balance**:
  - Conducted full-run simulations and calibrated difficulty curves, executing a conservative midgame tuning pass.
- **UI & Layout**:
  - Updated the `--text-dimmer` CSS custom property to `#aa906b` for better legibility.
  - Expanded the third column and mobile inventory layout to fill the full modal width.
  - Improved inventory keyboard navigation: stabilized modal height on desktop, reset selection state on reopen, and added cyclic action navigation.
  - Isolated component body classes to resolve inventory sidebar layout regressions.

### Removed
- Removed the `FloorTransitionSwitcher` from the main `CenterStage` UI viewport.
