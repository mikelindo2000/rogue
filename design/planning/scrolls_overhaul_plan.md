# Scrolls Overhaul Plan

## Implementation Status (2026-06-23)

The core of this plan has shipped on `v2` across five commits. Status by area:

**Done & tested (501 tests green, independently reviewed):**

- Full original-Rogue `ScrollType` catalog (18 types) with a data-driven registry
  (`src/scrolls.ts`: `ScrollDefinition`, weighted floor-gated spawn pool,
  `pickScrollForFloor`, `scrollDisplayName`).
- Per-type compact icons (`src/ui/icons.ts`) and visual identities
  (`SCROLL_VISUALS`).
- No scroll applies its effect on pickup — all are carried and read on demand.
- The legacy anonymous random-effect scroll and the separate `repair_scroll` item
  are retired; spawning uses the typed catalog picker.
- Phase 1 effects (live): Light, Repair, Magic Mapping, Teleportation, Sleep,
  Hold Monster, Create Monster, Aggravate Monsters, Food/Gold Detection, Blank
  Paper — with the registry's no-op-keeps-scroll rules.
- Phase 2 (partial): Enchant Weapon and Enchant Armor (act on the equipped item;
  no picker yet).
- Save migration v3→v4: legacy `repair_scroll`/anonymous scroll floor items
  migrate on load (top-level and per-floor); carried-scroll inventory is validated
  and backfilled.
- `r` (and the mobile footer Read button) open a scroll-focused chooser instead of
  blindly reading scroll #0; scrolls are readable in-modal via `r`/Enter; footer
  Read button shows an icon + count. `item.consume` carries an optional
  `scrollType` audio discriminator.
- Run-stats scroll counts derive from the registry.

**Deferred (clearly scoped follow-ups):**

- **Inventory filter strip** (segmented type buttons, search, tier/floor-band
  filters). The chooser currently opens the existing modal pre-selected to the
  first scroll; the full shared filter system is still to build (and should be
  shared with rings/wands/dipping per the README cross-cutting notes).
- **Phase 2 remainder** — Protect Armor (needs a gear-protection flag + save
  normalization), Identify and Remove Curse (need the shared identification and
  curse systems; explicitly a shared prerequisite in the README).
- **Phase 3** — Monster Confusion (needs `pendingConfuseHit` + confused-movement
  AI) and Scare Monster (needs a fear timer / drop-and-stand semantics + a drop
  command). Both flagged here as "new player/AI state".
- **Generated full inventory PNG art** under `public/inventory/scroll-of-*.png`
  (produced offline per the asset recipe; only `scroll-of-light.png` exists today,
  others fall back to the compact icon).
- **Per-effect audio assets** — the event discriminator is wired; the clips are
  not yet authored.

Unimplemented effects are gated out of the spawn pool (`IMPLEMENTED_SCROLLS` in
`src/scrolls.ts`), so the player never finds a scroll that does nothing; flip a
type on there as its effect lands.

### Update (2026-06-23): scroll-spawn philosophy + drop support

The follow-on **Scroll Consistency and Drop Items** plan
(`scroll_consistency_and_drop_items_plan.md`) has shipped. It re-frames how this
overhaul's catalog is *spawned* now that scroll names are visible:

- **Identified names are the current design.** There is no unidentified-scroll /
  BUC / curse system yet; the scroll line is tuned to feel fair under visible
  names rather than as a hidden-label identification puzzle.
- **Harmful/dud scrolls are intentionally rare.** Spawn weighting moved from a
  flat rarity derivation to an explicit per-role, per-floor-band table
  (`SCROLL_TUNING` in `src/scrolls.ts`). `sleep`, `create_monster`,
  `aggravate_monsters`, and `blank_paper` stay eligible but are kept to a small
  share of spawns (tests hold risky+dud under ~15% of seeded samples per band).
- **Drop is the support feature** that lets visible low-value and situational
  scrolls coexist with a deliberate pack: `engine.dropInventoryRef()` plus a
  `Drop` inventory action and a modal `d` mnemonic. This unblocks the Phase 3
  `scare_monster` floor-placement design (still deferred) and a future
  `blank_paper` writing/crafting use.

## Purpose

Make scrolls behave like real Rogue scrolls: objects found in the dungeon, carried
in the pack, browsed deliberately, and read when the player chooses. This is not
just adding more effects. It is a full overhaul of the scroll item line, the
inventory browser, visual assets, and keyboard flow.

The intended player experience:

- Pick up scrolls and keep them in inventory instead of triggering anonymous
  magic immediately on pickup.
- Open inventory, filter to scrolls, inspect the scroll art and effect text, and
  read a chosen scroll.
- Press `r` during play to enter a scroll-focused chooser instead of consuming
  the first carried scroll.
