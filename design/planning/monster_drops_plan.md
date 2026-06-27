# Monster Drops Layer — mob-specific loot on kill

Adds the GM sheet's **"Drop chance when killed (items specific to mobs)"** column as **data**:
a per-monster drop table that spawns a floor item when the monster dies. Mirrors the abilities
layer's philosophy — a `MONSTER_DROPS` table + one engine hook + a description path, so a drop is
data, not bespoke code.

## Constraint & balance note

The abilities layer was strictly balance-neutral (effects sit outside the harness). **Drops are
different — they add player power** (gear/consumables). They are *not* modeled by the balance
harness, so there's no automated guard. To keep this from inflating progression:
- Drops are **chance-based** (the sheet column is literally "drop *chance*"). Default rates are
  conservative; the magnitudes/rates are **playtest knobs**, flagged in-code.
- Dropped gear is **bounded by the existing item tiers** (`GEAR_POOL` / `generateGearItem`), so a
  drop is never stronger than loot the floor already produces — it's a *themed, more reliable*
  source, not a power escalation.
- `MONSTER_DATABASE` (hp/atk/minFloor) stays frozen. This layer only adds the drop table + the
  death-time spawn.

If the user wants drops to be purely cosmetic-neutral, the rates can be set very low; the default
posture is "a modest, thematic reward for the kill."

## Current machinery (what we build on)

| Concern | Where |
| --- | --- |
| Death hook | `engine.ts` `handleMonsterDeath` (~L1138) → already calls `dropStolenLoot` + `dropMonsterGold` |
| Spawn a floor item | `this.items.push({ type, symbol, color, x, y, ...data })` |
| Spawnable kinds | `Item` union (`types.ts`): `gold | food | scroll | potion | gear | wand` |
| Gear builder | `items.ts` `generateGearItem(floor, rarity, rng)`; `toFloorGear(gear, category)` |
| Gear pool | `config.ts` `GEAR_POOL` categories: helm, chest, legs, gauntlets, boots, shield, dagger, 1h_sword, 2h_sword, 1h_mace, 2h_mace, staff |
| Rarity | `items.ts` `rollLootRarity`, `RARITY_CONFIG` |

There is **no** generic monster→item drop today (only gold + recovered stolen loot). This is a new,
self-contained system.

## The fidelity gap (key design decision)

