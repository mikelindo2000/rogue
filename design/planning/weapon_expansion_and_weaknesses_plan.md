# Weapon-Class Expansion + Monster Weaknesses

The GM sheet's **Weakness** column counters each monster with a weapon or magic *class* (e.g.
"2H Mace +3", "Fire Magic +12", "Bow/Arrow +3"). Many referenced classes don't exist in the game,
so — per the user — we **expand the weapon classes first** (the prereq), then add weaknesses as
data on top, faithfully.

Two phases, sequenced:
- **Phase 0 — Weapon-class expansion** (prereq): add the missing weapon types + magic school.
- **Phase 1 — Weaknesses**: per-monster weakness → bonus damage when the player attacks with the
  countering class. Bespoke weakness *effects* (sever horns, instant-kill chance, incapacitate)
  are deferred like the ability/drop procs were.

---

## Current weapon system (what we build on)

| Concern | Where |
| --- | --- |
| Weapon types | `types.ts` `WeaponType = 'dagger' \| '1h_sword' \| '2h_sword' \| '1h_mace' \| '2h_mace' \| 'staff'` |
| Magic schools | `types.ts` `StaffMagic = 'fire' \| 'frost' \| 'arcane'` |
| Item shape | `GearItem { dmg?, type?: WeaponType, magic?: StaffMagic, category? }` |
| Weapon pool | `config.ts` `GEAR_POOL` (dagger/1h_sword/2h_sword/1h_mace/2h_mace/staff), 3 tiers each, `BALANCE.loot.tierMinFloor` |
| Loot roll | `items.ts` `generateGearItem` → `rng.pick(Object.keys(GEAR_POOL))` — **any new category auto-enters the loot pool** |
| Two-handed | `player.ts` `isTwoHanded` = `type.startsWith('2h_') \|\| type === 'staff'` (clears off-hand) |
| Combat | `combat.ts` `computeStrike({ weapon, ... })` uses `weapon.dmg` + `weapon.type`/`magic` |
| Dual-wield | `offHand` can hold `weapon:N` (already supported) |

**Scattered weapon detection (must be centralized):** weapon-vs-armor is decided ad-hoc, e.g.
`engine.ts:2203` `category.includes('sword') \|\| category.includes('mace') \|\| === 'dagger' \|\| === 'staff'`.
New categories (bow/polearm/axe/blunderbuss) would be misclassified as armor. **Phase 0 must add a
single `isWeaponCategory(cat)` / `weaponSymbol(cat)` helper** and route all such sites through it.

---

## Phase 0 — Weapon-class expansion

### New classes (from the sheet's Weakness + Drop columns)

- **Weapon types** (add to `WeaponType`): `bow`, `polearm`, `1h_axe`, `2h_axe`, `blunderbuss`.
- **Magic school** (add to `StaffMagic`): `shadow`.

### Scope decision — ranged is flavor, not mechanic (Phase 0)

Bows and blunderbusses are conceptually ranged, but implementing **ranged player attacks is a large
separate feature**. In Phase 0 they're **melee weapons mechanically** (equip, swing, `dmg`) — the
ranged identity is flavor. A future "ranged player weapons" phase can add the firing mechanic. This
keeps the expansion tractable and is the right cut.

### Two-handedness

`bow`, `polearm`, `2h_axe`, `blunderbuss` → **two-handed** (extend `isTwoHanded`: add a
`TWO_HANDED` set instead of the `2h_`-prefix string check, so `bow`/`polearm`/`blunderbuss` are
covered without an awkward rename). `1h_axe` is one-handed (can dual-wield / pair a shield).

### GEAR_POOL entries (3 tiers each, tier-matched to existing weapons — balance-neutral)

Add pools mirroring the existing dmg curve so loot stays balanced (e.g. 1h_axe ≈ 1h_sword curve,
2h_axe ≈ 2h_sword, polearm ≈ 2h between, bow ≈ dagger/1h, blunderbuss ≈ 2h burst). Add a fourth
staff to the `staff` pool: a **Shadow Staff** (`magic: 'shadow'`). Named, flavorful items.

> **Balance note:** adding 5 weapon categories *dilutes* the per-category loot roll (each category is
> picked less often) and adds variety, but every new item is **tier-matched** to an existing one, so
> no item is stronger than what already drops. `MONSTER_DATABASE` is untouched. The dilution is a
> mild loot-variety change — flag it; if undesired, the new weapons can be added to a separate
> "weapon-only" sub-pool rather than the flat category list.

### Integration checklist

1. `types.ts` — extend `WeaponType` + `StaffMagic`.
2. `config.ts` `GEAR_POOL` — new weapon pools + Shadow Staff; check `tierMinFloor` still fits.
3. **Centralize weapon detection** — new `isWeaponCategory` / `weaponSymbol` helper; replace the
   scattered `category.includes(...)` checks (engine.ts drop spawn, inventory build, anywhere a
   weapon vs armor symbol/slot is decided).