- Use arrow keys, Return, Escape, and Rogue-style mnemonic verbs for every scroll
  action.
- On touch/mobile, reach every scroll action through the footer control panel and
  in-modal buttons, never a keyboard-only path.

## Source Notes

The target catalog is based on common Rogue scroll lists, especially John
Harris's Game Developer essay appendix and the Rogue Wiki scroll table. Rogue
variants differ, so this plan treats `vorpalize_weapon`, `genocide`, and exact
Scare Monster semantics as optional/version-specific expansions rather than
hard first-slice requirements.

## Current State

The code already has a useful first slice:

- `Inventory.scrolls: ScrollType[]` exists, but `ScrollType` is currently only
  `'light'` (`src/types.ts`).
- `InventoryRef` already supports `{ kind: 'scroll'; scrollType: ScrollType }`.
- Typed floor scrolls with `data.scrollType` are picked up into inventory and
  read on demand.
- `useScroll(index)` consumes a typed scroll only after a successful effect. A
  Scroll of Light in a lit room or corridor is kept and costs no turn.
- The inventory modal already shows scroll cells, uses `scrollVisual(type)`, and
  resolves full art through `scrollArtUrl(type)`.
- `public/inventory/scroll-of-light.png` exists.

Several systems this plan referenced as "future" have since shipped on `v2` and
must now be treated as live integration points, not assumptions:

- **Wands & staves are implemented** (`src/wands.ts`, `WandType` with 13 types,
  effect resolution in `engine.ts`). This is significant: the engine already has
  a directional targeting/aim subsystem (`z` to draw, direction keys to aim, `x`
  to cancel, `isBeamWand()`/`isSelfTargetWand()`), per-effect sounds keyed by
  `wandType`, and a shared `lightCurrentRoom()` used by both the Light wand and
  the Light scroll. Scrolls must reuse these seams, not fork new ones.
- **Gear health is implemented** (`src/gearHealth.ts`, `GearHealth { current, max }`,
  `repairAllDefensiveGear()`). Repair scroll and Protect Armor build on this.
- **Mobile/touch controls shipped** (`src/ui/components/Footer.svelte`): a d-pad
  plus quick-action buttons (Search, Run, Pack, Bestiary, Eat, Potion, and a plain
  "Read" button that currently calls `actions.readScroll()` and reads the first
  scroll). The Potion/Eat buttons establish the icon-plus-count affordance pattern.
- **A keyboard quaff shortcut shipped** (commit `d59b0dd`). Scroll reading should
  mirror potion quaff's mnemonic/flow conventions where they overlap.
- **Rings and potion-dipping remain planned only** (no code yet); keep them as
  forward references.

The old behavior still coexists with that model:

- A floor item `{ type: 'scroll' }` without `data.scrollType` triggers a random
  effect on pickup: vigor, fatigue, midas, or trap damage.
- `repair_scroll` is a separate floor item that repairs gear on pickup instead of
  being carried/read.
- `readScroll()` reads the first carried scroll, which breaks down as soon as
  multiple scroll types exist.
- Inventory has a flat list but no filter state, categories, level/floor filters,
  or scroll-focused browsing mode.

## Goals

1. Store every scroll in inventory and read it only by explicit command.
2. Replace anonymous pickup-triggered scroll effects with named scroll items.
3. Promote repair scrolls into the same carried/read scroll catalog.
4. Add compact line icons for each scroll type and generated full inventory art
   under `public/inventory/`.
5. Add inventory filtering by item type, usability, rarity/power tier, floor or
   level band, and search text.
6. Make `r` open a scroll-focused chooser with keyboard-first navigation and
   scoped shortcuts.
7. Keep every scroll effect additive to visual/log feedback; scrolls must never
   be the only way the player understands what happened.
8. Preserve save compatibility with existing in-progress runs.

## Non-Goals

- Full identification/curses in the first implementation slice. The data model
  should reserve room for them, but the current game still spawns identified
  items.
- Runtime image generation. Art is produced offline and committed as local files.
- A second inventory implementation just for scrolls. Scroll browsing should be a
  focused mode of the inventory system, not a forked UI.
- Monster-readable scrolls. That can come later after player scroll behavior is
  stable.

## Design Decisions

### D1 - One Scroll Catalog

Unify all scrolls under a single typed catalog:

```ts
export type ScrollType =
  | 'light'
  | 'repair'
  | 'magic_mapping'
  | 'teleportation'
  | 'hold_monster'
  | 'sleep'
  | 'create_monster'
  | 'aggravate_monsters'
  | 'enchant_weapon'
  | 'enchant_armor'
  | 'protect_armor'
  | 'remove_curse'
  | 'identify'
  | 'food_detection'
  | 'gold_detection'
  | 'monster_confusion'
  | 'scare_monster'
  | 'blank_paper';
```