The sheet names ~33 bespoke items. Many reference **types the game doesn't have**:
- **Weapons with no category:** bows (Spiny Feathered Bow), polearms (Labrynth Pole), fist weapons.
- **Accessory slots that don't exist:** rings (One-eyed Ring, Bull Ring), necklaces (Beady Eye,
  Molar Choker, Zach's Earlace), belts (Pygmy Sash, Kalius' Belt), wrists (Kalius' Wristguards),
  trinkets (Bag of Snow, Trodgor's Dragon, Zach's Ankh Jar).
- **Enchant materials / unique effects:** Spirit Dust (enchant gear), Dragonslayer's Tenacity
  (+10% all stats), items with proc effects (King's Staff casts Miniaturize).

**Recommended approach — Phase 1 maps every drop onto an EXISTING spawnable kind:**
- Weapons → the nearest existing weapon category (bow/polearm → `dagger` or `2h_sword` by feel;
  fist → `dagger`; the sheet's 1h/2h swords/maces map directly), **custom-named** for flavor, at a
  rarity that fits the monster's depth.
- Armor ("random item slot") → a random `ARMOR_SLOTS` category at a fitting rarity.
- Accessories (rings/necklaces/belts/wrists/trinkets) → **no home yet**; Phase 1 maps them to the
  closest gear piece OR a themed consumable (e.g. a potion/scroll/food), custom-named. They're
  flagged for a **Phase 2 "accessory slot" system** (its own plan) — do NOT add new equip slots here.
- Consumables (Random Potion, Cobra Flesh food, Black Powder Bomb ×3) → spawn the matching kind.
- Gold (Leprechaun ≤100, Colossal Cyclops 150–200, Pillaged gold) → a gold pile (reuse the gold item).
- Uniques (Dragonslayer's Tenacity 100%, King Ellowyn's Cutlass) → a high-rarity gear piece,
  custom-named; the "+10% all stats" proc is **out of scope for Phase 1** (flagged) — it drops as a
  legendary-tier item without the bespoke proc until an item-affix system exists.

Phase 1 ships *every monster having a thematic, named drop* using only existing item kinds. The
bespoke procs/affixes and new slots are explicit Phase 2+ follow-ups.

## Data model

```ts
// config.ts (or a new drops.ts)
export interface MonsterDrop {
  chance: number;                 // 0..1 per kill (sheet is "drop chance")
  name?: string;                  // flavor name override ("Talon Dagger")
  kind:
    | { type: 'gear'; category: GearCategory | 'randomArmor'; rarity?: Rarity }
    | { type: 'potion' } | { type: 'scroll' } | { type: 'food' } | { type: 'wand' }
    | { type: 'gold'; min: number; max: number };
}
export const MONSTER_DROPS: Record<string, MonsterDrop[]> = { /* keyed by monsterId */ };
```

- Keyed by `monsterId` (kebab name) like `MONSTER_ABILITIES`, so it's per-monster and siblings on a
  shared archetype are unaffected.
- A monster may have **multiple** drops (Quinotaur: armor + dagger; Kalius: barb + belt + wrists).
- `rarity` optional — default to a depth-appropriate roll (`rollLootRarity(floor)`), so drops scale
  with where the monster lives and stay tier-bounded.

## Engine integration

In `handleMonsterDeath`, after the gold/stolen-loot drops, add `dropMonsterLoot(monster)`:
- Look up `MONSTER_DROPS[monsterId(monster)]`; for each entry, roll `rng.chance(entry.chance)`.
- On success, build the `ItemSpawn` for the kind (reuse `generateGearItem` for gear; for a named
  drop, set the custom name on the built gear/item) and `this.items.push({ ...spawn, x, y })` at the
  corpse tile. Log `"The <monster> drops <name>!"`.
- **RNG parity:** the drop roll happens only in `handleMonsterDeath` (already a post-combat,
  non-seeded-parity-critical path that draws for gold). Draw from `this.rng` consistently; a monster
  with no drop entry draws nothing (no stream change for existing monsters until they get a table).

## Bestiary

Extend the bestiary (the `MonsterDetail` "Abilities" pattern) with a **"Drops"** line per monster,
generated from `MONSTER_DROPS` (name + chance), so a defeated monster shows what it can drop —
reusing the data-driven `describeAbility`-style approach (`abilityDescriptions.ts` sibling, e.g.
`describeDrop`). Data-available-for-future-enhancements, basic textual UI (matches the abilities
bestiary work).

## Tests

- A `drops.test.ts`: a forced-`chance:1` drop spawns the right item kind/category with the custom
  name; `chance:0` spawns nothing; sibling monsters with no table drop nothing.
- An engine-level test: killing a monster with a guaranteed drop pushes a floor item at its tile and
  logs it (mirror the gold-drop / nymph-loot engine tests).
- `describeDrop` unit tests for the bestiary line.

## Phasing

1. **Framework + the spawn hook + bestiary line** (this plan), with the full Phase-1 mapping (every
   monster → existing item kinds, custom-named, conservative chances).
2. **Accessory slots** (rings/necklaces/belts/wrists/trinkets) — own plan; unlocks faithful jewelry.
3. **Item affixes / procs** (Dragonslayer's Tenacity +10% all-stats, King's Staff Miniaturize proc,
   enchant materials) — own plan; unlocks the unique drops' bespoke effects.

## Decisions (resolved)

1. **Drop rates — "modest thematic reward":** ~**12%** normal, ~**25%** hero/rare, **100%** for the
   Dragon King's signature unique (Dragonslayer's Tenacity). Tier-bounded so a drop never exceeds
   floor loot. Rates live in one place as playtest knobs.
2. **Accessories — DEFERRED, not mapped.** Rings/necklaces/belts/wrists/trinkets do NOT drop in
   Phase 1 (no fake-equipment mapping). The monsters whose drops are accessory-only therefore drop
   nothing this phase; monsters with a mix (e.g. Kalius' dagger + belt) still drop their
   equippable items. **The skipped drops are captured in a follow-up task that DEPENDS on the
   accessory-slot system** (see below), so nothing is lost.
3. **Unique procs — drop as plain high-rarity gear now.** King Ellowyn's Cutlass / Dragonslayer's
   Tenacity drop as legendary-tier named gear without their bespoke affix; the proc is a Phase 3
   (item-affix) follow-up.

### Phase-1 drop coverage (accessory-only monsters get NO drop this phase)

Monsters whose ONLY sheet drop is an accessory → **no Phase-1 drop** (deferred): Cyclops
(One-eyed Ring), Snake (Beady Eye necklace), Yeti (Bag of Snow trinket), Zombie (Molar Choker
necklace), Pygmy (Pygmy Sash belt). Monsters with a mix drop only their non-accessory items now
(e.g. Kalius drops the Barb dagger; Michael drops Skull shield + armor; the Bull Ring / belt /
wrists wait). All deferred accessory drops are enumerated in the dependency-linked follow-up task.
