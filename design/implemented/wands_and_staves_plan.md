# Wands and Staves Plan

Wands and staves give the player a real ranged option for the first time. In the
original Rogue these are the "magic" line of items: you *zap* them in a direction
to throw a bolt or apply an effect at range. This plan adds that line to
*Rogue: DungeonMaster* while honoring the project's explicit design constraint:

> Do **not** use finite charges. Wands and staves are persistent items, used
> without depleting, the same way the existing elemental melee staffs already
> work with unlimited use.

Because an infinite free ranged attack is obviously overpowered, this plan
proposes a non-charge balancing gate (a per-item cooldown plus a small hunger
cost) and a new targeting subsystem the engine does not yet have. It aims for
feature parity with the 1980 wand/staff catalog and leaves clear room to expand.

---

## Current state

- **Magic already exists as melee weapons, not zappables.** `WeaponType` in
  `src/types.ts:58` includes `'staff'`, and `StaffMagic` (`src/types.ts:59`) is
  `'fire' | 'frost' | 'arcane'`. `GEAR_POOL.staff` (`src/config.ts:283`) holds
  the Fire/Frost/Arcane staffs as two-handed `dmg:4` weapons. These resolve in
  melee through `computeStrike` and the `BALANCE.combat` knobs `staffFireBonus`,
  `staffArcaneHeal`, `frostFreezeChance`, and `frostFreezeTurns`
  (`src/config.ts:121-124`). They are equipped in `mainHand`, treated as
  two-handed by `isTwoHanded` (`src/player.ts:100-103`), and used with no
  charges. This is the model the user wants the new items to mirror.

- **There is no ranged, targeting, or projectile subsystem for the player.** A
  grep across `src/` for `ranged|projectile|targeting|reticle|zap` finds only
  *monster* AI: the Flying Serpent kiter telegraphs a "bolt" (`src/ai/archetypes.ts`,
  `src/config.ts:252`). Nothing lets the player select a direction or tile and
  resolve an effect along a path. Building that is the bulk of this feature.

- **Consumables follow a clean, copyable shape.** Potions (`usePotion`,
  `src/engine.ts:1023`) and scrolls (`useScroll`/`readScroll`,
  `src/engine.ts:1070-1112`) each: guard `takeSleepTurn()`, validate an index,
  apply an effect against `this.statusEffects`/`this.player`, log via `addLog`,
  emit a `sound.emit` cue, call `this.ui.updateDropdowns(this.player)`, and end
  with `this.processTurn()`. A wand's "zap" command will follow the same spine,
  minus the consume step.

- **Several wand effects already have engine analogues we can reuse:**
  - Freeze/hold: `monster.frozenTurns` is set by the Frost Staff
    (`src/engine.ts:814-818`) and decremented/skipped in `processMonsterAI`
    (`src/monster.ts:42-43`).
  - Teleport: `teleportPlayerSafely()` (`src/engine.ts:589-606`) picks a safe
    floor tile away from monsters — the same logic a "Teleport Monster" wand
    needs, re-pointed at a monster.
  - Light: `lightCurrentRoom()` (`src/engine.ts:1121`) and the Scroll of Light
    flood the room interior via `floodRoomInterior` (`src/engine.ts:364`).
  - Self-invisibility: `statusEffects.invisTurns` (`src/types.ts:153`,
    Potion of Invisibility at `src/engine.ts:1038`).
  - Direct damage with a freeze rider: `computeStrike` already produces
    `{ damage, freezeTurns, selfHeal, messages }`.

- **No monster speed system exists.** `processMonsterAI` runs every monster
  exactly once per player turn; the only per-monster timer is `frozenTurns`.
  There is no "this monster acts twice" or "every other turn" budget. So
  *Slow Monster* and *Haste Monster* have **no hook today** and need a new
  per-monster turn-budget field — flagged as out of scope for the first phase.

- **Everything spawns identified.** As the mechanics comparison notes
  (`design/implemented/game_mechanics_comparison.md` §3.4), items are fully
  named on pickup. Classic Rogue wands are unidentified; the meta-progression
  `discovery.ts` pattern is the natural template if we add identification, but
  that is an expansion phase, not the core.