This is a Rogue-family catalog, with `light` kept because this game already uses
dark rooms and has working Scroll of Light behavior. Some versions of Rogue vary
around `vorpalize_weapon`, `genocide`, and detection scrolls; treat those as
expansion entries after the core catalog lands.

#### Catalog parity check vs original Rogue

The core catalog has **full original-Rogue scroll parity**. Mapping to the
canonical Rogue 5.4 list:

| Original Rogue scroll | This catalog | Notes |
| --- | --- | --- |
| Scroll of light | `light` | Canonical Rogue scroll; lights current room |
| Magic mapping | `magic_mapping` | |
| Hold monster | `hold_monster` | |
| Sleep | `sleep` | Puts the *player* to sleep — a bad scroll, as in Rogue |
| Enchant armor | `enchant_armor` | |
| Enchant weapon | `enchant_weapon` | |
| Protect armor | `protect_armor` | Rogue protects vs rust; here vs gear-health wear |
| Identify (its variants) | `identify` | Unified, modern single-scroll form |
| Scare monster | `scare_monster` | Drop-and-stand is the authentic effect (Phase 3) |
| Teleportation | `teleportation` | |
| Create monster | `create_monster` | |
| Remove curse | `remove_curse` | Needs a curse system (deferred) |
| Aggravate monsters | `aggravate_monsters` | |
| Monster confusion | `monster_confusion` | Confuse-on-next-touch, as in Rogue |
| Blank paper | `blank_paper` | The "fizzle" scroll |
| Vorpalize weapon (5.4) | `vorpalize_weapon` | Phase 3 / optional |

**House additions beyond original Rogue** (kept deliberately, framed as
Rogue-family rather than canonical): `repair` (mirrors this game's gear-health
system), `food_detection`, and `gold_detection` (Rogue has no detection scrolls —
detection there is via potions). `genocide` is a NetHack-ism offered only as a
late, deliberately-enabled expansion. Document these as house scrolls so the
catalog's provenance stays honest.

### D2 - No More Anonymous Scrolls

Retire the legacy `{ type: 'scroll' }` random branch in `GameEngine.checkItems()`.
Every floor scroll should have `data.scrollType`, and every scroll pickup should:

1. Push the type into `player.inventory.scrolls`.
2. Log the pickup.
3. Emit the normal item pickup sound.
4. Update inventory UI.
5. Spend no extra turn beyond movement, matching normal pickup behavior.

The old random effects should not disappear accidentally. Choose one of these
paths during implementation:

- Preferred: replace them with Rogue-like named effects in the catalog.
  `fatigue` maps naturally to `sleep`; `trap` maps to `create_monster` or a
  later trap scroll; `midas` can be retired in favor of `gold_detection`;
  `vigor` can be retired or held as a non-Rogue house scroll.
- Compatibility option: add explicit house scrolls such as `vigor` and `midas`
  as named, carried scrolls. Do this only if we want to preserve those effects as
  part of this game's identity.

### D3 - Repair Is A Scroll Type

Remove the separate `repair_scroll` item kind after migration. Represent it as:

```ts
{ type: 'scroll', symbol: '?', color: scrollVisual('repair').mapColor, data: { scrollType: 'repair' } }
```

The effect should call the existing `repairAllDefensiveGear(player)` helper and
consume the scroll only if it repairs at least one item. If nothing is damaged,
the scroll is kept and no turn passes, matching Scroll of Light's no-op rule.

### D4 - Effects Are Data-Driven

Move effect metadata out of scattered UI conditionals and into a scroll registry:

```ts
export interface ScrollDefinition {
  type: ScrollType;
  name: string;
  summary: string;
  detail: string;
  minFloor: number;
  rarity: Rarity;
  harmful?: boolean;
  needsTarget?: 'inventory-item' | 'direction' | 'none';
  noOpKeepsScroll: boolean;
}

export const SCROLLS: Record<ScrollType, ScrollDefinition> = { ... };
```

Use the registry for:

- Spawn weighting and floor gating.
- Inventory labels/details/tooltips.
- End-run inventory summaries.
- Full art prompt tables.
- Future identification names.

Keep effect execution in the engine or in a small `src/scrolls.ts` helper so it
can safely mutate map, player, monsters, stats, sounds, and UI.

### D5 - Share Effect Helpers With Wands

Several scroll effects already exist as wand effects in `src/wands.ts` /
`engine.ts`. Do not reimplement them — extract a shared helper and call it from
both paths so behavior, logs, and sounds stay consistent:

| Scroll | Existing wand-side seam to reuse |
| --- | --- |
| Light | `lightCurrentRoom()` — already shared with Wand of Light |
| Sleep | wand `sleep` effect / `trapEffects.sleepTurns` + `takeSleepTurn()` |
| Hold Monster | wand-style `monster.frozenTurns` application |
| Teleportation | `teleportPlayerSafely()` (player) vs wand `teleport_away` (monster) |
| Create Monster | monster spawn helpers used by wand `polymorph`/spawn paths |

