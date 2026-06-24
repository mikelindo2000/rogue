# Scroll Consistency and Drop Items Plan

## Status (2026-06-23): Shipped

Phases 1–3 are implemented, tested, and committed on `v2`; Phase 4 docs are
updated. Specifically:

- **Phase 1 — Scroll spawn tuning:** `SCROLL_TUNING` role/band table in
  `src/scrolls.ts`; `pickScrollForFloor` uses band weights; `src/scrolls.test.ts`
  asserts the table is exhaustive over `IMPLEMENTED_SCROLLS` and that risky+dud
  stay rare.
- **Phase 2 — Drop engine:** `GameEngine.dropInventoryRef()` plus floor-item
  conversion and equipped-index fix-ups; covered by `src/engine.test.ts`
  (food/potion/scroll/wand/gear, rejections, re-pickup, index preservation).
- **Phase 3 — Drop UI + keyboard:** `Drop` action on every carried cell, modal
  `d` mnemonic, routed through `performInventoryAction`. A new Svelte
  component-test harness (`src/ui/components/InventoryModal.test.ts`, happy-dom)
  exercises it.
- **Phase 4 — Follow-up docs:** `scrolls_overhaul_plan.md` status updated. Blank
  Paper use and `scare_monster` floor placement remain deliberately deferred (see
  B5 / Phase 4 below).

## Implementation Revisions (2026-06-23)

These notes reconcile the plan with the actual `v2` codebase before
implementation. Where the plan and the code disagreed, the code wins and the plan
text below is annotated by these revisions.

- **`InventoryAction` lives in `src/types.ts`** (line ~268), not a separate
  `actions` module. `'drop'` is added to that union. The UI view type
  `InventoryActionView` is in `src/ui/store.svelte.ts`; `GameUI.inventoryActions()`
  lives in `src/ui.ts` (not `GameUI.inventoryActions()` in a standalone file).
- **The spawn gate is `IMPLEMENTED_SCROLLS`**, a `ReadonlySet<ScrollType>` in
  `src/scrolls.ts`. The catalog defines more scrolls than are wired up
  (`protect_armor`, `remove_curse`, `identify`, `monster_confusion`,
  `scare_monster` are *defined but not implemented*). Spawn tuning therefore only
  needs roles/weights for the **implemented** scrolls; the role table is keyed to
  `IMPLEMENTED_SCROLLS`, and a test asserts that mapping is exhaustive over that
  set (not over all of `SCROLLS`).
- **Minimum floors already align** with the plan's intent: `sleep` minFloor 1,
  `create_monster` minFloor 3, `aggravate_monsters` minFloor 7, `blank_paper`
  minFloor 1, `enchant_weapon`/`enchant_armor` minFloor 7. Tuning keeps `minFloor`
  as the hard eligibility gate and adds floor-band weights on top.
- **Floor bands** for weighting: `early` = floors 1–6, `mid` = 7–12, `deep` = 13+.
  `pickScrollForFloor` selects the band weight for the current floor; `minFloor`
  still filters eligibility first. Concrete first-pass weights are in the table
  under A2 (Revised).
- **Engine drop guards** follow the existing wand/scroll conventions:
  `this.gameOver`, `this.gameWon`, `this.aiming` (transient wand-aim state), and
  `takeSleepTurn()` for the asleep case. There is no separate `asleep` flag —
  sleep is `trapEffects.sleepTurns` consumed via `takeSleepTurn()`.
- **Equipped gear is already excluded from the pack UI.** `inventoryActions()` /
  the cell builder in `src/ui.ts` skip equipped weapon/armor/shield indices, so a
  `Drop` action on a gear cell can never target equipped gear. No extra guard
  needed in the first slice (matches Non-Goals).
- **Floor-item visuals reuse `src/itemVisuals.ts`** (`potionVisual`,
  `scrollVisual`, `wandVisual`) — a pure data module the engine now imports — so a
  dropped item renders identically to a naturally-spawned one. Gear floor items
  carry `category` and use `)` (weapons) / `[` (armor) glyphs, matching `map.ts`.
- **Drop sound:** none. The audio manifest has no drop event and the plan forbids
  inventing one. Drop is log + visual only for now (B2 honored).
- **Modal behavior on success:** the modal stays open and refreshes after a drop,
  matching the existing Read/Use/Eat behavior (which also keep the modal open).
  This is a deliberate deviation from B4's "closes the modal after a successful
  drop" — staying open lets the player drop several items and gives immediate
  visual confirmation (count decrements / cell disappears). Rejected drops do not
  mutate state, spend a turn, or move focus.
