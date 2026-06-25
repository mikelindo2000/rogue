/* Balance harness — turns the combat model into actionable balance data.
 *
 * Three capabilities:
 *   1. A *reference player curve*: a parameterized model of how strong the
 *      player is expected to be on each floor. This is an explicit, tunable
 *      design assumption (NOT measured ground truth) — every number is named so
 *      it can be re-pointed as the real game's power curve becomes known.
 *   2. A per-monster difficulty report: threat + Monte-Carlo win-rate for each
 *      monster against the reference player at the floor it first appears,
 *      classified against a target band.
 *   3. An auto-balancer: because threat is monotonic in monster attack, a heavy
 *      monster's damage multiplier can be found by bisection to hit a target
 *      threat exactly — deterministic, convergent, no search heuristics.
 */

import { MONSTER_DATABASE } from '../config';
import { getScaledMonsterHP, getScaledMonsterAtk } from '../config';
import type { MonsterTemplate } from '../types';
import {
  analyzeDuel,
  estimateWinRate,
  type PlayerCombat,
  type MonsterCombat,
  type DuelAnalysis,
  type WinRateEstimate,
} from './sim';
import { clamp } from './stats';

// ---------------------------------------------------------------------------
// Reference player power curve (design assumption — tune freely).
// ---------------------------------------------------------------------------

export interface ReferenceCurve {
  /** Player max HP at level 1 and the per-level multiplier (matches the engine
   *  level-up: maxHp *= levelUpHpMultiplier). */
  baseHp: number;
  hpGrowth: number;
  /** Player base attack (the engine keeps this constant; weapons add on top). */
  baseAtk: number;
  /** Expected weapon damage at floor 1 → maxFloor (gear tiers improve linearly). */
  startWeaponDmg: number;
  endWeaponDmg: number;
  /** Expected total defense at floor 1 → maxFloor (armor improves linearly). */
  startDef: number;
  endDef: number;
  /** Strikes/turn assumed for the reference player (1 = single weapon). */
  attacksPerTurn: number;
  maxFloor: number;
}

/** The default reference curve.
 *
 *  CALIBRATED to the full-run Monte-Carlo (src/ai/run.ts, 400 runs, June 2026) —
 *  i.e. what the real loot/XP generators actually hand a greedy-equip player, not
 *  a hand-guessed ramp. The earlier guess (weaponDmg 2→22, def 0→22, hpGrowth
 *  1.15 with level≈floor) was wildly pessimistic on gear and optimistic on HP; it
 *  graded every monster against a strawman. The measured reality:
 *    - gear is FAR stronger: atk ≈ 14→80, def ≈ 7→171 over 20 floors,
 *    - but the player is badly UNDER-LEVELLED: only ≈ lvl 5 / 56 HP by floor 20,
 *      so HP barely grows (hpGrowth retuned to reproduce the measured 30→56;
 *      level≈floor is kept as a harmless fiction — only maxHp reads it).
 *  Real atk/def are mildly convex (midgame a touch softer than this linear fit);
 *  floors 17-20 are survivorship-biased high. Re-run run.ts and re-point these as
 *  the game changes. These remain deliberate, adjustable knobs. */