The scroll versions differ in scope (a scroll usually affects the player or an
area; a wand affects a beam/target), so the shared helper should take a target
parameter rather than assuming one. Where a scroll genuinely needs directional
targeting (rare in Rogue, but e.g. a future variant), reuse the wand aim loop and
its cancel semantics instead of building a parallel one.

## Scroll Effect Plan

Ship effects in phases so the overhaul is useful before every classic corner is
implemented.

### Phase 1 Effects - Use Existing Systems

| Scroll | Effect | Current seams |
| --- | --- | --- |
| Light | Permanently lights current dark room; no-op keeps scroll | `lightCurrentRoom()` |
| Repair | Repairs carried armor/shields; no-op keeps scroll | `repairAllDefensiveGear()` |
| Magic Mapping | Reveals explored map or all room/corridor tiles for the floor | `map`, `explored`, FOV redraw |
| Teleportation | Teleports player to a safe tile | `teleportPlayerSafely()` |
| Sleep | Puts player to sleep for N turns | `trapEffects.sleepTurns` / `takeSleepTurn()` |
| Hold Monster | Freezes nearby or room monsters | `monster.frozenTurns` |
| Create Monster | Spawns a valid monster adjacent to player if space exists | monster spawn helpers |
| Aggravate Monsters | Wakes/hunts all monsters | monster AI runtime state |
| Food Detection | Marks/reveals food items on current floor | `items`, overlay/log highlight |
| Gold Detection | Marks/reveals gold items on current floor | `items`, overlay/log highlight |

### Phase 2 Effects - Gear And Item Targeting

| Scroll | Effect | Required support |
| --- | --- | --- |
| Enchant Weapon | Adds +1 or health/power to selected equipped/carried weapon | item target picker |
| Enchant Armor | Adds +1 max/current defense or restores selected armor | item target picker |
| Protect Armor | Prevents next gear-health wear on selected armor | gear health metadata |
| Identify | Identifies selected item | shared identification system |
| Remove Curse | Removes curse from selected/equipped item | curse system |

For Phase 2, add a reusable item-target picker instead of one-off scroll modals.
It should be able to filter to weapons, armor, wands, rings, or all carried
items, because the same picker will serve future identify/cursing work.

Identify scope: because **wands already exist in the game** (and rings/potions are
either present or imminent), Scroll of Identify must be designed to identify *any*
item category — weapons, armor, shields, potions, scrolls, wands, and later rings —
not just gear. Build it against the same shared identification system the wands and
potions will consume, so it never needs a per-category rewrite. Until that system
lands, identify can be a Phase 2 placeholder that no-ops on already-identified items
(everything currently spawns identified), keeping the scroll in the pool without a
turn cost.

Enchant Weapon/Enchant Armor divergence note: original Rogue enchants the
currently wielded/worn item with no choice. This plan's target picker is a
deliberate modernization; default the picker's selection to the equipped item so
keyboard/touch users can confirm in one action and the Rogue muscle-memory still
works.

### Phase 3 Effects - Special Rogue Behaviors

| Scroll | Effect | Notes |
| --- | --- | --- |
| Monster Confusion | Next melee hit confuses a monster | needs `player.pendingConfuseHit` and AI confusion behavior |
| Scare Monster | Best Rogue behavior is drop-and-stand; reading can prime a ward | needs dropped-item/ward semantics |
| Blank Paper | Does nothing; consumes or keeps based on final UX call | useful for identification economy |
| Vorpalize Weapon | Optional version-specific expansion | needs weapon attunement and monster categories |
| Genocide | Optional version-specific expansion | high balance risk; late-game only |

## Data Model Changes

### `src/types.ts`

- Expand `ScrollType` to the full catalog.
- Add optional scroll metadata for future identification:

```ts
export interface ScrollItem {
  scrollType: ScrollType;
  identified?: boolean;
  readCount?: number;
}
```

There are two viable storage options:

1. Keep `Inventory.scrolls: ScrollType[]` for now. This preserves stack behavior
   and minimizes save churn, but it cannot store per-scroll identification later.
2. Move to `Inventory.scrolls: ScrollItem[]`. This is the cleaner full-overhaul
   model because identify/curses/random labels become additive fields.

Recommendation: move to `ScrollItem[]` in the overhaul and migrate old
`ScrollType[]` saves by wrapping each entry as `{ scrollType, identified: true }`.
The UI can still group identical identified scrolls into one cell.

### `Item`

Remove `repair_scroll` after migration and require typed scroll data for all new
scroll floor items:

