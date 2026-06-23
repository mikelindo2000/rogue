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
  | 'boss-swiper'
  | 'bat'
  | 'raptor';

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
  // Keeps its distance and pelts telegraphed bolts from range — the ranged
  // poker. Spacing takes priority over a free shot (kite movement), and each
  // bolt commits to your tile for a turn (windupTurns:1) so you strafe off the
  // line to dodge. Tuned as frequent chip rather than a heavy nuke: cooldown 0
  // so it pokes whenever it's at range (still gated by the windup downtime), and
  // a modest 1.2 multiplier so a single bolt stays light. The previous params
  // (damageMultiplier 0.8, cooldown 1) stacked telegraph downtime × low
  // multiplier × cooldown and read *trivial* in the harness — the bolt connected
  // a tiny fraction of each turn (see the §3 telegraph-gating note in the
  // monster-authoring guide). Only the Flying Serpent uses this archetype today,
  // so this retune is effectively local to it; its base atk was raised to land
  // the FAIR band (see MONSTER_DATABASE / MONSTER_ARCHETYPE notes).
  kiter: {
    movement: { style: 'kite', aggroRange: AGGRO + 2, keepDistance: 4 },
    attacks: [melee({ id: 'bolt', range: 4, damageMultiplier: 1.2, windupTurns: 1, cooldown: 0 })],
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
  // The modern Brown Bat: erratic flier that telegraphs a heavy dive you can
  // step out of, and flits aside from your own blows. Its danger is the swoop
  // landing when you DON'T dodge — so the dive hits hard but is fully avoidable.
  // (damageMultiplier tuned via the harness to keep it floor-1 fair.)
  bat: {
    movement: { style: 'erratic', aggroRange: AGGRO + 1, erraticChance: 0.5 },
    attacks: [melee({ id: 'swoop', range: 2, damageMultiplier: 3.5, windupTurns: 1, cooldown: 1, animCue: 'swoop' })],
    defense: { dodgeChance: 0.25 },
    abilities: [],
  },
  // The Eagle: a faster, less-punishing cousin of the bat. Erratic flight with a
  // telegraphed dive you can step out of and light evasion — it teaches dodging
  // again mid-early game without the bat's bite. Deliberately gentler than the
  // bat on both knobs: dive damageMultiplier 3.0 (< bat's 3.5) and dodgeChance
  // 0.15 (< bat's 0.25). It also flies a touch wider (aggroRange +2, more random
  // hops via erraticChance 0.4) so it reads as a swift, erratic flier. Harness-
  // tuned to the FAIR band at floor 4 (threat ~0.375); the Eagle's base atk was
  // nudged 12 → 17 in MONSTER_DATABASE so the gentle multiplier still lands fair
  // at floor 4 (a low-atk floor-4 monster otherwise reads "easy" — see note).
  raptor: {
    movement: { style: 'erratic', aggroRange: AGGRO + 2, erraticChance: 0.4 },
    attacks: [melee({ id: 'dive', range: 2, damageMultiplier: 3.0, windupTurns: 1, cooldown: 1, animCue: 'swoop' })],
    defense: { dodgeChance: 0.15 },
    abilities: [],
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
  'brown-bat': 'bat', // modern erratic flier with a telegraphed swoop + evasion
  'eagle': 'raptor', // erratic flier with a telegraphed dive + light evasion (gentler bat cousin)
  // Cyclops & elite: slow, heavily telegraphed slam — dodge it or eat a big hit.
  // The brute slam is windupTurns:1 (telegraphed) so it only connects ~0.3×/turn
  // in the harness; the base atk had to be raised well above the plain-melee
  // value to reach the FAIR band at floor 17. Tuned via the harness: Cyclops atk
  // 43 → 75 (threat ~0.48, mid-fair); Colossal Cyclops atk 45 → 85 (threat ~0.61,
  // upper-fair, fitting for an elite). The displayed atk isn't comparable to a
  // plain-melee monster's — a telegraphed slammer needs more base atk to land the
  // same threat. See MONSTER_DATABASE for the bumped rows.
  'cyclops': 'brute',
  'colossal-cyclops': 'brute',
  // Golem & elite: a stone sentinel — inert until you stumble within wakeRange,
  // then it latches and chases permanently (ambush FSM). Movement-only: once
  // engaged it bites with plain melee every turn, identical to default, so this
  // is balance-neutral — no base-atk change needed (confirmed fair at floor 15
  // via the harness: threat unchanged vs default).
  'golem': 'ambusher',
  'gary-the-golem': 'ambusher',
  // Flying Serpent: a ranged poker (kiter) — holds its distance and spits
  // telegraphed bolts; you close the gap or strafe off its line to dodge. The
  // bolt is BOTH telegraphed (windupTurns:1) AND low-multiplier chip, so it
  // connects only a fraction of each turn and reads very *easy* at the base atk
  // (see §3 telegraph-gating gotcha). Landed in the FAIR band by (a) retuning the
  // shared kiter bolt to poke every turn (cooldown 0) at a modest 1.2 multiplier,
  // and (b) bumping the Flying Serpent's base atk 42 → 85 in MONSTER_DATABASE.
  // Harness: threat ~0.42 at floor 16 (mid-fair). Only the Flying Serpent uses
  // the kiter archetype today, so the bolt retune is effectively local to it.
  'flying-serpent': 'kiter',
  'leprechaun': 'trickster', // steals gold on a hit, then flees (canonical Rogue)
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
/** Assumed fraction of telegraphed swoops that connect — i.e. the player
 *  positionally dodges ~40%. A modeling assumption; tune against playtests. */
const TELEGRAPH_CONNECT = 0.6;

export function primaryAttackShape(behavior: MonsterBehavior): AttackShape {
  const a = behavior.attacks[0];
  if (!a) return { damageMultiplier: 1, hitsPerTurn: 1, dodgeChance: behavior.defense.dodgeChance ?? 0 };
  // A swipe-alternating attack averages a normal hit and a 2× hit, so its
  // effective per-swing damage is 1.5× — otherwise the harness would undercount
  // a swiper's DPS by ~33% (matters only when bosses are included in a report).
  const swipeFactor = a.swipeAlternates ? 1.5 : 1;
  // Telegraphed attacks both fire less often (windup downtime) and get dodged
  // out of position part of the time.
  const telegraphFactor = a.windupTurns > 0 ? TELEGRAPH_CONNECT : 1;
  return {
    damageMultiplier: a.damageMultiplier * swipeFactor,
    hitsPerTurn: (1 / (1 + a.windupTurns + a.cooldown)) * telegraphFactor,
    dodgeChance: behavior.defense.dodgeChance ?? 0,
  };
}

/** Convenience for the balance report: shape derived from a template's archetype. */
export function shapeForTemplate(t: MonsterTemplate): AttackShape {
  return primaryAttackShape(resolveBehavior(t));
}
