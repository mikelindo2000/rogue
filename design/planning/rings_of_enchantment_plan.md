# Rings of Enchantment Plan

## Current Situation

Rogue: DungeonMaster has a rich equipment system but no accessory slots and no
rings of any kind.

- The player wears gear in fixed slots. `Equipped` (`src/types.ts:197`) is
  `{ mainHand: number; offHand: string } & Record<ArmorSlot, number>`, where
  `ARMOR_SLOTS = ['helm','chest','legs','gauntlets','boots']` (`src/types.ts:49`).
- `EquipSlot` (`src/types.ts:56`) is `'mainHand' | 'offHand' | ArmorSlot`. Equip
  routing flows through `EquipTarget` (`src/types.ts:192`), `InventoryRef`
  (`src/types.ts:182`), and the validation in `src/player.ts`
  (`equipTargetFromSlotValue`, `canEquip`, `equipValidated`,
  `inventoryRefToEquipTarget`).
- The `Inventory` type (`src/types.ts:174`) holds `food`, `weapons`, `potions`,
  `scrolls`, and one gear array per `GearSlot`. There is no `rings` array.
- Hunger is a single per-turn drain. `consumeFood`/movement reduce
  `player.hunger`; `BALANCE.player` exposes `hungerMax` (800) and the
  Fatigued/Hungry label thresholds. There is no per-item food upkeep anywhere.
- Defense is summed in `getTotalDef` (`src/player.ts:44`) from equipped armor and
  shield plus the temporary Potion of Armor bonus (`BALANCE.status.armorDefBonus`).
- The only attack stat is `player.baseAtk` plus the temporary
  `BALANCE.combat.strengthBonus` from Potion of Strength. **There is no Strength
  attribute** in this game.
- `player.regenTurns` drives passive healing; dart traps set
  `trapEffects.strengthDrained` (`src/types.ts:168`); gear wears down via the gear
  health system (`src/gearHealth.ts`); secret doors and traps are revealed by an
  explicit search command; monster wake/sleep is modeled by the AI runtime
  `state: 'asleep' | 'hunting' | 'fleeing'` (`src/types.ts:136`).

The missing pieces: there is no ring item, no left/right accessory slots, no
food-upkeep mechanic, no aggregation point where "always-on" passive bonuses are
collected, and no identification or curse system (everything spawns identified).

## Goals

- Add **two ring slots — left hand and right hand** — at full mechanical parity
  with the original Rogue ring catalog, mapping each classic ring onto a real
  system already present in this codebase (or flagging the gap explicitly).
- Reproduce Rogue's defining ring tension: **rings are powerful but cost food
  upkeep** per turn while worn, so wearing two strong rings burns rations faster.
- Build the data model and aggregation layer so new rings, rarity scaling, +n
  enchantment, identification, and curses can be added later **without** rewriting
  item identity or save data.
- Preserve the project's conventions: compact equipment rows, rarity color,
  keyboard parity for every UI action, and save-game validation/migration.

## Design Decisions To Settle First

Two genuine product choices block a clean parity implementation. Both have a
recommended default below; the rest of the plan assumes the recommendation.

### D1 — How to model "Add Strength" (no Strength stat exists)

Original Rogue's Ring of Add Strength raises the Strength attribute, which feeds
both to-hit and damage and carrying capacity. This game has no Strength stat.

- **Option A (recommended): treat Add Strength as a flat attack + to-hit bonus.**
  Fold `enchant` into the attack roll (alongside `baseAtk`) and the hit bonus
  (alongside `BALANCE.combat.playerHitBonus`). No new stat, no save changes, ships
  in Phase 2. The flavor ("you feel stronger") still lands. Sustain Strength then
  guards the dart-trap `strengthDrained` counter (which already exists).
- **Option B: introduce a real `player.strength` attribute.** Truer to Rogue, but
  it is a separate, larger feature touching combat formulas, the HUD, leveling,
  hunger ("Weak"), and saves. It should be its own plan, not bundled here.

Recommendation: **Option A** now; leave a `// TODO: real STR stat` seam so Option
B can supersede it later without changing the ring catalog.

### D2 — Identification and curses