```ts
| (ItemBase & { type: 'scroll'; data: ScrollItem })
```

During save restore, tolerate legacy floor items:

- `type: 'repair_scroll'` becomes typed repair scroll.
- `type: 'scroll'` without data becomes a random typed scroll from the new spawn
  table, or is rejected if strict migration is preferred.

### `InventoryRef`

Current `{ kind: 'scroll'; scrollType: ScrollType }` is enough for stacked,
identified scrolls. If `ScrollItem[]` lands now, add an index-capable ref:

```ts
| { kind: 'scroll'; scrollType: ScrollType; index?: number }
```

Use `scrollType` for grouped actions and `index` only when an unidentified or
per-instance item needs exact targeting.

### Save Version

`src/persistence/savegame.ts` currently backfills old `inventory.scrolls`. Bump
the save version and add:

- Validation that every scroll has a known `scrollType`.
- Migration from `ScrollType[]` to `ScrollItem[]`.
- Migration of `repair_scroll` floor items to typed repair scrolls.
- Migration of old anonymous floor scrolls.
- Backfill of any new player status fields such as `pendingConfuseHit`.

Coordinate the version bump with rings, wands, traps, or gear-health work if
multiple plans ship together.

## Spawn And Balance

### Spawn Table

Replace `lightScrollCut` and the anonymous scroll/repair split with a weighted
catalog picker:

```ts
export interface ScrollSpawnEntry {
  type: ScrollType;
  minFloor: number;
  maxFloor?: number;
  weight: number;
}
```

Suggested starting distribution:

- Floors 1-2: light, teleportation, sleep, blank paper, repair at low weight.
- Floors 3-6: light, magic mapping, food/gold detection, hold monster, create
  monster.
- Floors 7-12: enchant weapon, enchant armor, aggravate monsters, monster
  confusion.
- Floors 13+: protect armor, identify/remove curse placeholders if the supporting
  systems exist, rare vorpalize/genocide only if deliberately enabled.

Keep harmful scrolls in the pool. Rogue scrolls are not all good. The important
change is that risk happens when the player chooses to read, not when they step
on the item.

### No-Op Rules

For each scroll, define whether a no-op consumes the scroll:

- Keep scroll and spend no turn when the player could not reasonably know the
  effect would fail: light in a lit room, repair with no damaged gear, mapping on
  a fully mapped floor.
- Consume and spend a turn when the scroll's purpose is fulfilled even if the
  result is weak: teleport that lands nearby, detection with no matching items,
  hold monster with no nearby monsters.
- Harmful scrolls generally consume and spend a turn.

## Inventory Filtering

The current modal should become a reusable inventory browser with a filter strip
and optional focused entry mode.

### State

Add to `UIState`:

```ts
export type InventoryFilterKind =
  | 'all'
  | 'food'
  | 'potion'
  | 'scroll'
  | 'wand'
  | 'weapon'
  | 'armor'
  | 'shield';

export interface InventoryFilters {
  kind: InventoryFilterKind;
  usability: 'all' | 'usable-now' | 'blocked';
  tier: 'all' | Rarity;
  floorBand: 'all' | 'early' | 'mid' | 'late';
  query: string;
}
```

If rings ship before this work, include `'ring'`.

### View Model

Extend `InventoryCell` with metadata the UI should not infer from labels:

```ts
kind: InventoryFilterKind;
tier: Rarity | 'common';
minFloor?: number;
levelLabel?: string;
usableNow: boolean;
blockedReason?: string;
sortGroup: number;
```

For "level" filtering:

- Scrolls/wands use `minFloor` from their definition.
- Gear can use rarity plus the floor band that generated it if we add
  `originFloor`; until then, expose rarity/tier only.
- Potions can use a simple `minFloor` from their definition, even if all are
  currently floor 1.

### UI

Add a compact filter strip at the top of `InventoryModal.svelte`:

- Segmented type buttons: All, Gear, Potions, Scrolls, Wands, Food.
- Secondary compact controls: Usable, Tier, Level/Floor.
- Text search field, only when the modal has enough width.

Keyboard behavior:

- `/` focuses search.
- `[` and `]` cycle item-type filters.
- `0` or `A` returns to All.
- `s` switches to Scrolls only when the inventory modal is active. This must not
  leak to movement.
- Arrow keys move within the filtered result list.
- Return activates the default action for the selected item.
- Escape closes search first, then the modal.

Binding reconciliation (these are already taken on `v2`, confirm in
`src/keyboard.ts` before assigning anything new):

- `r` reads scrolls (global) — repurposed here to open the chooser.
- `q` quaffs potions (a quaff shortcut shipped in `d59b0dd`).
- `z` draws/zaps a wand and `x` cancels wand aiming. **Do not reuse `z` or `x`**
  for scroll actions, in or out of the modal.