- **Persistence is at `VERSION = 2`** (`src/persistence/savegame.ts:46`).
  `validateSaveGame` checks player shape, including each `ARMOR_SLOTS` array and
  `inventory.shield` (`src/persistence/savegame.ts:202-206`). Any new inventory
  array or equipped slot must be validated and backfilled here.

---

## Goals

1. Add a persistent **wand/staff** item line that is *zapped* in a direction,
   never consumes charges, and mirrors the existing unlimited-use staff model.
2. Build a minimal, reusable **directional targeting + bolt-tracing subsystem**
   in the engine, with full keyboard and pointer parity.
3. Gate power with a **per-item cooldown plus a small hunger cost**, configured
   in `BALANCE`, not with charges.
4. Reach **parity with the original Rogue wand/staff catalog**, mapping each
   classic effect to an existing engine mechanic and flagging the gaps.
5. Keep the door open for **tile-targeting, identification, and a monster-speed
   system** as later phases without reworking the data model.
6. Coordinate save versioning and shared types with the **rings** and
   **potion-dipping** plans being written in parallel.

## Non-goals (first version)

- No finite charges and no recharging. Ever, per the design constraint.
- No tile/free-aim targeting in v1 (directional 8-way only).
- No wand identification in v1 (items spawn identified like everything else).
- No Slow/Haste Monster in v1 (needs a monster-speed system that does not exist).
- No audio generation from runtime code; follow the sound-effects plans when
  adding zap cues.

---

## Naming: resolving the `staff` collision

`staff` is already a melee `WeaponType`. Renaming it would touch
`GEAR_POOL.staff`, `isTwoHanded`, `computeStrike`, several `*.test.ts` files, and
existing save blobs. That is churn with no player benefit.

**Recommendation — keep the melee items, introduce a separate magic line:**

- The existing Fire/Frost/Arcane melee items keep the `WeaponType` `'staff'` and
  their `StaffMagic` field. In player-facing copy we may relabel them
  **"battle staffs"** (or leave their names as-is — "Fire Staff" etc. read fine
  as melee weapons), but the *type identifier stays `staff`*.
- The new zappable line is a **distinct item kind** with its own union
  `WandType` and its own inventory array. Player-facing, both wands and the
  larger "staves" are this kind; mechanically they differ only by tuning
  (a staff is "the larger sibling of a wand" — same code path, bigger numbers /
  shorter cooldown). We will call the kind `wand` internally to avoid any
  textual overlap with the existing `staff` weapon type, and surface
  "Wand" / "Staff" as display tiers via a `tier: 'wand' | 'staff'` field.

This keeps `WeaponType`, `GEAR_POOL.staff`, and all existing tests untouched.

---

## Proposed data model

A wand is **carried, not equipped** in v1. It is selected and zapped on demand,
exactly like reading a scroll — no equip slot, no off-hand interaction, no
two-handed conflict. (Equipping is discussed under Open Questions.)

```ts
// src/types.ts

/** The zappable arcane line. Distinct from the melee WeaponType 'staff'. */
export type WandType =
  | 'striking'       // force bolt, scaled melee-style damage
  | 'magic_missile'  // reliable low-variance damage, never misses
  | 'lightning'      // beam: pierces, hits every monster in line
  | 'fire'           // bolt: damage + (future) ignite
  | 'cold'           // bolt: damage + freeze (reuses frozenTurns)
  | 'sleep'          // hold monster (frozenTurns, no damage)
  | 'polymorph'      // reroll the struck monster into another species
  | 'teleport_away'  // relocate the struck monster elsewhere on the floor
  | 'cancellation'   // strip a monster's special behavior for N turns
  | 'drain_life'     // damage the monster, heal the player (costs player HP)
  | 'light'          // self-targeted: flood the current room
  | 'invisibility'   // self-targeted: invisTurns on the player
  | 'nothing';       // the classic dud — flavor only

/** A carried, zappable wand/staff. Persistent: no charges. */
export interface WandItem {
  name: string;            // "Wand of Cold", "Staff of Lightning"
  wandType: WandType;
  tier: 'wand' | 'staff';  // display tier + tuning band; not a charge count
  rarity?: Rarity;         // mirrors GearItem
  color?: string;          // glyph/art tint, mirrors GearItem
  /** Turns remaining before this wand can be zapped again. 0 = ready.
   *  Runtime/persisted state, not a charge. */
  cooldownRemaining?: number;
  /** Set on pickup once identification ships; until then always true. */
  identified?: boolean;
}
```