Rogue rings spawn unidentified and some are cursed (cannot be removed). This game
spawns everything identified and has no curse/equip-lock system. Building ID +
curses is a cross-cutting feature (it would also serve potions, scrolls, wands).

Recommendation: **ship rings fully identified and uncursed first** (Phases 1–3),
then add identification (reusing the `discovery.ts` meta-progression pattern) and
curses as Phase 4. The data model below reserves `cursed?: boolean` and an
`identified` concept so the later phase is additive. The two "trap" rings
(Aggravate Monster, Teleportation) are only interesting once curses exist, so they
land in Phase 4.

## Proposed Model

### Types (`src/types.ts`)

```ts
/** The two ring slots — left and right hand, per original Rogue. */
export const RING_SLOTS = ['leftRing', 'rightRing'] as const;
export type RingSlot = typeof RING_SLOTS[number];

export type RingType =
  | 'add_strength'      // +atk / +to-hit          (see D1)
  | 'protection'        // +def
  | 'increase_damage'   // +weapon damage
  | 'dexterity'         // +to-hit
  | 'regeneration'      // faster regen, high food upkeep
  | 'slow_digestion'    // negative food upkeep (slows hunger)
  | 'searching'         // auto-search adjacent tiles each turn
  | 'stealth'           // monsters do not wake from proximity
  | 'sustain_strength'  // blocks dart-trap strength drain
  | 'maintain_armor'    // blocks gear-health wear on equipped armor
  | 'see_invisible'     // reveals invisible monsters (see gap note)
  | 'adornment'         // no effect (bait / vendor trash)
  | 'aggravate_monster' // CURSED: wakes monsters            (Phase 4)
  | 'teleportation';    // CURSED: random teleport each turn (Phase 4)

export interface RingItem {
  name: string;
  ringType: RingType;
  rarity?: Rarity;
  color?: string;
  /** +n for scalable rings (protection, add_strength, increase_damage,
   *  dexterity). Undefined / 0 for binary rings. Rarity multiplier and floor
   *  scaling feed this, mirroring generateGearItem. */
  enchant?: number;
  /** Reserved for Phase 4. Cursed rings cannot be removed without a remedy. */
  cursed?: boolean;
}
```

Extend the shared unions and records:

```ts
export type EquipSlot = 'mainHand' | 'offHand' | ArmorSlot | RingSlot;

export type Inventory = {
  food: number;
  weapons: GearItem[];
  potions: PotionType[];
  scrolls: ScrollType[];
  rings: RingItem[];            // NEW
} & Record<GearSlot, GearItem[]>;

export type Equipped = {
  mainHand: number;
  offHand: string;
} & Record<ArmorSlot, number>
  & Record<RingSlot, number>;   // -1 (or a sentinel) = empty

export type InventoryRef =
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }
  | { kind: 'scroll'; scrollType: ScrollType }
  | { kind: 'weapon'; index: number }
  | { kind: 'armor'; slot: ArmorSlot; index: number }
  | { kind: 'shield'; index: number }
  | { kind: 'ring'; index: number };          // NEW

export type EquipTarget =
  | { slot: 'mainHand'; index: number }
  | { slot: 'offHand'; value: string }
  | { slot: ArmorSlot; index: number }
  | { slot: RingSlot; index: number };         // NEW
```

**Empty-slot convention.** Armor uses index `0` pointing at a `"None"` gear stub.
Rings have no natural index-0 stub, so use `-1` for "no ring worn" and guard every
read. (Alternatively keep the index-0-stub convention for consistency with armor —
decide in Phase 1; `-1` is recommended because it avoids polluting the `rings`
array with placeholder entries and reads cleanly in the aggregator.)

### Effect aggregation (`src/player.ts` or a new `src/rings.ts`)

All "always-on" ring effects funnel through one aggregator so combat, hunger,
defense, and AI each read a single derived object instead of poking at slots.

