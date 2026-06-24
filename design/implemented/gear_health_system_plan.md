# Gear Health System Plan

## Current Situation

Rogue already has a partial armor-health model, but it is not yet a real
foundational system.

- `GearItem` has `def` and `maxDef` for armor and shields. Weapons only have
  `dmg`.
- Generated armor and shields set `maxDef = def` when they are created.
- Starter armor and the empty armor/shield placeholders also carry `maxDef`.
- Total player defense is calculated from current `def` values on equipped armor
  and equipped shields, plus the temporary Potion of Armor bonus.
- Repair scrolls restore every armor/shield item in the matching inventory arrays
  back to `maxDef`.
- Equipment and inventory text helpers already know how to display damaged armor
  as `DEF 2/4`, and inventory tooltips already include a `Durability` row.

The missing pieces:

- Nothing currently damages gear. `def` can be lower than `maxDef` in tests and
  display helpers, but normal gameplay does not create that state.
- There is no named domain model for "gear health." Today, `def` is both the
  mechanical defense stat and the only implied health counter.
- Repair scroll text says "All equipped armor repaired," but the code repairs all
  armor and shields in inventory, equipped or not.
- The equipment list does not surface health as a distinct visual signal. A
  damaged item can show `DEF current/max` only after damage exists, but there is
  no condition color, icon state, or severity language.
- Save-game validation only checks broad player shape. It preserves existing item
  fields, but it does not normalize or guard gear-health invariants.
- No tests cover degradation, breaking, repair semantics, or save/load behavior
  for damaged gear.

## Goals

- Establish gear health as a durable, explicit mechanic that can expand without
  rewriting item identity or save data later.
- Keep the first version simple enough to balance: armor and shields can wear
  down; weapons remain unaffected unless a future design explicitly adds weapon
  wear.
- Preserve Rogue-style clarity: the player should understand that gear absorbed
  damage, what degraded, and when repair matters.
- Keep current visual style: compact equipment rows, rarity color, display font,
  tabular number badges, and no large new panel.
- Maintain keyboard parity for every UI addition.

## Proposed Model

Add explicit health fields to defensive gear while keeping `def` as the effective
defense value for compatibility.

```ts
export interface GearHealth {
  current: number;
  max: number;
}

export interface GearItem {
  name: string;
  rarity?: Rarity;
  category?: string;
  color?: string;
  dmg?: number;
  type?: WeaponType;
  magic?: StaffMagic;
  def?: number;
  maxDef?: number;
  health?: GearHealth;
}
```

Compatibility rule:

- If a defensive item has `health`, effective defense is derived from it.
- If it only has `def/maxDef`, normalize it on load or item creation to
  `health: { current: def, max: maxDef ?? def }`.
- Keep `def/maxDef` for now as denormalized compatibility fields used by
  existing UI/combat helpers.
- New gear creation initializes all three: `def`, `maxDef`, and `health`.

Longer term, once all helpers use `health`, `def/maxDef` can be deprecated or
treated as cached display/effective-defense fields.

## Wear Rules

First implementation should degrade equipped defensive gear only when the player
takes monster damage.

Suggested v1:

- Only armor slots and shield can lose health.
- Roll degradation after monster AI resolves and only if HP actually decreased.
- Pick one equipped defensive item that contributed defense this turn.
- Chance scales with incoming damage after mitigation, not raw attack:
  `chance = clamp(0.15 + damageTaken * 0.08, 0.15, 0.65)`.
- If the roll succeeds, reduce that item by 1 gear health.
- If health reaches 0, its effective `def` becomes 0 but the item remains
  equipped. It is "broken," not destroyed.
- Empty `None` entries and items with max health 0 never degrade.

This keeps the mechanic understandable and prevents a single bad combat round
from shredding five items at once. It also creates a foundation for future
monster-specific wear, trap wear, cursed gear, smithing, or material traits.

## Repair Rules

- Repair scrolls should use one shared helper, not open-coded loops in item
  pickup.
- Decide the semantic before implementation:
  - Preferred v1: repair all carried defensive gear, because that is what the
    current code already does.
  - Update the log to match: "All armor and shields repaired."
- Repair should restore `health.current`, `def`, and `maxDef` consistently.
- Future repair variants can target equipped gear only, the most damaged item, or
  a single selected item from inventory.

## Engine Boundary

Create a small gear-health module, likely `src/gearHealth.ts`, so durability
logic does not spread through combat, UI, and item pickup.

Proposed helpers:

```ts
export function isDefensiveGear(item: GearItem | undefined): boolean;
export function normalizeGearHealth(item: GearItem): GearItem;
export function effectiveDefense(item: GearItem | undefined): number;
export function gearHealthRatio(item: GearItem | undefined): number | null;
export function gearHealthTone(item: GearItem | undefined): 'none' | 'good' | 'worn' | 'bad' | 'broken';
export function damageEquippedGear(player: Player, rng: RNG, amount: number): GearDamageResult | null;
export function repairGear(item: GearItem): boolean;
export function repairAllDefensiveGear(player: Player): number;
```

`getTotalDef` should use `effectiveDefense`. Gear generation, starter player
creation, save restore, and repair should all call normalization.

## UI Plan

Keep the equipment list's structure, but add one compact health signal.

Recommended v1 treatment:

- Keep rarity color on the item name and rarity dot.
- Use the equipment icon tile color for condition, not rarity, when an item is
  damaged:
  - full: current rarity color
  - worn: amber condition color
  - critical: danger/red condition color
  - broken: muted red/gray with a cracked or low-opacity icon treatment