Inventory and references extend the existing unions:

```ts
// Inventory gets its own wand array, parallel to potions/scrolls.
export type Inventory = {
  food: number;
  weapons: GearItem[];
  potions: PotionType[];
  scrolls: ScrollType[];
  wands: WandItem[];                 // NEW
} & Record<GearSlot, GearItem[]>;

// Stable UI -> engine reference (mirrors { kind: 'weapon'; index }).
export type InventoryRef =
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }
  | { kind: 'scroll'; scrollType: ScrollType }
  | { kind: 'weapon'; index: number }
  | { kind: 'wand'; index: number }   // NEW
  | { kind: 'armor'; slot: ArmorSlot; index: number }
  | { kind: 'shield'; index: number };

// Floor spawn: a new Item union member + ItemSpawn picks it up automatically
// (ItemSpawn is DistributiveOmit<Item, 'x'|'y'>, src/types.ts:112).
export type Item =
  | (ItemBase & { type: 'gold' })
  | (ItemBase & { type: 'food' })
  | (ItemBase & { type: 'scroll'; data?: { scrollType: ScrollType } })
  | (ItemBase & { type: 'repair_scroll' })
  | (ItemBase & { type: 'potion'; data: { potionType: PotionType } })
  | (ItemBase & { type: 'gear'; data: FloorGear })
  | (ItemBase & { type: 'wand'; data: WandItem });   // NEW
```

Notes on convention-matching:

- `wands` lives alongside `potions`/`scrolls` rather than inside `weapons`,
  because the equip/`mainHand` machinery (`canEquip`, `normalizeOffHand`,
  `inventoryRefToEquipTarget`) assumes weapons are wielded, and we explicitly do
  not equip wands in v1.
- `WandItem` reuses optional `rarity`/`color` like `GearItem` so existing
  rarity-color helpers (`RARITY_CONFIG`, `getStyledItemName`) work unchanged.
- `cooldownRemaining` is per-item runtime state (think of it like a regen
  timer), not a count of uses. It is persisted but never blocks pickup or
  carrying.

A wand catalog mirrors `GEAR_POOL`:

```ts
// src/config.ts (new export, parallel to GEAR_POOL)
export const WAND_POOL: WandItem[] = [
  { name: 'Wand of Striking',      wandType: 'striking',     tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Magic Missile', wandType: 'magic_missile',tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Cold',          wandType: 'cold',         tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Fire',          wandType: 'fire',         tier: 'wand',  rarity: 'uncommon' },
  { name: 'Staff of Lightning',    wandType: 'lightning',    tier: 'staff', rarity: 'rare' },
  { name: 'Wand of Sleep',         wandType: 'sleep',        tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Polymorph',     wandType: 'polymorph',    tier: 'wand',  rarity: 'rare' },
  { name: 'Wand of Teleportation', wandType: 'teleport_away',tier: 'wand',  rarity: 'uncommon' },
  { name: 'Wand of Cancellation',  wandType: 'cancellation', tier: 'wand',  rarity: 'rare' },
  { name: 'Staff of Drain Life',   wandType: 'drain_life',   tier: 'staff', rarity: 'rare' },
  { name: 'Wand of Light',         wandType: 'light',        tier: 'wand',  rarity: 'common' },
  { name: 'Wand of Invisibility',  wandType: 'invisibility', tier: 'wand',  rarity: 'rare' },
  { name: 'Wand of Nothing',       wandType: 'nothing',      tier: 'wand',  rarity: 'common' },
];
```

---

## Balancing without charges: cooldown + hunger cost

Because every wand is reusable forever, balance comes from two non-charge gates.

**1. Per-item cooldown (primary gate).** After a successful zap, the wand's
`cooldownRemaining` is set to its type's cooldown and decremented once per
`processTurn()` (right next to the existing status-effect decrements at
`src/engine.ts:1260-1282`). A wand on cooldown cannot be zapped; the attempt
logs "The wand is still recharging (N)." and costs no turn (mirroring the
no-op-keeps-the-turn rule already used for Scroll of Light,
`src/engine.ts:1064-1068`).