```ts
export interface RingEffects {
  atkBonus: number;        // add_strength + increase_damage (see D1)
  hitBonus: number;        // add_strength + dexterity
  defBonus: number;        // protection
  hungerUpkeep: number;    // sum of per-ring upkeep, minus slow_digestion
  regenBoost: number;      // regeneration: turns shaved off regenTurns
  autoSearch: boolean;     // searching
  stealth: boolean;        // stealth
  sustainStrength: boolean;// sustain_strength
  maintainArmor: boolean;  // maintain_armor
  seeInvisible: boolean;   // see_invisible
  aggravate: boolean;      // CURSED
  teleporting: boolean;    // CURSED
}

export function getRingEffects(player: Player): RingEffects { /* sum L + R */ }
```

Wiring per ring (each cites the real hook):

| Ring | Hook | Notes |
|---|---|---|
| Add Strength | combat attack + `playerHitBonus` | `enchant` scaled; see D1 |
| Protection | `getTotalDef` (`player.ts:44`) | add `effects.defBonus` |
| Increase Damage | combat attack roll | `enchant` to damage |
| Dexterity | `BALANCE.combat.playerHitBonus` path | `enchant` to-hit |
| Regeneration | `player.regenTurns` cadence | faster heal, big upkeep |
| Slow Digestion | per-turn hunger drain | negative upkeep |
| Searching | engine turn loop → existing search routine | auto-search adjacent each turn |
| Stealth | monster AI wake check (`aggroRange`, `asleep`) | suppress proximity wake |
| Sustain Strength | `trapEffects.strengthDrained` (dart trap) | block/clear drain |
| Maintain Armor | `gearHealth` wear roll (`BALANCE.gearHealth`) | skip wear when worn |
| See Invisible | monster render/visibility | **gap — see below** |
| Adornment | none | parity bait item |
| Aggravate Monster | monster wake-all (cursed) | Phase 4 |
| Teleportation | random teleport (cursed) | Phase 4, reuse teleport-trap move |

### Food upkeep — the core ring tension

Today hunger drains a flat 1/turn. Rings change this to:

```
drainPerTurn = 1 + clamp(getRingEffects(player).hungerUpkeep, min: 0)
```

Add a `BALANCE.rings` block, e.g.:

```ts
rings: {
  upkeep: {                 // hunger points/turn while worn
    default: 1,             // most rings
    regeneration: 3,        // the glutton
    slow_digestion: -2,     // net effect can reduce total drain below 1
    adornment: 0,
    aggravate_monster: 0,
    teleportation: 0,
  },
  minDrainPerTurn: 0,       // Slow Digestion can fully offset one other ring
}
```

This reproduces Rogue's resource pressure: two upkeep rings roughly triple hunger
loss; Slow Digestion is the enabler that makes a second ring sustainable.

### Generation & loot

Add a ring branch alongside `generateGearItem` (`src/items.ts`). Define a
`RING_POOL` in config (parallel to `GEAR_POOL`) listing each `RingType` with a base
name, base `enchant`, and color. The rarity multiplier and floor scaling feed
`enchant` exactly as `gearDmgFloorScale`/`gearDefFloorScale` feed weapon/armor
bonuses today. Add a new floor `Item` variant:

```ts
| (ItemBase & { type: 'ring'; data: RingItem })
```

and handle it in the pickup switch (`engine.ts` ~line 958) by pushing into
`inventory.rings` and logging `Picked up a Ring of <Name>`.

### Identification gap & See Invisible gap

- **See Invisible** has nothing to reveal: no monster is invisible today (only the
  *player* can turn invisible via potion). Ship the ring as a no-op that records
  intent, and make it meaningful once invisible monsters or a Phantom/Apparition
  invisibility trait exists (the bestiary already has an "Apperation"). Note this
  in the ring's tooltip so it does not read as a bug.
- **Identification** is deferred to Phase 4 (D2).

## UI & Keyboard Parity

- **CharacterCard** (`src/ui/components/CharacterCard.svelte`): add two ring slots
  rendered as a left-hand / right-hand pair, matching the existing equip-slot
  visual language (rarity color, stat label like `+2 DEF` or `Regen`).
- **EquipSlot / InventoryModal**: add a "Rings" inventory section; clicking a ring
  puts it on an open hand (or prompts for which hand if both are full).
- **Keyboard parity**: bind put-on / take-off. Original Rogue uses `P` (put on
  ring) and `R` (remove ring); `R` currently is not the read-scroll key (`r` reads
  scrolls — `engine.ts:1104` `readScroll`). Recommend `P` to put on and a
  remove affordance via the inventory modal + a `T` (take off) binding to avoid
  colliding with lowercase `r`. Confirm against `src/keyboard.ts` bindings.