export const DEFAULT_CURVE: ReferenceCurve = {
  baseHp: 30,
  hpGrowth: 1.033,
  baseAtk: 2,
  startWeaponDmg: 12,
  endWeaponDmg: 78,
  startDef: 7,
  endDef: 171,
  attacksPerTurn: 1,
  maxFloor: 20,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Model the player's combat profile on a given floor under a reference curve.
 *  Level tracks floor 1:1 here — a simplifying assumption, not a hard rule. */
export function expectedPlayerAtFloor(floor: number, curve: ReferenceCurve = DEFAULT_CURVE): PlayerCombat {
  const f = clamp(floor, 1, curve.maxFloor);
  const level = Math.round(f);
  const maxHp = Math.round(curve.baseHp * Math.pow(curve.hpGrowth, level - 1));
  const t = curve.maxFloor > 1 ? (f - 1) / (curve.maxFloor - 1) : 0;
  return {
    maxHp,
    baseAtk: curve.baseAtk,
    weaponDmg: Math.round(lerp(curve.startWeaponDmg, curve.endWeaponDmg, t)),
    strengthActive: false,
    def: Math.round(lerp(curve.startDef, curve.endDef, t)),
    attacksPerTurn: curve.attacksPerTurn,
  };
}

/** Optional per-attack combat shape (from a behavior profile). Defaults to
 *  plain every-turn melee at full damage. */
export interface AttackShape {
  damageMultiplier: number;
  hitsPerTurn: number;
  /** Monster evasion (chance to dodge a player strike). */
  dodgeChance?: number;
}

export const PLAIN_MELEE: AttackShape = { damageMultiplier: 1, hitsPerTurn: 1, dodgeChance: 0 };

/** Build a monster's combat profile from its template, applying the live HP/ATK
 *  tunables so the report reflects the player's actual experience.
 *
 *  The attack's damage multiplier is folded into the scaled attack in the SAME
 *  order the engine uses — `getScaledMonsterAtk(round(rawAtk·mult))` — so the
 *  report is bit-exact for combat-affecting archetypes, not just plain melee.
 *  (The resulting profile carries damageMultiplier 1; the multiplier is already
 *  baked into `atk`.) */
export function monsterCombatFromTemplate(
  t: MonsterTemplate,
  shape: AttackShape = PLAIN_MELEE,
): MonsterCombat {
  return {
    hp: getScaledMonsterHP(t.hp, t.name),
    atk: getScaledMonsterAtk(Math.max(1, Math.round(t.atk * shape.damageMultiplier))),
    damageMultiplier: 1,
    hitsPerTurn: shape.hitsPerTurn,
    dodgeChance: shape.dodgeChance ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Difficulty classification.
// ---------------------------------------------------------------------------

export type Difficulty = 'trivial' | 'easy' | 'fair' | 'hard' | 'lethal';

export interface DifficultyBands {
  trivial: number; // threat below this → trivial
  easy: number;
  /** [easy, hardUpper) is the "fair" target band. */
  hardUpper: number;
  lethal: number; // threat at/above this → lethal (loses on average)
}

export const DEFAULT_BANDS: DifficultyBands = {
  trivial: 0.1,
  easy: 0.35,
  hardUpper: 0.7,
  lethal: 1.0,
};

export function classifyThreat(threat: number, bands: DifficultyBands = DEFAULT_BANDS): Difficulty {
  if (threat < bands.trivial) return 'trivial';
  if (threat < bands.easy) return 'easy';
  if (threat < bands.hardUpper) return 'fair';
  if (threat < bands.lethal) return 'hard';
  return 'lethal';
}

export interface MonsterBalance {
  id: string;
  name: string;
  floor: number;
  monster: MonsterCombat;
  player: PlayerCombat;
  analysis: DuelAnalysis;
  winRate: WinRateEstimate;
  difficulty: Difficulty;
  /** True when threat sits outside the [easy, hardUpper) target band. */
  flagged: boolean;
}

export interface BalanceOptions {
  curve?: ReferenceCurve;
  bands?: DifficultyBands;
  /** Monte-Carlo trials per monster (0 skips MC for a fast analytic-only pass). */
  trials?: number;
  shapeFor?: (t: MonsterTemplate) => AttackShape;
}

/** Full difficulty report for one monster template. */
export function analyzeMonster(t: MonsterTemplate, opts: BalanceOptions = {}): MonsterBalance {
  const curve = opts.curve ?? DEFAULT_CURVE;
  const bands = opts.bands ?? DEFAULT_BANDS;
  const trials = opts.trials ?? 300;
  const shape = opts.shapeFor?.(t) ?? PLAIN_MELEE;

  const player = expectedPlayerAtFloor(t.minFloor, curve);
  const monster = monsterCombatFromTemplate(t, shape);
  const analysis = analyzeDuel(player, monster);
  const winRate =
    trials > 0
      ? estimateWinRate(player, monster, trials)
      : ({ winRate: { point: NaN, lower: NaN, upper: NaN }, trials: 0, meanTtk: NaN, medianTtk: NaN, p90Ttk: NaN, meanPlayerHpLeft: NaN } as WinRateEstimate);

  const difficulty = classifyThreat(analysis.threat, bands);
  const flagged = analysis.threat < bands.easy || analysis.threat >= bands.hardUpper;

  return {
    id: t.id ?? t.name,
    name: t.name,
    floor: t.minFloor,
    monster,
    player,
    analysis,
    winRate,
    difficulty,
    flagged,
  };
}

/** Report across the whole bestiary (bosses excluded by default — they're meant
 *  to be outliers). */
export function balanceReport(
  opts: BalanceOptions & { includeBosses?: boolean } = {},
): MonsterBalance[] {
  return MONSTER_DATABASE.filter((t) => opts.includeBosses || t.special !== 'boss').map((t) =>
    analyzeMonster(t, opts),
  );
}

export interface CurveReport {
  /** Mean threat of the monsters first appearing on each floor. */
  byFloor: Array<{ floor: number; meanThreat: number; count: number }>;
  /** Monsters whose threat falls outside the target band. */
  flagged: MonsterBalance[];
  /** Largest jump in mean threat between consecutive populated floors — a proxy
   *  for difficulty spikes. Lower is smoother. */
  maxFloorJump: number;
  /** Fraction of monsters inside the target band (0..1). Higher is better. */
  inBandFraction: number;
}

/** Aggregate the per-monster report into a difficulty-curve health check. */
export function curveReport(opts: BalanceOptions & { includeBosses?: boolean } = {}): CurveReport {
  const report = balanceReport(opts);
  const floors = new Map<number, number[]>();
  for (const r of report) {
    const arr = floors.get(r.floor) ?? [];
    arr.push(r.analysis.threat);
    floors.set(r.floor, arr);
  }
  const byFloor = [...floors.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, threats]) => ({
      floor,
      meanThreat: threats.reduce((s, x) => s + x, 0) / threats.length,
      count: threats.length,
    }));

  let maxFloorJump = 0;
  for (let i = 1; i < byFloor.length; i++) {
    maxFloorJump = Math.max(maxFloorJump, Math.abs(byFloor[i].meanThreat - byFloor[i - 1].meanThreat));
  }
  const flagged = report.filter((r) => r.flagged);
  return {
    byFloor,
    flagged,
    maxFloorJump,
    inBandFraction: report.length ? 1 - flagged.length / report.length : 1,
  };
}

/**
 * Render a balance report as a plain-text table — handy for a dev panel, a CI
 * artifact, or a one-off console dump. Pure (returns a string), so it's testable
 * and has no I/O of its own.
 */
export function formatBalanceReport(opts: BalanceOptions = {}): string {
  const report = balanceReport(opts);
  const rows = report.map(
    (r) =>
      `F${String(r.floor).padStart(2)} ${r.name.padEnd(22)} ` +
      `threat=${r.analysis.threat.toFixed(2)} ` +
      (r.winRate.trials > 0 ? `win=${(r.winRate.winRate.point * 100).toFixed(0)}% ttk=${r.winRate.meanTtk.toFixed(1)} ` : '') +
      `${r.difficulty}${r.flagged ? ' (flagged)' : ''}`,
  );
  const cr = curveReport(opts);
  const curve = cr.byFloor.map((f) => `F${f.floor}: meanThreat=${f.meanThreat.toFixed(2)} (n=${f.count})`);
  return [
    '=== Per-monster (vs reference player at first floor) ===',
    ...rows,
    '',
    '=== Difficulty curve ===',
    ...curve,
    `maxFloorJump=${cr.maxFloorJump.toFixed(3)}  inBand=${(cr.inBandFraction * 100).toFixed(0)}%  flagged=${cr.flagged.length}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Auto-balancer — bisection to a target threat.
// ---------------------------------------------------------------------------

export interface BalanceTarget {
  /** Desired threat (fraction of player HP spent killing the monster). */
  threat: number;
  /** Acceptable absolute error on the achieved threat. */
  tolerance?: number;
  /** Bracket for the attack multiplier search. */
  minMultiplier?: number;
  maxMultiplier?: number;
  maxIterations?: number;
}

export interface BalanceSuggestion {
  damageMultiplier: number;
  achievedThreat: number;
  targetThreat: number;
  /** True when the target is reachable within the bracket and tolerance. */
  converged: boolean;
  iterations: number;
}

/**
 * Find the attack `damageMultiplier` that makes this monster hit `target.threat`
 * against the given player, by bisection.
 *
 * Threat is monotonically non-decreasing in the multiplier (more attack ⇒ more
 * damage-per-turn ⇒ more HP spent, with time-to-kill unchanged since HP is
 * fixed), so a bracketed bisection is guaranteed to converge to the boundary.
 * The damage formula's `floor()` makes threat a monotonic step function, so the
 * achievable threat may land just shy of the target — `converged` reports
 * whether we got inside tolerance.
 */
export function autoBalanceAttack(
  monster: MonsterCombat,
  player: PlayerCombat,
  target: BalanceTarget,
): BalanceSuggestion {
  const tol = target.tolerance ?? 0.01;
  let lo = target.minMultiplier ?? 0.05;
  let hi = target.maxMultiplier ?? 8;
  const maxIter = target.maxIterations ?? 60;

  const threatAt = (mult: number): number =>
    analyzeDuel(player, { ...monster, damageMultiplier: mult }).threat;

  // If the target lies outside what the bracket can produce, clamp to the
  // nearest endpoint and report non-convergence.
  const loThreat = threatAt(lo);
  const hiThreat = threatAt(hi);
  if (target.threat <= loThreat) {
    return { damageMultiplier: lo, achievedThreat: loThreat, targetThreat: target.threat, converged: Math.abs(loThreat - target.threat) <= tol, iterations: 0 };
  }
  if (target.threat >= hiThreat) {
    return { damageMultiplier: hi, achievedThreat: hiThreat, targetThreat: target.threat, converged: Math.abs(hiThreat - target.threat) <= tol, iterations: 0 };
  }

  let mid = (lo + hi) / 2;
  let achieved = threatAt(mid);
  let i = 0;
  for (; i < maxIter; i++) {
    mid = (lo + hi) / 2;
    achieved = threatAt(mid);
    if (Math.abs(achieved - target.threat) <= tol) break;
    if (achieved < target.threat) lo = mid;
    else hi = mid;
  }
  return {
    damageMultiplier: mid,
    achievedThreat: achieved,
    targetThreat: target.threat,
    converged: Math.abs(achieved - target.threat) <= tol,
    iterations: i,
  };
}