**2. Hunger cost (secondary gate).** Each zap subtracts a flat `hungerCost` from
`player.hunger` on top of the normal per-turn drain. This makes ranged spam
trade against food economy — the Rogue-authentic pressure valve — and ties wands
into the existing hunger system (`processTurn`, `src/engine.ts:1285`) without a
new resource bar.

Why this combination:

- Cooldown caps *burst* (you cannot delete a room in three zaps), which is the
  main fairness risk of free ranged damage.
- Hunger cost caps *sustain* over a long floor, so wands stay a tactical tool,
  not a default attack that obsoletes melee.
- Both are legible: the player sees a cooldown number on the wand tile and feels
  the hunger drain, with no hidden charge accounting.
- High-impact control effects (Polymorph, Teleport, Sleep, Drain Life) get
  longer cooldowns and higher hunger than plain damage bolts.

```ts
// src/config.ts — BALANCE.wands
wands: {
  // Default gates, overridable per type below.
  defaultCooldown: 4,        // turns
  defaultHungerCost: 8,      // hunger units per zap (per-turn drain is 1)
  maxRange: 8,               // bolt travels up to this many tiles
  // Damage bolts scale with floor like gear does (gearDmgFloorScale analogue).
  strikingBase: 4,
  strikingFloorScale: 1.0,
  magicMissileBase: 3,       // low variance, never misses
  coldBase: 3,
  coldFreezeTurns: 2,        // reuses monster.frozenTurns
  fireBase: 5,
  lightningBase: 6,          // beam: hits each monster in line
  drainLifeBase: 6,
  drainLifeSelfCostRatio: 0.5,   // player pays half the damage dealt as HP
  sleepFreezeTurns: 3,
  cancellationTurns: 12,
  // Per-type overrides (turns / hunger). Control effects cost more.
  cooldown: {
    striking: 3, magic_missile: 3, cold: 4, fire: 4, lightning: 5,
    sleep: 6, polymorph: 10, teleport_away: 6, cancellation: 8,
    drain_life: 6, light: 2, invisibility: 12, nothing: 1,
  },
  hungerCost: {
    striking: 6, magic_missile: 6, cold: 8, fire: 8, lightning: 10,
    sleep: 10, polymorph: 18, teleport_away: 12, cancellation: 14,
    drain_life: 12, light: 4, invisibility: 20, nothing: 2,
  },
},
```

Staff-tier items can apply a flat cooldown reduction / damage bump over the
wand tier via `tier`, so "the larger sibling" reads mechanically without a new
resource.

---

## The targeting subsystem

This is the major new piece. Recommendation: **directional 8-way zapping first**
(simpler, Rogue-authentic), with free-tile targeting as a later expansion.

### Engine: a targeting mode

Add a transient aiming state to `GameEngine`, plus a UI context so movement keys
become aim keys while a wand is "drawn":

```ts
// On GameEngine
public aiming: { ref: InventoryRef & { kind: 'wand' } } | null = null;

/** Begin aiming a wand. No turn passes. */
public beginZap(ref: InventoryRef & { kind: 'wand' }): boolean;
/** Resolve a zap in a unit direction (dx,dy ∈ {-1,0,1}, not both 0). */
public zapInDirection(dx: number, dy: number): boolean;
/** Abort aiming (Escape). No turn passes. */
public cancelZap(): void;
```

`beginZap` validates the wand exists and is off cooldown, sets `this.aiming`,
and asks the UI to enter an `'aiming'` keyboard context (so WASD/arrows route to
`zapInDirection`, Escape routes to `cancelZap`, and normal movement is
suppressed — same gating pattern the inventory overlay uses).

### Bolt/beam path tracing

Reuse the straight-line traversal already proven by `handlePlayerRun`
(`src/engine.ts:657-713`): step `(x += dx, y += dy)` from the player outward,
bounded by `BALANCE.wands.maxRange`. A shared helper keeps the math in one place
and testable:

```ts
/** Tiles a bolt would cross from the player in a unit direction, stopping
 *  before a wall, at maxRange, or per the wand's stop rule. */
private traceBolt(dx: number, dy: number, maxRange: number): Array<{ x: number; y: number }>;

/** First monster a bolt strikes along that path, if any. */
private firstMonsterAlong(path: Array<{ x: number; y: number }>): Monster | undefined;
```