- **Occupied-tile rejection is reachable:** normally `checkItems()` auto-picks the
  player's tile on arrival, but a full food backpack leaves food on the floor, so
  the player can stand on an item. The reject rule (B2) covers it.

## Purpose

Make the scroll line match the game that exists now.

Rogue: DungeonMaster has moved away from original Rogue's hidden-label
identification loop: carried scrolls are named, browsed in the inventory, and read
deliberately. That is good for a modern, keyboard-first web roguelike, but it
changes the role of blank and harmful scrolls. When the player can see "Blank
Paper" or "Scroll of Sleep" before reading, frequent dud/bad scrolls stop being a
risk-management puzzle and start feeling like pack clutter.

This plan has two linked parts:

- **Part A:** Rebalance scroll spawning so useful and situational scrolls dominate
  while blank/harmful scrolls remain rare spice instead of common filler.
- **Part B:** Add a player drop command so situational, dud, and future
  floor-tactical scrolls can stay in the game without trapping the player in
  inventory clutter.

## Patterns in Similar Roguelikes

The useful comparison is not "which scrolls exist?" but "why do bad or blank
scrolls make sense in that game's information model?"

| Game | Pattern | Design lesson for this game |
| --- | --- | --- |
| Original Rogue | Scrolls include utility, enchantment, identification, blank paper, and harmful effects such as Sleep, Create Monster, and Aggravate Monsters. The player usually learns by reading unidentified scrolls. See the [Rogue scroll list](https://rogue-1985.fandom.com/wiki/Scrolls). | Bad/dud scrolls work when the label is hidden. With visible labels, keep them rarer or give them a deliberate use. |
| NetHack | Scroll appearance is randomized, blank paper is a crafting substrate, blessed/uncursed/cursed state changes effects, and players infer identity from price, position, monster use, and careful test-reading. See [NetHack scrolls](https://nethackwiki.com/wiki/Scroll) and the [scroll spoiler notes](https://www.steelypips.org/nethack/331/scrl-331.html). | The "bad scroll" ecosystem is supported by several other systems: ID, BUC, writing, shops, monsters, altars. Do not copy the prevalence without those supports. |
| Dungeon Crawl Stone Soup | Scrolls are read with `r`; they include good and bad magical effects, and Scrolls of Identify are valuable because unknown consumables can be dangerous or wasteful. See the [DCSS manual](https://crawl.akrasiac.org/docs/crawl_manual.txt). | A modern UI can still keep scroll risk, but only if unidentified consumables exist. Without ID, the scroll line should be more strategic and less punitive. |
| Brogue | Scrolls connect deeply to equipment development and identification: enchantment, protection, remove curse, and identify shape long-term gear decisions; curses and use-ID give negative outcomes context. See the [Brogue README](https://github.com/gim913/Brogue/blob/master/Readme.md) and [identification notes](https://brogue.wiki/mw/index.php/Identification). | The strongest model for this project is "scrolls as intentional build/tactical tools," with rare curses/bad outcomes once the broader item system supports them. |

Recommendation: keep the current named-scroll, Nethack-ish/Rogue-family catalog,
but tune it as an **identified-scroll game**. Blank and harmful scrolls become
low-frequency tactical texture, not baseline scroll economy.

## Current State

Scrolls are already a first-class carried item line:

- `src/scrolls.ts` defines a typed `SCROLLS` registry and derives
  `SCROLL_POOL` from `minFloor`, `rarity`, and `IMPLEMENTED_SCROLLS`.
- `src/map.ts` picks scrolls with `pickScrollForFloor()`. Scrolls occupy a large
  share of the miscellaneous consumable roll: on floors before wands, the
  `scrollCut` plus leftover branch makes scrolls especially common; after wands,
  the leftover branch still produces more catalog scrolls.
- `src/engine.ts` no longer applies scroll effects on pickup. Scrolls are pushed
  into `player.inventory.scrolls` and read later.
- `src/main.ts` makes `r` open the scroll-focused inventory chooser instead of
  blindly reading the first scroll.
- `src/ui/components/InventoryModal.svelte` already scopes `r` and Return inside
  the modal, preserving keyboard-first reading.

The current catalog still includes:

- Visible harmful scrolls: `sleep`, `create_monster`, `aggravate_monsters`.
- Visible dud: `blank_paper`.
- Useful utility and build scrolls: `light`, `repair`, `magic_mapping`,
  `teleportation`, `hold_monster`, `food_detection`, `gold_detection`,
  `enchant_weapon`, `enchant_armor`.

There is no player drop command. Dropping exists only as monster loot
(`dropMonsterGold()`).

## Product Direction

### D1 - Identified Scrolls Are The Default For Now

Do not add a full unidentified-scroll system as part of this plan. It would be a
larger cross-item feature touching potions, wands, rings, inventory labels, save
data, and maybe run discovery.

Instead:

- Keep scroll names visible.
- Make the scroll economy feel fair under visible names.
- Leave the existing `identified?: boolean` style conventions on wands and
  earlier planning notes as the future ID-system seam.

### D2 - Bad/Dud Scrolls Stay, But Become Scarce

Bad and blank scrolls should not disappear entirely. They provide texture, comedy,
and future interactions. But they should spawn intentionally.

Initial tuning target:

- `blank_paper`: rare utility/dud, most common in shallow floors only if drop or
  scroll-writing exists; otherwise very rare.
- `sleep`: rare early danger, useful mostly as a reminder that reading magic is
  not always upside.
- `create_monster`: rare mid-floor risk with possible tactical uses later.
- `aggravate_monsters`: very rare deep danger.

The target is that a player with visible names sees bad/dud scrolls occasionally,
not as a normal share of their scroll inventory.

### D3 - Situational Scrolls Need A Way Out Of The Pack

Once dropping exists, situational scrolls can become more interesting:

- Blank Paper can be discarded now and later become a writing/crafting substrate.
- Scare Monster can use authentic floor-placement semantics in a future phase.
- Create Monster can be used or dumped depending on the player's appetite for
  risk.
- Extra copies of detection scrolls can be left behind when the floor has no
  relevant items.

Drop is not just a convenience command. It is the missing support system that
lets visible low-value items coexist with a deliberate inventory.

## Part A - Scroll Consistency Plan

### A1 - Separate Spawn Eligibility From Spawn Weight

Right now `SCROLL_POOL` is a flat derivation from registry rarity. Add explicit
spawn metadata to each `ScrollDefinition` or a parallel table:

```ts
export interface ScrollSpawnTuning {
  type: ScrollType;
  role: 'core' | 'situational' | 'risky' | 'dud';
  earlyWeight?: number;
  midWeight?: number;
  deepWeight?: number;
  maxFloor?: number;
}
```

Keep `minFloor` on the definition for baseline eligibility, but let weights be
intentional rather than derived only from rarity.

Suggested roles:

- `core`: Light, Repair, Magic Mapping, Teleportation, Hold Monster, Enchant
  Weapon, Enchant Armor.
- `situational`: Food Detection, Gold Detection.
- `risky`: Sleep, Create Monster, Aggravate Monsters.
- `dud`: Blank Paper.

### A2 - Tune Around Visible Identity

Recommended first pass:

| Type | Current registry rarity | Proposed role | Proposed relative weight |
| --- | --- | --- | --- |
| `light` | common | core | high early, medium later |
| `repair` | uncommon | core | medium all game |
| `magic_mapping` | uncommon | core | medium from floor 3 |
| `teleportation` | common | core | medium all game |
| `hold_monster` | uncommon | core | medium from floor 3 |
| `food_detection` | common | situational | low-medium, higher while hunger matters |
| `gold_detection` | common | situational | low |
| `enchant_weapon` | rare | core/build | low but meaningful from floor 7 |
| `enchant_armor` | rare | core/build | low but meaningful from floor 7 |
| `sleep` | common today | risky | very low |
| `create_monster` | uncommon | risky | very low |
| `aggravate_monsters` | uncommon | risky | ultra low/deep only |
| `blank_paper` | common today | dud | ultra low until it has a use |

#### A2 (Revised) - Concrete first-pass weights

Bands: `early` = floors 1–6, `mid` = 7–12, `deep` = 13+. `minFloor` gates
eligibility first; the band weight then sets the relative odds. Only implemented
scrolls appear (others stay defined but unspawned).

| Type | Role | minFloor | early | mid | deep |
| --- | --- | --- | --- | --- | --- |
| `light` | core | 1 | 20 | 10 | 8 |
| `teleportation` | core | 1 | 10 | 10 | 10 |
| `repair` | core | 1 | 8 | 8 | 8 |
| `magic_mapping` | core | 3 | 8 | 8 | 8 |
| `hold_monster` | core | 3 | 8 | 8 | 8 |
| `enchant_weapon` | core/build | 7 | — | 5 | 6 |
| `enchant_armor` | core/build | 7 | — | 5 | 6 |
| `food_detection` | situational | 3 | 5 | 4 | 3 |
| `gold_detection` | situational | 3 | 3 | 2 | 2 |
| `sleep` | risky | 1 | 1 | 1 | 1 |
| `create_monster` | risky | 3 | 1 | 1 | 1 |
| `aggravate_monsters` | risky | 7 | — | 1 | 1 |
| `blank_paper` | dud | 1 | 1 | 1 | 1 |

Sanity: on floor 1 the risky/dud share is `2/40 = 5%`; on floor 7 it is
`~4/64 ≈ 6%`. The test ceiling is "risky + dud combined stay well under ~15% of a
large seeded sample on every sampled floor," which is robust to small weight
tweaks.

Implementation detail: tests should assert bad/dud scrolls remain in the pool but
do not dominate deterministic sample runs. Avoid brittle exact distribution
checks; use broad thresholds over seeded samples.

### A3 - Reduce Scroll Volume If Needed

After per-type tuning, inspect whether scrolls still appear too often overall.
There are two knobs:

- Per-type weights in `SCROLL_POOL`.
- Overall consumable split in `BALANCE.map.spawn` (`goldCut`, `potionCut`,
  `scrollCut`, `wandCut`, and the fallback scroll branch).

Prefer per-type tuning first. If floors still feel scroll-heavy, reduce the
scroll slice and move some probability to potions, wands, or gold. Do not hide
the problem by increasing blank-paper rarity alone.

### A4 - Update The Existing Scroll Plan Status

`design/planning/scrolls_overhaul_plan.md` already says unimplemented scrolls are
gated out and lists Phase 3 dependencies. After this plan ships, update its
status section to reflect the new scroll-spawn philosophy:

- Identified names are the current design.
- Harmful/dud scrolls are intentionally rare while no ID system exists.
- Drop is the support feature for situational/floor-placement scrolls.

## Part B - Drop Items Plan

### B1 - Add A Floor Item Conversion Layer

The engine needs one canonical way to convert a carried inventory reference into
an `Item` at the player's tile:

```ts
type DropResult =
  | { ok: true; item: Item; message: string }
  | { ok: false; reason: string };
```

Use the existing `InventoryRef` union and remove exactly one unit from inventory:

- `food`: decrement `inventory.food`; floor item is `{ type: 'food', symbol: '%', ... }`.
- `potion`: remove one matching `PotionType`; floor item stores `data.potionType`.
- `scroll`: remove one matching `ScrollType`; floor item stores `data.scrollType`.
- `wand`: splice the referenced `WandItem`.
- `weapon`, `armor`, `shield`: splice the referenced gear item.

Do not allow dropping currently equipped gear in the first slice. The inventory
modal currently hides equipped gear anyway, so the UI can avoid presenting that
state. A later phase can support "unequip then drop" with curse checks.

### B2 - Placement Rules

Dropping should be explicit, predictable, and never destructive by accident.

Rules:

- Drop onto the player's current tile if it is walkable and no floor item already
  occupies that tile.
- If the tile has an item, either reject with a log message or place on a
  neighboring walkable empty tile. Recommended first slice: **reject**. It is
  simpler, readable, and prevents accidental item stacking rules from appearing.
- Disallow dropping on stairs only if item clutter makes stairs hard to read. The
  renderer already supports items on explored tiles; test visual readability
  before adding a special case.
- Dropping costs one turn, matching classic roguelike item manipulation.
- Dropping emits a log line and the normal item pickup/drop sound once a drop
  sound exists. Until then, keep it visual/log only; do not invent an audio event
  unless adding the event and asset manifest per the audio rules.

### B3 - Engine API

Add:

```ts
public dropInventoryRef(ref: InventoryRef): boolean
```

Responsibilities:

1. Refuse while asleep, game over, game won, or aiming.
2. Validate the referenced item still exists.
3. Refuse if the current tile already has an item.
4. Remove one inventory unit.
5. Push the converted `Item` into `this.items`.
6. Log `Dropped {item name}.`
7. Update UI and process a turn.

Keep naming helpers centralized:

- Scroll names: `scrollDisplayName(type)`.
- Potions: `Potion of ${titleCase(type)}` or reuse `potionLabel()`.
- Wands: existing `wand.name`.
- Gear: existing item name with rarity styling where possible.

### B4 - UI Actions

Extend:

```ts
export type InventoryAction = 'equip' | 'equipOffHand' | 'use' | 'zap' | 'drop';
```

Add a `Drop` action to every carried inventory cell that can be dropped. Keep the
primary action first:

- Food: `Eat`, `Drop`
- Potion: `Drink`, `Drop`
- Scroll: `Read`, `Drop`
- Wand: `Zap`, `Drop`
- Gear: equip actions, then `Drop`

Keyboard behavior:

- Keep global `d` as movement-right. Do **not** bind global `d` to drop while
  WASD movement is active.
- In the inventory modal, bind lowercase `d` to `Drop` for the selected item.
  This matches Rogue-style verbs without leaking into movement.
- Return still activates the first enabled action, so accidental Return on a
  scroll reads it, not drops it. Drop remains an explicit button or modal
  mnemonic.
- Arrow keys continue navigating rows/actions; focus returns predictably after a
  rejected drop and closes the modal after a successful drop.

Touch behavior:

- The inventory detail pane gets a visible `Drop` action button.
- No separate footer drop button in the first slice; dropping is item-specific
  and belongs in the pack.

### B5 - Future Floor-Tactical Scrolls

Once drop exists, implement Scare Monster with authentic-ish floor placement:

- Reading Scare Monster could convert the carried scroll into an armed floor ward
  on the player's tile instead of consuming it immediately.
- Dropping an unread Scare Monster could either arm it or place it inert; decide
  later. Original Rogue and NetHack differ enough that this deserves its own
  effect design.

Do not bundle Scare Monster with the generic drop slice. The drop command should
ship as simple inventory management first.

## Implementation Phases

### Phase 1 - Scroll Spawn Tuning

- Add explicit spawn tuning for scroll roles/weights in `src/scrolls.ts`.
- Keep every implemented scroll eligible somewhere, but dramatically lower
  `sleep`, `create_monster`, `aggravate_monsters`, and `blank_paper`.
- Add unit tests in `src/scrolls.test.ts` for:
  - role table covers every implemented scroll;
  - harmful/dud scrolls remain eligible;
  - broad seeded sampling shows harmful/dud scrolls below a sane ceiling.
- Run `npm run check`.

### Phase 2 - Drop Engine

- Add `dropInventoryRef()` and helper conversion functions in `src/engine.ts`.
- Extend `InventoryAction`.
- Add engine tests for dropping one food, one potion, one scroll, one wand, and
  one gear item.
- Add rejection tests for no matching inventory item and occupied current tile.
- Ensure dropped scrolls can be picked back up and preserve `scrollType`.

### Phase 3 - Drop UI and Keyboard

- Add `Drop` actions in `GameUI.inventoryActions()`.
- Route `actions.inventoryAction(ref, 'drop')` to `engine.dropInventoryRef(ref)`.
- Add modal keyboard support for `d`, scoped only to `InventoryModal.svelte`.
- Verify focus after rejected drop and modal close/update after successful drop.
- Add/extend UI tests if the current test harness covers modal keyboard behavior;
  otherwise add a concise manual verification note in the implementation PR.

### Phase 4 - Follow-Up Scroll Semantics

- Update `scrolls_overhaul_plan.md` status.
- Decide whether `blank_paper` gains a real use (future writing/crafting) or
  stays a rare joke item.
- Revisit `scare_monster` after generic drop is stable.
- Revisit full identification/curses only as a separate cross-item plan.

## Verification Checklist

- `npm run check`
- Scroll sampling tests show useful scrolls dominate.
- Keyboard:
  - `r` opens the scroll chooser.
  - Arrow keys move selection in the inventory modal.
  - Return activates the primary action.
  - Modal `d` drops the selected item.
  - Global `d` still moves right during gameplay.
  - No drop shortcut fires while aiming, settings, bestiary, or another overlay
    owns focus.
- Gameplay:
  - Dropping costs one turn.
  - Dropped items render on the map.
  - Dropped items can be picked back up.
  - Dropping a stack removes exactly one unit.
  - Rejected drops do not mutate inventory or spend a turn.

## Non-Goals

- Full unidentified scroll labels.
- Blessed/uncursed/cursed scroll state.
- Scroll writing.
- Monster scroll use.
- Stacking multiple floor items on one tile.
- Dropping equipped gear or cursed gear.
- New audio assets, unless the sound-event docs and manifest are updated in the
  same implementation slice.
