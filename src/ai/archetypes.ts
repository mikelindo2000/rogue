/* Archetype registry — reusable behavior presets a monster references by name.
 *
 * Authoring a monster's AI is "pick an archetype (+ optional overrides)", never
 * "write engine code". The `default` archetype reproduces the legacy
 * chase-and-bite exactly, so any monster left unassigned plays as it always has.
 *
 * Live assignments are intentionally conservative right now: only movement-only
 * archetypes are wired to real monsters (zero combat/balance change). The
 * combat-affecting archetypes (brute/kiter/trickster) are defined and unit-
 * tested, ready to enable once their balance impact is reviewed via the harness.
 */

import { BALANCE } from '../config';
import { monsterId } from '../discovery';
import type { MonsterTemplate } from '../types';
import type { AttackSpec, MonsterBehavior } from './types';
import type { AttackShape } from './balance';

const AGGRO = BALANCE.monster.aggroRange;

const melee = (over: Partial<AttackSpec> = {}): AttackSpec => ({
  id: 'melee',
  range: 1,
  damageMultiplier: 1,
  windupTurns: 0,
  cooldown: 0,
  weight: 1,
  ...over,
});

export type ArchetypeId =
  | 'default'
  | 'skirmisher'
  | 'ambusher'
  | 'brute'
  | 'kiter'
  | 'trickster'
  | 'boss-swiper';

export const ARCHETYPES: Record<ArchetypeId, Omit<MonsterBehavior, 'id'>> = {
  // Stationary until the player is within aggro, then beeline + bite. Legacy.
  default: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Erratic flight — wobbles toward the player rather than tracking perfectly.
  // Movement-only: once adjacent it bites every turn like anything else, so it
  // does not shift combat balance.
  skirmisher: {
    movement: { style: 'erratic', aggroRange: AGGRO + 1, erraticChance: 0.5 },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Holds perfectly still until you stumble close, then commits.
  ambusher: {
    movement: { style: 'ambush', aggroRange: AGGRO, wakeRange: 3 },
    attacks: [melee()],
    defense: {},
    abilities: [],
  },
  // Slow, telegraphed heavy hitter — more damage per swing, fewer swings.
  brute: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee({ id: 'slam', damageMultiplier: 1.6, windupTurns: 1 })],
    defense: {},
    abilities: [],
  },
  // Keeps its distance and pelts from range.
  kiter: {
    movement: { style: 'kite', aggroRange: AGGRO + 2, keepDistance: 4 },
    attacks: [melee({ id: 'bolt', range: 4, damageMultiplier: 0.8, windupTurns: 1, cooldown: 1 })],
    defense: {},
    abilities: [],
  },
  // Steals gold on a hit, then bolts — the Rogue leprechaun/nymph.
  trickster: {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee()],
    defense: { fleeBelowHpPct: 0.5 },
    abilities: [{ id: 'stealGold', chance: 0.7, magnitude: 50, cooldown: 0, trigger: 'onHit', thenFlee: true }],
  },
  // Marcus the Brave: chase-and-bite, but every other swing is a double-damage
  // swipe. Reproduces the old name-special as data.
  'boss-swiper': {
    movement: { style: 'hunt', aggroRange: AGGRO },
    attacks: [melee({ id: 'swipe', swipeAlternates: true })],
    defense: {},
    abilities: [],
  },
};

/**
 * Live archetype assignments by monster id. Empty = everything plays as legacy.
 * Only movement-only archetypes here so this change is balance-neutral; add
 * combat-affecting ones after checking the balance report.
 */
export const MONSTER_ARCHETYPE: Record<string, ArchetypeId> = {
  'brown-bat': 'skirmisher',
  'eagle': 'skirmisher',
  // Preserve Marcus the Brave's signature swipe (was a name-special in the engine).
  'marcus-the-brave': 'boss-swiper',
};

const resolved = new Map<string, MonsterBehavior>();

/** The resolved behavior for a monster template (memoized). Falls back to the
 *  `default` archetype, which reproduces legacy behavior. */
export function resolveBehavior(template: { id?: string; name: string }): MonsterBehavior {
  const id = monsterId(template);
  let b = resolved.get(id);
  if (!b) {
    const archetype = MONSTER_ARCHETYPE[id] ?? 'default';
    b = { id: archetype, ...ARCHETYPES[archetype] };
    resolved.set(id, b);
  }
  return b;
}

/** The archetype id a monster would resolve to (for tooling/reports). */
export function archetypeOf(template: { id?: string; name: string }): ArchetypeId {
  return MONSTER_ARCHETYPE[monsterId(template)] ?? 'default';
}

/**
 * Reduce a behavior to the combat "shape" the balance harness consumes: the
 * primary attack's damage multiplier and its effective swings-per-turn after
 * windup + cooldown. This is the bridge that lets the balancer see a brute as
 * hard-hitting-but-slow and a kiter as chip damage.
 */
export function primaryAttackShape(behavior: MonsterBehavior): AttackShape {
  const a = behavior.attacks[0];
  if (!a) return { damageMultiplier: 1, hitsPerTurn: 1 };
  // A swipe-alternating attack averages a normal hit and a 2× hit, so its
  // effective per-swing damage is 1.5× — otherwise the harness would undercount
  // a swiper's DPS by ~33% (matters only when bosses are included in a report).
  const swipeFactor = a.swipeAlternates ? 1.5 : 1;
  return {
    damageMultiplier: a.damageMultiplier * swipeFactor,
    hitsPerTurn: 1 / (1 + a.windupTurns + a.cooldown),
  };
}

/** Convenience for the balance report: shape derived from a template's archetype. */
export function shapeForTemplate(t: MonsterTemplate): AttackShape {
  return primaryAttackShape(resolveBehavior(t));
}