**What stops a bolt:**

- A non-walkable tile (`isWalkable`, already used in run logic) ends the path —
  the bolt hits the wall and stops at the last open tile.
- For single-target wands (Striking, Cold, Fire, Sleep, Polymorph,
  Teleport, Cancellation, Drain Life, Magic Missile): the **first monster** on
  the path is the target; the bolt stops there.
- For **Lightning** (a beam): the bolt does *not* stop on a monster — it pierces
  and damages **every** monster along the path until a wall. This is the one
  beam-vs-bolt distinction in v1.
- Self-targeted wands (Light, Invisibility, Nothing) ignore direction entirely
  and resolve immediately on the player; aiming can skip straight to resolution
  for these (or accept any direction press).

This matches Rogue's "bolt travels until it hits something" feel and reuses
proven traversal, FOV (`updateFOV`), and walkability code.

### Keyboard + pointer parity

- **Keyboard (primary):** a new `z` binding (the Rogue "zap" verb) opens wand
  selection. With one wand carried, `z` + a direction key zaps it; with several,
  `z` opens the inventory/quick-picker scoped to wands, then a direction key
  fires. Escape cancels. This reuses the `overlayOpen()` gating and the
  `setContextActive('aiming', …)` toggle exactly like existing overlays in
  `src/main.ts:232-327`.
- **Pointer:** in the inventory modal, a wand cell gets a "Zap" action
  (`InventoryActionView` already supports per-item actions,
  `src/ui/store.svelte.ts:87-92`). Selecting it enters aiming; the player then
  clicks an adjacent direction arrow reticle (or a target tile, in the
  tile-targeting expansion) — and every such pointer affordance has the
  keyboard equivalent above. The repo enforces this parity (see the keyboard
  sections of the gear-health and hidden-traps plans).
- **Reticle / prompt:** while `this.aiming` is set, the renderer overlays a
  directional prompt ("Zap which way? WASD/arrows, Esc to cancel") and may draw
  8 faint direction markers around `@`. No modal; this is a lightweight overlay
  like the existing nearby-monster banner.

---

## Original Rogue parity catalog

Each classic wand/staff effect, the engine mechanic it hooks, and the gap.

| Rogue effect | wandType | Hooks into | Status / gap |
| --- | --- | --- | --- |
| Striking | `striking` | `computeStrike`-style damage on first monster hit | Ready. Reuse damage math at range. |
| Magic Missile | `magic_missile` | flat low-variance damage, no to-hit roll | Ready. New small damage path (never misses). |
| Lightning | `lightning` | `traceBolt` beam, damages every monster in line | Ready. Only multi-target effect in v1. |
| Fire | `fire` | bolt damage; reuse `staffFireBonus` feel | Ready for damage. Ignite-over-time is a gap (no burn DoT exists). |
| Cold | `cold` | bolt damage + `monster.frozenTurns` (`src/engine.ts:814`, skipped in `src/monster.ts:42`) | Ready. Mirrors Frost Staff freeze at range. |
| Sleep / Hold Monster | `sleep` | `monster.frozenTurns` only (no damage) | Ready. "Sleep" = a long freeze via the same field. |
| Polymorph | `polymorph` | replace the struck monster with a fresh one from `MONSTER_DATABASE` | Partial. Needs a re-spawn helper (pick a template valid for the floor, reset hp/maxHp/ai/frozenTurns). |
| Teleport Monster (away) | `teleport_away` | `teleportPlayerSafely` logic (`src/engine.ts:589`) re-pointed at a monster | Ready. Generalize "pick safe tile" to move a monster instead of the player. |
| Cancellation | `cancellation` | strip/suppress monster special behavior (`special`, `ai`, archetype) for N turns | Partial. Needs a `canceledTurns` field on `Monster` and an AI check; archetypes live in `src/ai/`. |
| Drain Life | `drain_life` | monster damage + heal player (bounded by `vigorMaxHp`), player pays HP per Rogue | Ready. Self-cost via `drainLifeSelfCostRatio`. |
| Light | `light` | `lightCurrentRoom()` (`src/engine.ts:1121`) | Ready. Self-targeted; identical to Scroll of Light effect. |
| Invisibility (self) | `invisibility` | `statusEffects.invisTurns` (`src/engine.ts:1038`) | Ready. Self-targeted. |
| Nothing | `nothing` | no-op + flavor log | Ready. The classic dud (matters once identification ships). |
| **Slow Monster** | *(deferred)* | — | **Gap.** No monster-speed system; `processMonsterAI` runs each monster once per turn. Needs a per-monster turn budget. Out of scope v1. |
| **Haste Monster (cursed)** | *(deferred)* | — | **Gap.** Same as Slow; also depends on identification (cursed surprise). Out of scope v1. |