- For any scroll that opens a nested picker (item-target in Phase 2, or a
  directional aim if ever needed), use Escape to back out — and also accept the
  wand subsystem's existing cancel key so cancel behavior is uniform across
  zap/read. Reuse the wand aim loop rather than adding a second cancel convention.

The right-rail HUD should remain a compact pack preview. It may respect the
current modal filter only while the modal is open, but the default HUD should
continue to show the highest-signal carried items rather than a filtered subset.

## Scroll Browsing And Reading

### Global `r`

Change `readScroll()` from "read first scroll" to "open scroll chooser":

- If no scrolls: log "You have no scrolls to read."
- If exactly one readable scroll and no other overlay is open: either open the
  chooser preselected or read directly. Recommendation: open the chooser for
  consistency and to avoid accidental reads once harmful scrolls exist.
- If multiple scrolls: open inventory with `filters.kind = 'scroll'` and select
  the first scroll.

Add a separate engine method for deliberate reads:

```ts
readScrollRef(ref: InventoryRef & { kind: 'scroll' }): boolean;
```

Keep `useInventoryItem(ref)` routing to the same helper.

### Modal Shortcuts

When inventory is open and the selected item is a scroll:

- Return: read selected scroll.
- `r`: read selected scroll.
- Arrow Up/Down: move selection in filtered list.
- Arrow Left/Right: move between list and action buttons.
- `[` / `]`: cycle filters.
- `i` or Escape: close inventory.

When an item-targeting scroll is selected:

1. Return or `r` opens the target picker.
2. Target picker has its own scoped shortcuts.
3. Escape returns to the scroll detail without spending a turn.
4. Return confirms the focused target.

Do not let `r` restart the game from inside the scroll modal. Restart remains a
game-over/game-won shortcut only in gameplay context.

### Focus Rules

- Opening from `i` selects the previously selected item if it still matches the
  active filter; otherwise the first visible item.
- Opening from `r` selects the first scroll.
- Changing filters selects the first visible item in the new result set.
- After reading a scroll, if the modal stays open, preserve the scroll filter and
  move to the next scroll. If no scrolls remain, show the empty scroll-filter
  state and keep focus on the filter strip.
- Closing restores focus to the canvas or the control that opened the modal.

## Mobile And Touch Parity

`v2` shipped a touch control layer (`src/ui/components/Footer.svelte`): a d-pad
plus quick-action buttons (Search, Run, Pack, Bestiary, Eat, Potion, Read). Every
scroll affordance described above must have an equivalent touch path, because the
plan's current keyboard-only flow would strand mobile players the moment a second
scroll type exists.

### Footer "Read" Button

The footer currently has a plain `Read` button calling `actions.readScroll()`,
which reads the first scroll. Re-point it at the new chooser flow:

- Disabled/hidden when the player carries no scrolls.
- Show an icon-plus-count badge matching the Potion and Eat buttons rather than a
  bare text label, so scrolls read as a first-class carried line.
- Tapping it opens the scroll-focused inventory mode (same entry point as global
  `r`), not an immediate read.

### Touch Inside The Modal

- The filter strip's segmented buttons are tappable; selection state must be
  visible without hover.
- Each scroll cell is tappable to select; the detail pane's primary action button
  ("Read") is a large touch target.
- The Phase 2 item-target picker needs an explicit on-screen **Confirm** and
  **Cancel/Back** button — Escape has no touch equivalent. Reuse the wand aim
  overlay's existing on-screen cancel control so targeting feels identical between
  zapping a wand and reading a targeted scroll.
- Reading a scroll, cycling filters, and closing the modal must all be reachable
  with taps only, end to end.

### Verification

Add mobile-width browser smoke (the project already gates on a narrow viewport)
covering: open scrolls from the footer Read button, select a non-first scroll,
read it, run a Phase 2 targeted scroll through tap-confirm, and confirm the
target picker cancels by tap.

## Audio And Sound Design

Today every scroll read emits the generic `{ type: 'item.consume'; kind: 'scroll' }`
event (`src/audio/events.ts`), while **wands already carry per-type sound cues
keyed by `wandType`**. Scrolls should reach the same fidelity so an effect is
audible, not just logged — consistent with Goal 7 (effects must never be the only
channel the player learns what happened).

- Keep `item.pickup`/`item.consume` for the base read.
- Add an effect-keyed scroll cue, mirroring the wand model — either extend the
  consume event with a `scrollType`/effect discriminator or add a dedicated
  `scroll.effect` event. Map distinctive effects to distinct cues: teleport
  whoosh, sleep/hold low drone, aggravate alarm horn, create-monster snarl,
  magic-mapping shimmer, enchant chime, blank-paper dud fizzle.