- Add a tiny numeric health badge in the equipment row for damaged defensive
  gear only, such as `3/5` or `0/5`.
- Keep `statLabel` as the mechanical stat: `DEF 3/5` can remain for damaged
  armor, but the health badge makes the state visible even when the item name is
  long.
- Add condition to the equipment row `aria-label`, for example
  "Chest: Chainmail; Defense 3 of 5; worn; 2 items available to equip."
- Equipment popover options should include condition in `meta` for defensive
  gear, reusing the existing text pattern.
- Inventory cells/tooltips should continue showing `Durability current/max`; add
  the same health tone so item icons match equipment icons.

This respects the current style: small icon tiles, tabular badges, rarity accents,
and compact equipment rows. It also avoids adding a large meter to every row.

## Store Shape

Extend view models rather than making Svelte components infer item health.

```ts
export interface GearHealthView {
  label: string;      // "3/5"
  ratio: number;      // 0..1
  tone: 'good' | 'worn' | 'bad' | 'broken';
  color: string;      // token/var string
}

export interface EquipSlotView {
  // existing fields...
  health?: GearHealthView;
}

export interface InventoryCell {
  // existing fields...
  health?: GearHealthView;
}
```

The builders in `equipmentView.ts` and inventory-cell assembly should produce
these fields through one formatter/helper.

## Save And Migration

This probably does not need an immediate save version bump if `health` is
optional and existing `def/maxDef` are normalized on restore. A version bump is
only needed if we remove or reinterpret existing fields.

Restore path requirements:

- Existing saves with only `def/maxDef` keep working.
- Defensive gear with missing `maxDef` gets `maxDef = def`.
- `health.current` is clamped to `[0, health.max]`.
- `def` is synced to `health.current` after normalization.
- `maxDef` is synced to `health.max`.
- Broken items remain valid equipped items.

## Sound

No new sound events are required for the foundational implementation. If later
we add gear-break or repair cues, follow the sound system plan:

- Add typed `SoundEvent`s in `src/audio/events.ts`.
- Emit from the engine path.
- Add prompts and manifest entries in the sound asset guide.
- Do not call any audio-generation service from runtime code.

## Keyboard Requirements

Any visible gear-health details must preserve keyboard-first play.

- Equipment rows already open via focused button + Return; health indicators
  should be part of the focusable row's accessible label.
- Popover options should expose condition text in the same keyboard-navigable
  menu entries.
- Inventory modal/list should expose health text on focused items and preserve
  arrow-key navigation.
- No global shortcuts should be added for repair unless scoped to an active
  inventory/repair modal.

## Implementation Sequence

1. Add `src/gearHealth.ts` with normalization, effective-defense, tone, repair,
   and degradation helpers.
2. Normalize starter gear and generated gear.
3. Update `getTotalDef` to read effective defense through the helper.
4. Normalize loaded saves before the engine resumes gameplay.
5. Replace the repair-scroll loop with `repairAllDefensiveGear`, and align the
   log message with the actual behavior.
6. Add monster-damage-triggered degradation in `processTurn` after monster AI
   damage is recorded.
7. Add log feedback for meaningful degradation:
   - "Your Chainmail is worn. (3/5)"
   - "Your Buckler breaks!"
8. Extend equipment and inventory view models with `health`.
9. Render equipment-row icon condition color and a compact damaged-only badge.
10. Add tooltip/popover/accessibility text for condition.
11. Tune degradation chance after seeded combat tests and a few manual runs.

## Test Plan

Unit tests:

- Gear generation creates normalized health for armor and shields.
- `getTotalDef` uses current gear health/effective defense.
- Damage never selects empty `None` gear.
- Damage can reduce exactly one equipped defensive item by one point.
- Broken gear remains equipped and contributes zero defense.
- Repair restores current health and effective defense.
- Existing gear with only `def/maxDef` normalizes correctly.
- Save/load preserves damaged and broken gear.
- Equipment view emits `health` only for defensive gear with meaningful health.
- Equipment icon/badge tone changes at full, worn, critical, and broken states.

Manual/browser verification:

- Pick up and equip armor or shield.
- Fight until gear degrades.
- Confirm the message log still reports HP damage and gear wear separately.
- Confirm equipment row icon color changes and the damaged health badge appears.
- Open equipment popover from keyboard and verify options include condition.
- Open inventory from keyboard and verify tooltip/details include condition.
- Use a repair scroll and confirm all defensive gear display returns to full.

## Acceptance Criteria

- Gear health is represented by explicit helper APIs, not scattered `def/maxDef`
  arithmetic.
- Defensive gear can become worn or broken during real gameplay.
- Broken gear is understandable, repairable, persisted, and not an invalid equip
  state.
- Equipment and inventory surfaces show condition without changing the overall
  UI style.
- The mechanic has tests at the item, player/engine, save, and view-model layers.
- Keyboard users receive the same gear-health information as pointer users.

## Open Decisions

- Whether `def` should remain a cached effective defense forever or be replaced
  by `health.current` after a save-version bump.
- Whether shields should be more likely to degrade than armor when equipped.
- Whether high-rarity gear should get more health, lower wear chance, or both.
- Whether weapon health belongs in the same system later, or in a separate
  sharpness/charge mechanic.
- Whether repair scrolls should continue repairing all carried defensive gear or
  be narrowed to equipped gear for balance.