Expansion hooks already implied: Fire ignite needs a burn-DoT status; Slow/Haste
need a monster-speed field; cursed Haste needs identification.

---

## Engine integration

A new method group on `GameEngine`, modeled on `useScroll`:

```ts
public zapWand(index: number, dx: number, dy: number): boolean {
  if (this.gameOver || this.gameWon) return false;
  if (this.takeSleepTurn()) return false;            // same guard as potions/scrolls
  const wand = this.player.inventory.wands[index];
  if (!wand) return false;
  if ((wand.cooldownRemaining ?? 0) > 0) {
    this.addLog(`The ${wand.name} is still recharging. (${wand.cooldownRemaining})`);
    return false;                                    // no turn spent (no-op rule)
  }

  const path = this.traceBolt(dx, dy, BALANCE.wands.maxRange);
  this.applyWandEffect(wand, path, dx, dy);          // switch on wand.wandType

  wand.cooldownRemaining = wandCooldown(wand);        // set cooldown, not a charge
  this.player.hunger = Math.max(0, this.player.hunger - wandHungerCost(wand));
  this.sound.emit({ type: 'item.zap', wandType: wand.wandType }); // typed cue
  this.ui.updateDropdowns(this.player);
  this.processTurn();                                 // costs a turn; decrements cooldowns
  return true;
}
```

`applyWandEffect` is a pure-ish switch that reuses existing effect code:
`monster.frozenTurns` for cold/sleep, `teleportPlayerSafely`-style relocation
for teleport, `lightCurrentRoom()` for light, `statusEffects.invisTurns` for
invisibility, and a new `respawnMonster` for polymorph. Cooldown decrement is one
line added to `processTurn` next to the status-effect block
(`src/engine.ts:1260`): iterate `inventory.wands` and decrement any
`cooldownRemaining > 0`.

Pickup is one more branch in the item loop (`src/engine.ts:994` neighborhood):

```ts
} else if (item.type === 'wand') {
  this.player.inventory.wands.push(item.data);
  recordWandPickedUp(this.stats, item.data); // mirrors recordGearPickedUp
  this.addLog(`Looted: ${this.ui.getStyledItemName(item.data.name, item.data.rarity || 'common')}.`);
}
```

and the `kind` map at `src/engine.ts:1013-1017` gains a `'wand'` arm for the
pickup sound.

---

## Discovery / identification (expansion phase)

Classic Rogue wands are unidentified. The game spawns everything identified, so
this is a deliberate later phase, not part of core parity.

Recommendation: when added, reuse the **`discovery.ts` localStorage pattern**.
That module already persists per-run-independent knowledge keyed by a stable
slug, with `seen`/`defeated` tiers and a `migrate` step
(`src/discovery.ts:104-127`). A parallel `wandDiscovery` store would map
`WandType -> identified`, with a randomized per-run appearance (e.g. "oak wand",
"copper wand") rendered until the player zaps it once and learns the type. The
`identified` field already exists on `WandItem` for this. The "Nothing" wand
becomes meaningful only here (a dud you waste a zap learning). Until this ships,
`identified` is always `true` and names render directly — matching every other
item in the game today.

---

## UI / store

- **`UIActions`** gains `zapWand(ref: InventoryRef, dx: number, dy: number)`
  and `beginZap(ref)` / `cancelZap()`, wired in `main.ts` to the engine methods
  (alongside the existing `usePotion`, `inventoryAction` hooks,
  `src/ui/store.svelte.ts:233-251`, `src/main.ts:147-230`).
- **Inventory modal:** wands render as their own cells via the new
  `{ kind: 'wand'; index }` ref. Each cell shows the wand name (rarity-colored),
  a cooldown badge when `cooldownRemaining > 0` (reusing the `count` badge slot
  pattern in `InventoryCell`), and a "Zap" action in `actions`.