- No-op reads (Light in a lit room, Repair with no damage) should play a short
  "nothing happens" cue rather than the success cue, since the scroll is kept and
  no turn passes — the audio is the player's only signal that the read was a no-op.

## Scroll Compendium (Optional Discovery Parity)

The game already has a **Bestiary** (footer button + monster discovery tracking in
`src/discovery.ts`, with `unknown`/`seen`/`defeated` tiers persisted to
`localStorage`). A parallel scroll/item compendium is a natural parity feature and
the same place a future identification system and `genocide` would surface:

- Track per-scroll-type discovery (`unknown` until first read/identified) using the
  `src/discovery.ts` pattern, persisted alongside monster discovery.
- A compendium view can reuse the inventory art and `ScrollDefinition` summary/detail
  text, gating full effect text behind first read once identification exists.
- This is explicitly optional for the first slice but should be designed so the
  `ScrollDefinition` registry and art are the single source of truth for both the
  inventory modal and the compendium.

## Visual Asset Plan

### Compact Icons

Extend `src/itemVisuals.ts`:

- Add every `ScrollType` to `SCROLL_TYPES`.
- Add `SCROLL_VISUALS` entries with `icon`, `mapColor`, `uiColor`, and `accent`.

Extend `src/ui/icons.ts`:

- Keep the shared rolled-parchment body.
- Add a distinct emblem per scroll type.
- Use symbols, not text or letters: map grid for mapping, wing/spiral for
  teleportation, chain/hand for hold monster, crescent for sleep, claw/face for
  create monster, horn/waves for aggravate, sword glow, armor glow, shield ward,
  eye/tag for identify, bread/coin pings for detection, blank parchment for
  blank paper.

### Full Generated Images

Update `design/implemented/inventory_image_generation.md` with scroll prompt rows
before generating. Keep the established convention:

```text
public/inventory/scroll-of-<type-slug>.png
```

Use the existing prompt template and 512x512 PNG recipe. Recommended seed block:

- Scroll of Light: existing seed 8500, already generated.
- New scrolls: reserve seeds 8520-8537 in catalog order.

Suggested subject hints:

| Item | Subject |
| --- | --- |
| Scroll of Repair | aged parchment scroll with a silver anvil and mending rune, tiny sparks stitching a cracked shield |
| Scroll of Magic Mapping | unfurled parchment with glowing dungeon corridors and room outlines drawn in blue ink |
| Scroll of Teleportation | parchment twisting around a violet portal spiral, edges lifting in impossible wind |
| Scroll of Hold Monster | parchment bound by spectral chains around a clawed shadow silhouette |
| Scroll of Sleep | parchment with a pale crescent moon rune shedding soft blue sleep mist |
| Scroll of Create Monster | torn parchment with a red summoning circle and emerging clawed silhouette |
| Scroll of Aggravate Monsters | parchment marked with a black horn rune radiating angry red sound waves |
| Scroll of Enchant Weapon | parchment wrapped around a glowing blue sword rune |
| Scroll of Enchant Armor | parchment wrapped around a faintly glowing breastplate rune |
| Scroll of Protect Armor | parchment with a shield rune under a golden warding dome |
| Scroll of Remove Curse | parchment with broken black chains dissolving into white sparks |
| Scroll of Identify | parchment with a bright eye rune and small revealed item silhouettes |
| Scroll of Food Detection | parchment with warm amber bread-and-herb runes pulsing outward |
| Scroll of Gold Detection | parchment with coin sigils glowing through dungeon dust |
| Scroll of Monster Confusion | parchment with a crimson hand rune and spiraling disorientation marks |
| Scroll of Scare Monster | parchment with a laughing mask rune casting long frightened shadows |
| Blank Paper | plain aged blank parchment scroll, no markings, muted beige-gray accent |

Do not add generated images without checking they actually render in the inventory
modal at desktop and mobile widths.

## Engine Implementation Plan

1. Add the scroll definition registry and expand `ScrollType`.
2. Convert `repair_scroll` to `scrollType: 'repair'`.
3. Replace the anonymous random pickup branch with typed scroll spawning.
4. Add `readScrollRef()` and change global `r` to open a scroll-focused inventory
   mode.
5. Move existing Light and Repair logic into the new scroll dispatcher.
6. Add Phase 1 effect implementations and logs.
7. Add filter metadata to `InventoryCell` and filter state to `UIState`.
8. Implement filtered inventory rendering and keyboard shortcuts.
9. Add icons and generated art entries.
10. Update save validation/migration.
11. Update run stats so scroll counts use the expanded catalog and distinguish
    pickup/read/effect where useful. Migrate the legacy `scrollsTriggered` keys
    (`vigor`/`fatigue`/`midas`/`read:light`) to a consistent `read:<scrollType>`
    scheme so the end-run summary groups by the new catalog.
