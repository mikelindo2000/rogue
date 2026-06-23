# Potion Dipping (Systems Chemistry) Plan

## Current Situation

Potions in Rogue: DungeonMaster are single-use, click-to-drink consumables with no
interactions between items.

- `PotionType` (`src/types.ts:61`) is `'healing' | 'strength' | 'invisibility' |
  'armor'`. Potions are carried as a `PotionType[]` in `Inventory.potions`
  (`src/types.ts:174`) — just the type string, no per-instance object.
- Drinking is handled by `usePotion(index)` (`src/engine.ts:1023`): it applies the
  effect (heal / `strengthTurns` / `invisTurns` / `armorTurns`), emits
  `item.consume`, records the stat, splices the potion out, and calls
  `processTurn()`. `usePotionType` (`engine.ts:1053`) resolves an `InventoryRef`
  to an index first.
- Potions spawn on the floor as `{ type: 'potion'; data: { potionType } }`
  (`src/types.ts:104`) and are picked up at `engine.ts:958`.
- There is **no interaction system**: gear is static, consumables are atomic, and
  (per `design/implemented/game_mechanics_comparison.md` §3.6) "items are purely
  static." Dipping, mixing, coating, and diluting do not exist.
- There is no notion of a temporary coating/imbue on a weapon or piece of gear,
  and no ranged/thrown attack that a coating would naturally pair with.

## Goals

- Add a **dipping** action — dip a carried item into a potion — as the first piece
  of "systems chemistry," in the spirit of NetHack (`game_mechanics_comparison.md`
  §3.6 calls this out explicitly as unimplemented).
- Make it a **data-driven framework**, not a pile of `if` statements: an
  interaction is `(item matcher) × (potion type) → outcome`. New potions, new
  outcomes, and dipping new item kinds (rings, wands) should slot in without
  touching the dip plumbing.
- Ship a small, legible **starter interaction matrix** over the four existing
  potions that is obviously useful and obviously Rogue-flavored, plus clear
  expansion hooks (water/dilution, poison coating for future thrown weapons,
  identify-by-dip, blessing food).
- Preserve project conventions: a turn-costing engine action with logs and sound,
  keyboard parity, save validation/migration, and colocated tests.

## Core Model

### A dip is a transaction: `dip(targetRef, potionType)`

The player chooses a **target item** (from the pack) and a **potion** to dip it
into. The engine looks up a matching `DipRule`, applies it, and almost always
consumes the potion (some rules dilute instead of consume).

```ts
/** What kind of carried thing is being dipped. Reuses InventoryRef so the UI can
 *  pass the same stable handle it already uses for equip/use. */
export type DipTargetRef =
  | { kind: 'weapon'; index: number }
  | { kind: 'armor'; slot: ArmorSlot; index: number }
  | { kind: 'shield'; index: number }
  | { kind: 'food' }
  | { kind: 'potion'; potionType: PotionType }   // potion-into-potion (mixing)
  // expansion: 'ring', 'wand'
  ;

export interface DipOutcome {
  /** Player-facing log line. */
  message: string;
  /** Does this consume the dipped-into potion? Dilution rules set false. */
  consumesPotion: boolean;
  /** Sound cue key, defaults to a generic 'item.dip'. */
  sound?: string;
}

export interface DipRule {
  id: string;
  potion: PotionType;
  /** Returns true if this rule applies to the chosen target + current state. */
  matches: (target: DipResolved, player: Player) => boolean;
  /** Mutates the target/player and returns the outcome. */
  apply: (target: DipResolved, player: Player, ctx: DipContext) => DipOutcome;
}
```

`DipResolved` is the dereferenced item (the actual `GearItem` / food count / the
other potion) plus its `DipTargetRef`, resolved once in the engine so rules never
touch the inventory arrays directly. `DipContext` carries `addLog`, `rng`, and the
stats recorder.

The engine entry point mirrors `usePotion`:

```ts
public dipItem(targetRef: DipTargetRef, potionType: PotionType) {
  if (this.takeSleepTurn()) return;
  const target = this.resolveDipTarget(targetRef);       // null-guard like usePotionType
  const potionIdx = this.player.inventory.potions.indexOf(potionType);
  if (!target || potionIdx === -1) { /* "You can't dip that." */ return; }

  const rule = DIP_RULES.find(r => r.potion === potionType && r.matches(target, this.player))
            ?? DEFAULT_DIP_RULE;                          // "nothing happens"
  const outcome = rule.apply(target, this.player, this.dipCtx());
  this.addLog(outcome.message);
  if (outcome.consumesPotion) this.player.inventory.potions.splice(potionIdx, 1);
  this.sound.emit({ type: 'item.dip' /* or outcome.sound */ });
  recordDip(this.stats, rule.id);                          // new run-stat
  this.ui.updateDropdowns(this.player);
  this.processTurn();
}
```

Always-falls-back `DEFAULT_DIP_RULE` ("You dip it, but nothing happens.") means an
unmatched pairing is a graceful no-op message rather than an error — and, per the
existing `useScroll` precedent (`engine.ts:1064`, a no-effect read costs no turn),
we should decide whether a wasted dip still spends the potion and a turn (see Open
Questions).

### The coating / imbue model

Several useful outcomes want to put a *temporary* property on gear. Add an
optional per-item field so a coating travels with the specific weapon/armor
instance (the `weapons`/armor arrays already hold full `GearItem` objects, so this
is per-instance, unlike the `PotionType[]` potions list):

```ts
export interface GearCoating {
  source: PotionType;     // what it was dipped in
  kind: 'attack' | 'defense' | 'special';
  bonus: number;          // +atk or +def while the coating lasts
  hits?: number;          // consumed per attack (weapon coatings)
  turns?: number;         // OR time-based (armor coatings)
}

export interface GearItem {
  // ...existing fields...
  coating?: GearCoating;   // NEW, optional
}
```

Combat (`src/combat.ts`) and `getTotalDef` (`src/player.ts:44`) read `coating`
when present and decrement `hits`/`turns`, clearing it at zero. This is the same
shape of change the gear-health system made by adding `health?: GearHealth`, so it
fits the existing "optional field on `GearItem`, normalized on load" pattern.

## Starter Interaction Matrix (the four existing potions)

| Dip target → / Potion ↓ | Weapon | Armor / Shield | Food | Potion (other) |
|---|---|---|---|---|
| **Strength** | Coat: +atk for N hits ("the blade hums") | — (nothing) | Bless ration: eating also grants Strength | Mix → unstable (Open Q) |
| **Armor** | — (nothing) | Coat: +def for N turns ("a hard sheen") | — | Mix → unstable |
| **Healing** | — (nothing) | — | Bless ration: eating also heals | Dilute: weaker heal, **potion not consumed** |
| **Invisibility** | — (nothing) | Coat: brief stealth when worn (ties to Stealth ring/AI) | Bless ration: eat to turn invisible | Mix → unstable |

Notes on the starter set:

- **Weapon + Strength** and **Armor + Armor** produce `GearCoating`s — the most
  immediately gratifying, Rogue-legible outcomes ("I made my sword better for a
  fight"). Tune `hits`/`turns` and `bonus` via a `BALANCE.dip` block.
- **Food + any potion** produces a "blessed ration": store it as a small extension
  to the food model (today `inventory.food` is just a count). Minimal version:
  introduce a parallel `blessedFood: { effect: PotionType }[]` or upgrade food to
  objects. **This is the one starter outcome that needs a data-shape change beyond
  `coating`** — consider deferring food-dipping to Phase 2 to keep Phase 1 to the
  `coating`-only outcomes.
- **Healing into another potion → dilution**: the only rule with
  `consumesPotion: false` on the *dipped-into* potion but which downgrades the
  *target* potion (e.g. turns a strong potion weaker, or — expansion — turns a
  harmful one safe). Demonstrates that not every dip is consumptive.
- Empty cells use `DEFAULT_DIP_RULE` (no effect). Keeping most cells empty at first
  is deliberate — the framework matters more than exhaustive coverage, and empty
  cells are where expansion content lands.

## UI & Keyboard Parity

- **Inventory modal** (`src/ui/components/InventoryModal.svelte`): add a "Dip"
  action on dippable items, opening a **two-step selection** — pick the target,
  then pick which potion. Mirror the existing action-view plumbing
  (`InventoryActionView` / `PotionOption` in `src/ui/store.svelte.ts`).
- **Keyboard**: bind a dip command. NetHack uses `#dip`; a single key like `d`
  (if free in `src/keyboard.ts`) opens "dip what?" → "into which potion?". Every
  click path must have a key path (repo enforces parity — see other plans).
- **Tooltips**: a coated weapon/armor shows its coating (`+2 ATK • 5 hits`) in the
  same badge style gear health uses for `DEF 2/4`. Surface coatings in
  `equipmentStats`/`inventoryStats` so combat numbers reconcile.
- **Discoverability**: a one-line hint the first time the player hovers a potion +
  a dippable item, since dipping is non-obvious.

## Persistence (`src/persistence/savegame.ts`)

- Bump `VERSION` (currently `2`). **Coordinate with the rings and wands/staves
  plans** — all three touch save shape and the version. Prefer one combined bump if
  they ship together.
- Validate `coating` when present on any `GearItem` (known `source` potion type,
  numeric `bonus`, and at least one of `hits`/`turns`). Reject corrupt coatings the
  way typed scrolls are guarded (`savegame.ts:159`).
- Add a `normalizeCoatings(player)` pass alongside `normalizeAllGearHealth`
  (`savegame.ts:207`) that strips expired/invalid coatings on load.
- **Migration**: old saves have no `coating` (and no blessed food). `coating` is
  optional, so absence is valid; default any new food structure to empty.

## Phased Rollout

**Phase 1 — Dip framework + coating outcomes.** `DipRule`/`DipOutcome`/`DipResolved`
types, `DIP_RULES` registry, `DEFAULT_DIP_RULE`, engine `dipItem`, the `coating`
field + combat/def consumption, the two coating rules (Weapon+Strength,
Armor+Armor), UI two-step selection + keybinding, save bump/validate/migrate,
tests. No food/potion data-shape changes yet.

**Phase 2 — Consumable interactions.** Blessed food (requires upgrading the food
model) and potion-into-potion dilution/mixing. This is where the "is a wasted dip
consumed?" rule (Open Q) gets finalized.

**Phase 3 — Expansion content.** Fill more matrix cells; add **water/dilution** if
a Potion of Water is introduced; **poison coating** for thrown/ranged weapons once
a ranged system exists (the wands/staves plan is building targeting — coordinate);
**identify-by-dip** once an identification system exists (rings plan D2); cursed-
potion "bad dip" outcomes once curses exist.

## Testing Strategy

Colocated `*.test.ts`, matching repo style:

- **`dip.test.ts`** — rule resolution (right rule for `(target, potion)`,
  `DEFAULT_DIP_RULE` fallback), coating application and `hits`/`turns` decrement to
  removal, `consumesPotion` true vs. dilution false, stat recording.
- **`combat.test.ts`** — coated weapon adds `bonus` and consumes a `hit`; coating
  clears at zero; `getTotalDef` counts an armor coating and expires it.
- **engine tests** — `dipItem` guards missing target/potion, costs a turn,
  no-target message; sleep-turn guard via `takeSleepTurn` (`engine.ts:1024`).
- **`savegame.test.ts`** — round-trip a coated item; migrate a v2 save (no
  coatings) cleanly; reject a corrupt coating.

## Open Questions / Decisions

1. **Wasted dip cost**: does an empty-matrix dip still consume the potion and a
   turn, or is it a free no-op like a no-effect scroll read (`engine.ts:1064`)?
   Recommendation: it **costs a turn but not the potion** ("you dip it, nothing
   happens") so misclicks are not punishing but the action is real.
2. **Food model**: keep `inventory.food` as a count and add a parallel
   `blessedFood` list (smaller change), or upgrade food to objects with optional
   effects (cleaner long-term)? Defer to Phase 2.
3. **Coating duration semantics**: hits-based for weapons / turns-based for armor
   (recommended) vs. a single unified `turns` model?
4. **Stacking**: can you re-dip to refresh/replace a coating, or does an existing
   coating block a new one? Recommendation: re-dip replaces.
5. **Potion mixing**: is potion-into-potion in scope at all, and if so does it
   produce a defined result or a random/unstable one? (Random is more Rogue but
   harder to balance/test.)
6. Should dipping ever **identify** the potion (a classic NetHack signal)? Blocked
   on the identification system (rings plan D2).