- **Aiming overlay:** add `aiming: { wandName: string } | null` to `UIState`
  and a small reticle/prompt component. No new modal chrome; it is a transient
  overlay like `nearbyMonster`.
- **Tooltips:** wand tooltip lists effect summary, cooldown, and hunger cost via
  the existing `tooltipStats: InventoryTooltipStat[]` mechanism.

## Keyboard

- New `z` binding in `src/main.ts` (context `'game'`, gated by `overlayOpen()`),
  description "Zap a wand."
- New `'aiming'` keyboard context, toggled like the inventory/settings contexts.
  While active: WASD/arrows call `zapInDirection`, Escape calls `cancelZap`,
  movement and other game keys are suppressed.
- Every pointer affordance (Zap action, direction reticle clicks) has the above
  keyboard equivalent, per repo parity rules.

## Sound

Follow the sound-effects plans (do not generate audio at runtime). Add a typed
event in `src/audio/events.ts`:

```ts
| { type: 'item.zap'; wandType: WandType }
```

Emit it from `zapWand`, add manifest mappings once assets exist, and add prompt
rows to the asset prompt guide. Until then, logs + FX are enough.

---

## Persistence and cross-plan coordination

Adding `inventory.wands` (and the per-wand `cooldownRemaining`) is a save-shape
change, so it needs validation and backfill in
`src/persistence/savegame.ts`:

- **Validate:** after the existing `inventory.shield` / `ARMOR_SLOTS` checks
  (`src/persistence/savegame.ts:202-206`), require `p.inventory.wands` to be an
  array; reject blobs where it is present-but-malformed; reject any entry whose
  `wandType` is not in a `KNOWN_WAND_TYPES` set (mirroring the
  `KNOWN_SCROLL_TYPES` / `KNOWN_TRAP_KINDS` guards at
  `src/persistence/savegame.ts:17-18, 159-161`).
- **Backfill old saves:** in the normalization tail
  (`src/persistence/savegame.ts:208-219`), default `player.inventory.wands` to
  `[]` and clamp any `cooldownRemaining` to `>= 0`, the same way `traps` and
  `trapEffects` are defaulted. A `normalizeWands(player)` helper (parallel to
  `normalizeAllGearHealth`) keeps this in one place.

**Version bump — coordinate with the parallel plans.** The **rings** plan and
the **potion-dipping** plan are being written at the same time and *also* touch
`SaveGameV2`/`InventoryRef`/`EquipSlot`/`Equipped`. If all three ship
independently, each will want its own bump from `VERSION = 2`, which collides.

Recommendation: **ship the save migration as a single coordinated `VERSION = 3`
bump** that adds all three plans' fields at once (wands inventory + ring slots +
any dipping state), with one `migrateV2toV3` that backfills every new field to
its empty default. If they must ship separately, the first to land owns the
bump to 3 and the others extend the same migration rather than each bumping
again. Either way: the `InventoryRef` and `EquipSlot`/`Equipped` unions are
shared surface — wands add `{ kind: 'wand'; index }`; rings will add ring refs
and slots; dipping will add a potion-target action. These must be merged, not
overwritten, in `types.ts`.

---

## Phased rollout

**Phase 1 — data + carry + persistence (no zapping yet).**
`WandType`/`WandItem`, `inventory.wands`, `Item`/`ItemSpawn`/`InventoryRef`
extensions, `WAND_POOL`, pickup branch, save validation/backfill, and the
coordinated version bump. Wands can spawn, be picked up, listed, and survive
save/reload. Shippable on its own.

**Phase 2 — targeting subsystem.** `aiming` state, `beginZap`/`zapInDirection`/
`cancelZap`, `traceBolt`/`firstMonsterAlong`, `'aiming'` keyboard context, `z`
binding, reticle overlay. Wire one trivial wand (Magic Missile) end to end.

**Phase 3 — damage + freeze wands.** Striking, Magic Missile, Cold, Fire,
Lightning (beam), Drain Life, plus cooldown + hunger gates in `BALANCE.wands`
and the `processTurn` cooldown decrement. Sound event added.

**Phase 4 — control wands.** Sleep (long freeze), Teleport Monster, Polymorph
(`respawnMonster` helper), Cancellation (`canceledTurns` + AI check), Light,
Invisibility, Nothing.

