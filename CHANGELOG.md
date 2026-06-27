# Changelog

All notable changes to this project will be documented in this file.

## [2026-06-27]

### Added
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
- **Assets**:
  - Refined the asset readiness pipeline plan.

### Fixed
- Fixed review findings in the effect-kinds layer.

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