4. `player.ts` — `isTwoHanded` via a `TWO_HANDED` set covering the new 2H types.
5. Visuals — weapon floor glyph `)` + a per-type tint if the game tints weapons (check
   `itemVisuals.ts` / the renderer); axes/bows/polearms get sensible glyphs/colors.
6. Combat — no change needed for melee (uses `weapon.dmg`); confirm `shadow` magic has a sensible
   `computeStrike` branch (or no special branch = plain melee staff, like arcane's heal is special).
   Decide shadow's on-hit (Phase 0 can leave it plain; a shadow effect is a later enhancement).
7. Tests — the new types are valid `WeaponType`s; a generated item in each new category equips,
   respects two-handedness, and deals its `dmg`; loot can roll them.

---

## Phase 1 — Weaknesses

### Data model

```ts
// weaknesses.ts (new), keyed by monsterId like MONSTER_ABILITIES/MONSTER_DROPS
export interface MonsterWeakness {
  bonusDamage: number;                 // extra damage when countered (sheet "+N dmg")
  weaponTypes?: WeaponType[];          // e.g. ['1h_axe','2h_axe'] for "Axes"
  magic?: StaffMagic;                  // e.g. 'fire' for "Fire Magic"
  label: string;                       // sheet phrasing ("Axes", "Fire Magic") for the bestiary
}
export const MONSTER_WEAKNESSES: Record<string, MonsterWeakness> = { ... }
```

### Read site

In the **player→monster** attack path (engine.ts, around the `computeStrike` call ~L1087): after
the base strike, check the player's equipped weapon against `MONSTER_WEAKNESSES[monsterId(target)]`:
- weapon `type` ∈ `weaponTypes`, or equipped staff `magic === weakness.magic` → add `bonusDamage`
  to the blow, log `"<weapon class> is super effective! +N"`, and surface a float.
- Keep `combat.ts` pure: the engine resolves the weakness bonus and passes/adds it (mirror how
  `disarmed`/`strengthDrained` are resolved by the engine, not in `computeStrike`).
- "All weapons" (Dragon King) → applies to any weapon; "Dual wield swords or daggers" (Leprechaun)
  → check both hands hold a sword/dagger; "Magic Staffs" (Kalius) → any `staff` type.

### Sheet → data mapping (Phase 1 = bonus damage only; bespoke effects deferred)

Most weaknesses give "+N dmg" — pure data. The ones with **special effects** (Quinotaur "slices
horns → no Horn Twist", Snake "incapacitate 2 turns", Zombie "25% instant kill", Golem "immobilize",
Trogdor "Critical Strikes incapacitate") map their *damage* portion now; the **effect** portion is a
Phase-2 follow-up (a tracked task), exactly like ability/drop procs. Weaknesses with no damage number
(disable-an-ability ones) get a small default bonus + the effect deferred.

### Bestiary

Add a **"Weakness"** line to `MonsterDetail` (mirror Abilities/Drops), from `MONSTER_WEAKNESSES`
(`describeWeakness` → label + "+N dmg"). Data-available for future enhancement.

### Tests

`weaknesses.test.ts` (weapon-type match → bonus; magic match → bonus; non-matching weapon → no
bonus; sibling with no weakness → nothing) + an engine-level test (attacking a weak monster with the
countering weapon deals more than with a non-countering one) + `describeWeakness` unit tests.

---

## Phasing & follow-ups

1. **Phase 0 — weapon expansion** (this is the prereq the user asked for; do it first, its own
   workflow). Ships new equippable weapon classes + shadow magic, balance-tier-matched.
2. **Phase 1 — weaknesses** (bonus damage + bestiary line), built on Phase 0.
3. **Deferred (own tasks):** ranged player attacks (bow/blunderbuss firing); bespoke weakness
   *effects* (disable-ability/incapacitate/instant-kill); a shadow-magic on-hit effect.

## Decisions (resolved — balance-safe)

1. **Loot composition stays balance-neutral.** A flat pool would push weapons from ~50% to ~65% of
   drops (a loot-balance change). Instead, **refactor `generateGearItem` to preserve the current
   weapon-vs-armor pick ratio**: pick group (weapon | armor) at today's probability (6 weapon / 6
   armor ⇒ 50/50), then pick a category within the group. Adding weapon categories then changes
   *which* weapon drops, never *how often a weapon vs. armor* drops. `MONSTER_DATABASE` untouched;
   loot economy unchanged. (Keep `generateGearItemInCategory` for fixed-category drops as-is.)
2. **No-number weaknesses get a modest default bonus** (so the counter *reads* as effective now),
   with the bespoke effect deferred. Default ≈ a small tier-appropriate value (e.g. +3 low floors,
   scaling with the monster's depth band); tune in playtest.