**Phase 5 (expansion) — identification.** Per-run randomized appearances and a
`wandDiscovery` store via the `discovery.ts` pattern; "Nothing" becomes
meaningful.

**Phase 6 (expansion) — monster speed.** Add a per-monster turn budget; ship
Slow Monster and Haste Monster (cursed); tile/free-aim targeting.

---

## Testing strategy

Unit tests in the repo's `*.test.ts` style.

- **Targeting math (`traceBolt`):** stops at walls, respects `maxRange`, returns
  the correct ordered tiles for all 8 directions; `firstMonsterAlong` returns
  the nearest monster; lightning collects every monster in line.
- **Each effect** (engine tests, seeded RNG):
  - Striking/Magic Missile/Fire deal expected damage to the first monster;
    Magic Missile never misses.
  - Cold sets `frozenTurns` and damages; frozen monster is skipped in
    `processMonsterAI`.
  - Lightning damages multiple monsters along the line.
  - Sleep sets a long `frozenTurns` with no damage.
  - Teleport relocates the monster to a safe tile (never adjacent to the player,
    never on a wall/armed trap — reuse the `teleportPlayerSafely` invariants).
  - Polymorph replaces the monster with a floor-valid template and resets hp.
  - Cancellation suppresses special behavior for N turns.
  - Drain Life damages the monster and heals the player by the configured ratio,
    bounded by `vigorMaxHp`, costing player HP.
  - Light floods the current room (reuses `lightCurrentRoom` test coverage);
    Invisibility sets `invisTurns`; Nothing is a logged no-op.
- **Cooldown gate:** a fresh wand zaps; immediately re-zapping is a no-op that
  spends no turn and logs "recharging"; `cooldownRemaining` decrements once per
  `processTurn` and reaches 0.
- **Hunger gate:** a zap reduces hunger by `hungerCost`; zapping near starvation
  clamps hunger at 0.
- **Pickup:** a floor `wand` item enters `inventory.wands` and is removed from
  the floor.
- **Persistence migration:** an old `VERSION = 2` save (no `wands`) loads with
  `inventory.wands === []`; a save with wands round-trips, including
  `cooldownRemaining`; a malformed `wandType` is rejected (returns `null`).
- **Keyboard/UI parity (browser smoke):** `z` enters aiming; a direction key
  fires; Escape cancels with no turn spent; the inventory "Zap" action mirrors
  it; movement is suppressed while aiming.

Gate: `npm run check` passes; seeded effect tests are deterministic.

---

## Open questions / decisions

- **Carried vs. equipped.** Recommended: carried-and-zapped (no slot) in v1, to
  avoid the `mainHand`/`offHand`/two-handed machinery. If wands should later
  occupy a slot (so a "drawn" wand zaps faster or with a shorter cooldown),
  that is an additive `EquipSlot` change — and it must be coordinated with the
  rings plan, which also extends `EquipSlot`/`Equipped`.
- **Directional vs. tile targeting.** Recommended: directional 8-way first
  (Rogue-authentic, reuses run-line traversal). Free-tile aim (clicking any
  visible tile, line-of-sight bolt) is Phase 6.
- **Is monster speed in scope?** Recommended: no, for v1. Slow/Haste are
  genuinely blocked on a non-existent per-monster turn-budget system; shipping
  them half-built would be worse than deferring.
- **Should staffs be mechanically distinct from wands,** or only a tuning tier?
  Recommended: tuning tier (`tier: 'staff'` = bigger numbers / shorter
  cooldown) in v1; promote to distinct behaviors only if play demands it.
- **Identification scope.** Recommended: defer to Phase 5; until then wands are
  identified like every other item, keeping the core feature small.
- **Does Drain Life cost the player HP?** Recommended: yes (Rogue-authentic risk
  via `drainLifeSelfCostRatio`); revisit if it feels punishing in playtests.
- **Spawn rate / floor gating.** Where do wands sit in the consumable roll
  (`BALANCE.map.spawn`, `src/config.ts:58-69`)? Recommended: a small slice of
  the consumable roll starting around floor 3-4, rarer than potions, with
  rarity gating high-impact types (Polymorph/Lightning later). Tune with the
  existing spawn cuts before shipping.
