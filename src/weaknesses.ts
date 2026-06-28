/* Per-monster WEAKNESSES — the GM sheet's "Weakness" column, as DATA.
 *
 * Mirrors the abilities/drops layers' philosophy (`MONSTER_ABILITIES` in
 * src/ai/archetypes.ts, `MONSTER_DROPS` in src/drops.ts): one table keyed by
 * `monsterId`, one engine hook (the weakness-bonus block in `executeStrike`,
 * engine.ts), one bestiary description path (`monsterWeakness` →
 * `describeWeakness`). A weakness is data, not bespoke code.
 *
 * Phase 1 (see design/planning/weapon_expansion_and_weaknesses_plan.md):
 *  - SCOPE: the "+N damage" portion only. When the player hits a monster with
 *    the weapon/magic CLASS it is weak to, the blow deals `bonusDamage` extra.
 *  - Bespoke weakness EFFECTS (instant-kill, incapacitate, disable-ability,
 *    sever-horns, immobilize) are DEFERRED — tracked in td-44f2d8 — exactly like
 *    the ability/drop procs were. Only the bonus damage + the bestiary line ship
 *    now.
 *  - The bonus draws NO rng: it is a deterministic equipment comparison, so
 *    seeded play is unchanged.
 *
 * SKIPPED (no clean weapon/magic mapping — deferred, do NOT add):
 *  - pygmy: "Shield" weakness (no shield-as-offense class).
 *  - kalius-king-cobra: "Magic Staffs" reads as a player benefit, not a damage
 *    weakness.
 *  - trogdor-the-troll: "Critical Strikes" is a crit-mechanic, not a class.
 */

import type { WeaponType, StaffMagic } from './types';

export interface MonsterWeakness {
  /** Extra damage when countered (sheet "+N dmg"). */
  bonusDamage: number;
  /** Sheet phrasing ("Axes", "Fire Magic") for the bestiary line. */
  label: string;
  /** Weapon types that counter, e.g. ['1h_axe','2h_axe'] for "Axes". */
  weaponTypes?: WeaponType[];
  /** Magic school that counters when an equipped staff matches, e.g. 'fire'. */
  magic?: StaffMagic;
  /** Dragon King: any equipped weapon counters. */
  allWeapons?: boolean;
}

export const MONSTER_WEAKNESSES: Record<string, MonsterWeakness> = {
  apperation: { bonusDamage: 12, label: 'Fire Magic', magic: 'fire' },
  'brown-bat': { bonusDamage: 2, label: 'Maces', weaponTypes: ['1h_mace', '2h_mace'] },
  cyclops: { bonusDamage: 8, label: 'Daggers & Polearms', weaponTypes: ['dagger', 'polearm'] },
  dragon: { bonusDamage: 12, label: '1H Swords', weaponTypes: ['1h_sword'] },
  eagle: { bonusDamage: 3, label: 'Bow', weaponTypes: ['bow'] },
  'flying-serpent': { bonusDamage: 3, label: 'Bow', weaponTypes: ['bow'] },
  golem: { bonusDamage: 8, label: 'Fire Magic', magic: 'fire' },
  hobgoblin: { bonusDamage: 3, label: '2H Sword', weaponTypes: ['2h_sword'] },
  'indus-worm': { bonusDamage: 5, label: 'Frost Magic', magic: 'frost' },
  'jungle-flesheater': { bonusDamage: 3, label: 'Fire Magic', magic: 'fire' },
  'king-cobra': { bonusDamage: 6, label: '2H Mace', weaponTypes: ['2h_mace'] },
  leprechaun: { bonusDamage: 5, label: 'Swords & Daggers', weaponTypes: ['1h_sword', 'dagger'] },
  minotaur: { bonusDamage: 5, label: 'Blunderbuss', weaponTypes: ['blunderbuss'] },
  nymph: { bonusDamage: 6, label: 'Arcane Magic', magic: 'arcane' },
  orc: { bonusDamage: 3, label: '2H Mace', weaponTypes: ['2h_mace'] },
  quinotaur: { bonusDamage: 8, label: '2H Sword', weaponTypes: ['2h_sword'] },
  'rabid-ostrich': { bonusDamage: 15, label: 'Daggers & 1H Swords', weaponTypes: ['dagger', '1h_sword'] },
  snake: { bonusDamage: 4, label: '2H Axe', weaponTypes: ['2h_axe'] },
  troll: { bonusDamage: 7, label: '1H Axe', weaponTypes: ['1h_axe'] },
  unicorn: { bonusDamage: 6, label: 'Shadow Magic', magic: 'shadow' },
  xelhua: { bonusDamage: 8, label: 'Swords', weaponTypes: ['1h_sword', '2h_sword'] },
  yeti: { bonusDamage: 7, label: 'Fire Magic', magic: 'fire' },
  zombie: { bonusDamage: 8, label: 'Axes', weaponTypes: ['1h_axe', '2h_axe'] },
  'pantier-pygmy-king': { bonusDamage: 8, label: '2H Mace', weaponTypes: ['2h_mace'] },
  'michael-the-minotaur': { bonusDamage: 8, label: 'Daggers', weaponTypes: ['dagger'] },
  'gary-the-golem': { bonusDamage: 8, label: 'Shadow Magic', magic: 'shadow' },
  'colossal-cyclops': { bonusDamage: 8, label: 'Daggers & 1H Swords', weaponTypes: ['dagger', '1h_sword'] },
  'zachary-the-zombie': { bonusDamage: 8, label: 'Polearms & Ranged', weaponTypes: ['polearm', 'bow', 'blunderbuss'] },
  'agitated-apperation': { bonusDamage: 8, label: 'Frost Magic', magic: 'frost' },
  'dragon-king': { bonusDamage: 20, label: 'All weapons', allWeapons: true },
};

/** A player-facing description of one weakness, for the bestiary "Weakness"
 *  section. Mirrors `DropDescription` from drops.ts. */
export interface WeaknessDescription {
  /** Sheet phrasing, e.g. "Fire Magic". */
  label: string;
  /** Bonus damage as a "+N dmg" string. */
  bonus: string;
}

/** Turn one `MonsterWeakness` into a player-facing description. */
export function describeWeakness(w: MonsterWeakness): WeaknessDescription {
  return {
    label: w.label,
    bonus: `+${w.bonusDamage} dmg`,
  };
}

/** The described weakness for a monster id, or null when it has none (the
 *  bestiary then omits the section). */
export function monsterWeakness(id: string): WeaknessDescription | null {
  const w = MONSTER_WEAKNESSES[id];
  return w ? describeWeakness(w) : null;
}

/** The resolved weakness bonus for a blow, given the monster's weakness row and
 *  the weapon used. Returns 0 when there is no weakness or the weapon does not
 *  counter. Deterministic — draws no rng. The engine adds this on top of the
 *  base strike damage. */
export function weaknessBonus(
  weakness: MonsterWeakness | undefined,
  weapon: { type?: WeaponType; magic?: StaffMagic } | undefined,
): number {
  if (!weakness || !weapon) return 0;
  // "All weapons" (Dragon King): any equipped weapon (anything with a type)
  // counters.
  if (weakness.allWeapons && weapon.type) return weakness.bonusDamage;
  // Weapon-type match (e.g. an axe vs the zombie).
  if (weapon.type && weakness.weaponTypes?.includes(weapon.type)) return weakness.bonusDamage;
  // Magic match: an equipped staff of the countering school.
  if (weakness.magic && weapon.type === 'staff' && weapon.magic === weakness.magic) {
    return weakness.bonusDamage;
  }
  return 0;
}