12. Extract shared effect helpers (light, sleep, hold/freeze, teleport, create
    monster) so scroll and wand paths call the same code (D5).
13. Re-point the footer `Read` button at the chooser flow and give it an
    icon-plus-count badge; ensure the Phase 2 target picker has on-screen
    confirm/cancel controls reused from the wand aim overlay.
14. Add effect-keyed scroll audio cues, including a no-op cue.

## Testing And Verification

Unit tests:

- Typed scroll pickup appends to inventory and does not trigger the effect.
- Legacy anonymous scrolls no longer spawn in new maps.
- Legacy `repair_scroll` save items migrate to typed repair scrolls.
- Reading each Phase 1 scroll consumes exactly one scroll when it should.
- No-op Light/Repair/Mapping keeps the scroll and spends no turn.
- Harmful scrolls consume and spend a turn.
- `readScrollRef` rejects stale refs safely and logs a message.
- Spawn picker respects min-floor gates.
- Save validation rejects unknown scroll types.
- Run stats summarize expanded scroll inventories and migrate legacy
  `scrollsTriggered` keys to the `read:<scrollType>` scheme.
- Shared effect helpers (D5) produce identical results whether invoked by a scroll
  or the equivalent wand.

UI/check tests:

- `npm run check`.
- Open inventory with `i`, cycle filters with keyboard, verify selection stays
  visible and focus does not leak.
- Press `r` during gameplay; inventory opens filtered to scrolls.
- Read a selected scroll with Return and with `r`.
- Verify Escape closes nested target picker before closing inventory.
- Verify right-rail scroll icons, counts, and full inventory art render.
- Browser smoke on desktop and mobile widths for long scroll names and empty
  filtered states.

Keyboard-only smoke:

1. Pick up at least two scroll types.
2. Press `r`.
3. Arrow to a non-first scroll.
4. Press Return to read it.
5. Confirm only that scroll type count decreases.
6. Press `i`, switch back to All, then to Scrolls with keyboard only.
7. Close with Escape and confirm movement keys work again.
8. Confirm `z`/`x` still drive the wand (zap/cancel) and are not intercepted by
   scroll handling in any context.

Touch-only smoke (mobile width):

1. Footer `Read` button is hidden/disabled with no scrolls, then shows an
   icon-plus-count badge after pickup.
2. Tap `Read` → scroll-focused inventory opens (does not auto-read).
3. Tap a non-first scroll, tap the detail-pane Read button, confirm the count
   drops.
4. Run a Phase 2 targeted scroll: tap to open the picker, confirm with the
   on-screen Confirm button, then repeat and cancel with the on-screen Cancel.
5. Cycle filters by tapping segmented buttons; close the modal by tap.

Audio smoke:

1. A successful read plays its effect-keyed cue.
2. A no-op read (Light in a lit room, Repair with no damage) plays the no-op cue
   and the scroll is retained with no turn spent.

## Acceptance Criteria

- No new floor scroll applies its effect on pickup.
- Every scroll in the spawn pool can be carried, inspected, and read from
  inventory.
- `r` opens a scroll chooser instead of blindly reading the first scroll.
- Inventory filtering supports scroll browsing and remains useful for other item
  types.
- All scroll UI controls are keyboard accessible with visible focus.
- Every scroll UI action is also reachable by touch via the footer and in-modal
  buttons, including the Phase 2 target picker's confirm/cancel.
- Every scroll type has a compact icon, a visual identity entry, and generated
  full inventory art.
- Shared effects behave identically whether triggered by a scroll or the matching
  wand, and shipped wand keys (`z`/`x`) are unaffected.
- Each scroll read produces an effect-appropriate sound cue, with a distinct no-op
  cue for retained scrolls.
- Save migration preserves old runs without corrupting inventory.
- Tests cover engine effects, save migration, inventory filtering, keyboard
  behavior, touch behavior, and audio cues.

## Open Questions

1. Should the legacy vigor/midas scroll effects survive as named house scrolls,
   or should the overhaul replace them with Rogue-family effects?
2. Should a single carried scroll be read directly by `r`, or should `r` always
   open the chooser? This plan recommends always opening the chooser.
3. Should unidentified scrolls arrive in this overhaul or be a separate shared
   identification plan for scrolls, potions, rings, and wands?
4. Should Scare Monster use the original dropped-scroll behavior? If yes, the
   inventory work should later add a general drop command — with both a keyboard
   binding and a touch affordance — before implementing it.
5. Should scroll audio extend the existing `item.consume` event with an effect
   discriminator, or add a dedicated `scroll.effect` event? (Wands took the
   per-type-event route; matching that keeps the audio layer uniform.)
6. Should the optional Scroll Compendium ship in this overhaul alongside the
   Bestiary, or wait for the shared identification plan that gives it real
   `unknown` → identified state to display?