- Tooltips: show effect, `enchant`, and **food upkeep** prominently (upkeep is the
  decision the player is really making).
- Stat surfacing: the HUD/equipment view should reflect ring-derived `+def`/`+atk`
  so the player sees rings counted, reusing `equipmentStats`/`inventoryStats`.

## Persistence (`src/persistence/savegame.ts`)

- Bump `VERSION` (currently `2`). **Coordinate with the wands/staves and
  potion-dipping plans** — all three add to `InventoryRef`/`Equipped`/`Inventory`
  and bump the version. If shipped together, do a single combined bump; otherwise
  sequence them and document each delta.
- Validate the new shape: `raw.player.inventory.rings` is an array of objects with
  a known `ringType`; `equipped.leftRing`/`equipped.rightRing` are integers (`-1`
  or a valid index). Reject corrupt/unknown ring types the way typed scrolls are
  guarded (`savegame.ts:159`).
- **Migration**: older saves lack `rings`. In `restore()` default
  `inventory.rings = []` and `equipped.leftRing = equipped.rightRing = -1`. Add a
  `normalizeRings(player)` helper (mirroring `normalizeAllGearHealth`,
  `savegame.ts:207`) so loaded data always satisfies invariants.

## Phased Rollout

**Phase 1 — Slots & plumbing (no effects yet).** Types, `-1` empty convention,
`createPlayer` defaults, equip/unequip both hands through
`canEquip`/`equipValidated`/`inventoryRefToEquipTarget`, `RING_POOL` + floor
spawn + pickup, CharacterCard slots, savegame bump + migration + tests. Rings are
inert but wearable. Ship this first; it de-risks the whole feature.

**Phase 2 — Stat rings (always-on numeric).** `getRingEffects` aggregator +
food-upkeep drain. Wire Protection (`getTotalDef`), Increase Damage, Add Strength
(D1), Dexterity, Slow Digestion, Regeneration, Adornment. These are pure math and
need no new subsystems.

**Phase 3 — Behavioral rings.** Searching (auto-search hook), Stealth (AI wake
suppression), Sustain Strength (dart-trap drain block), Maintain Armor
(gear-health wear skip). Each depends on a system that already exists; verify the
hook points before wiring.

**Phase 4 — Identification & curses (expansion).** Add unidentified rings
(discovery-pattern ID), cursed rings + equip-lock + a remove-curse remedy, then
enable Aggravate Monster and Teleportation. See Invisible becomes live if/when
invisible monsters exist.

## Testing Strategy

Follow the repo's colocated `*.test.ts` style:

- **`rings.test.ts`** — `getRingEffects` aggregation (left+right sum, empty slots,
  Slow Digestion offsetting upkeep to `minDrainPerTurn`), enchant scaling by
  rarity/floor.
- **`player.test.ts`** — equip/unequip on each hand, both hands full prompt,
  cannot equip a non-ring into a ring slot, `inventoryRefToEquipTarget` for rings.
- **engine tests** — hunger drain reflects upkeep; Protection raises
  `getTotalDef`; Sustain Strength blocks a dart trap; Maintain Armor skips a wear
  roll; Searching reveals an adjacent secret door/trap.
- **`savegame.test.ts`** — round-trip with rings; migration of a v2 save (no
  rings) defaults cleanly; corrupt/unknown ring type rejected.

## Open Questions / Decisions

1. **D1**: flat atk/hit bonus for Add Strength (recommended) vs. a real Strength
   stat (separate plan)?
2. **D2**: ship identified+uncursed first (recommended) vs. build ID/curses up
   front?
3. Empty-slot sentinel: `-1` (recommended) vs. index-0 stub for consistency with
   armor?
4. Take-off keybinding to avoid colliding with `r` (read scroll) — `T`?
5. How aggressive should food upkeep be? (Tune so two upkeep rings are painful but
   Slow Digestion makes a curated pair viable.)
6. Should rings ever drop pre-identified at high rarity, or always go through ID
   once that system exists?
