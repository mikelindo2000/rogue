/* Combat model + simulation — the analytic and Monte-Carlo heart of balance.
 *
 * Two views of the same fight, kept deliberately consistent:
 *
 *  1. Analytic (closed form): exact expected damage per swing (computed by
 *     enumerating the uniform damage die, no sampling), and from those an
 *     expected time-to-kill and a "threat" ratio (fraction of the player's HP
 *     spent killing the monster). Deterministic and instant — this is what the
 *     auto-balancer bisects on.
 *
 *  2. Monte-Carlo: a seeded duel that calls the REAL engine combat math
 *     (computeStrike / computeMonsterDamage), trading blows turn by turn until
 *     someone dies. Gives the true stochastic win-rate and TTK distribution.
 *
 * The two must agree: a test asserts the MC mean TTK lands inside a tight band
 * around the analytic TTK. If someone changes a damage formula and only updates
 * one path, that test breaks. That mutual cross-check is the whole point.
 */

import type { RNG } from '../rng';
import { makeRng } from '../rng';
import { BALANCE } from '../config';
import { computeStrike, computeMonsterDamage } from '../combat';
import { wilsonInterval, mean, median, quantile, expectedUniformInt, type Interval } from './stats';

/** The player side of a duel — a flattened, gear-resolved combat profile. */
export interface PlayerCombat {
  maxHp: number;
  baseAtk: number;
  weaponDmg: number;
  /** Strength potion active (adds BALANCE.combat.strengthBonus to the roll). */
  strengthActive: boolean;
  /** Total defense from armor + shield (pre-divided; the formula divides by 4). */
  def: number;
  /** Strikes per turn (e.g. 2 for dual-wielding daggers). */
  attacksPerTurn: number;
}

/** The monster side — base stats plus how its attack lands over time. */
export interface MonsterCombat {
  hp: number;
  atk: number;
  /** Scales the monster's attack roll (a heavy attack profile, etc.). */
  damageMultiplier: number;
  /**
   * Effective melee swings per turn after folding in telegraph/windup downtime
   * and the player's chance to avoid a telegraphed blow. 1 = plain Rogue melee
   * every turn; 0.5 = a wind-up attack that only connects every other turn;
   * >1 = a fast monster. Kept as a single rate so both the analytic and MC
   * paths treat cadence identically.
   */
  hitsPerTurn: number;
}

// ---------------------------------------------------------------------------
// Analytic model — exact expectations, no RNG.
// ---------------------------------------------------------------------------

/** Exact expected damage of one player strike (mirrors computeStrike's roll). */
export function expectedPlayerDamage(p: PlayerCombat): number {
  const C = BALANCE.combat;
  let dmgBase = p.baseAtk + p.weaponDmg;
  if (p.strengthActive) dmgBase += C.strengthBonus;
  dmgBase = Math.max(1, dmgBase);
  // damage = max(1, int(dmgBase) + playerHitBonus)
  return expectedUniformInt(dmgBase, (i) => Math.max(1, i + C.playerHitBonus));
}

/** Exact expected damage of one monster swing (mirrors computeMonsterDamage). */
export function expectedMonsterDamage(m: MonsterCombat, def: number): number {
  const C = BALANCE.combat;
  const scaledAtk = Math.max(1, Math.round(m.atk * m.damageMultiplier));
  const defReduction = Math.floor(def / C.defenseDivisor);
  // dmg = max(1, floor((int(scaledAtk) + monsterHitBonus - defReduction) * scale))
  return expectedUniformInt(scaledAtk, (i) =>
    Math.max(
      1,
      Math.floor((i + C.monsterHitBonus - defReduction) * C.monsterDamageScale),
    ),
  );
}

export interface DuelAnalysis {
  /** Expected player damage per turn (all strikes). */
  playerDps: number;
  /** Expected monster damage per turn (after cadence). */
  monsterDps: number;
  /** Expected turns for the player to kill the monster (player strikes first). */
  ttk: number;
  /** Expected HP the player loses winning the fight. */
  expectedDamageTaken: number;
  /** expectedDamageTaken / player.maxHp — the headline balance number. <1 ⇒
   *  the average fight is survivable; the target band sits well under 1. */
  threat: number;
}

/**
 * Closed-form analysis of a toe-to-toe duel. The player acts first each turn,
 * so a fight that takes `ttk` player-turns gives the monster `ttk - 1` turns to
 * retaliate (on the final turn the monster is dead before it can act). Continuous
 * `ttk` is used directly; the −1 is the first-mover advantage.
 */
export function analyzeDuel(p: PlayerCombat, m: MonsterCombat): DuelAnalysis {
  const playerDps = expectedPlayerDamage(p) * p.attacksPerTurn;
  const monsterDps = expectedMonsterDamage(m, p.def) * m.hitsPerTurn;
  const ttk = m.hp / Math.max(1e-9, playerDps);
  const monsterTurns = Math.max(0, ttk - 1);
  const expectedDamageTaken = monsterDps * monsterTurns;
  return {
    playerDps,
    monsterDps,
    ttk,
    expectedDamageTaken,
    threat: expectedDamageTaken / Math.max(1e-9, p.maxHp),
  };
}

// ---------------------------------------------------------------------------
// Monte-Carlo model — real combat math, seeded.
// ---------------------------------------------------------------------------

export interface DuelResult {
  playerWon: boolean;
  /** Player-turns elapsed (a turn = player strikes, then monster retaliates). */
  turns: number;
  playerHpLeft: number;
}

const TURN_CAP = 10_000; // safety valve against a non-terminating stalemate

/** Resolve the integer number of monster swings this turn from a fractional
 *  rate: the whole part always lands, the fractional part is a Bernoulli trial,
 *  so the long-run average equals `hitsPerTurn` exactly. */
function swingsThisTurn(hitsPerTurn: number, rng: RNG): number {
  const whole = Math.floor(hitsPerTurn);
  const frac = hitsPerTurn - whole;
  return whole + (frac > 0 && rng.chance(frac) ? 1 : 0);
}

/** One seeded duel using the real engine combat functions. */
export function simulateDuel(p: PlayerCombat, m: MonsterCombat, rng: RNG): DuelResult {
  const weapon = { name: 'sim', dmg: p.weaponDmg };
  let monsterHp = m.hp;
  let playerHp = p.maxHp;
  let turns = 0;

  while (turns < TURN_CAP) {
    turns++;

    // Player strikes first.
    for (let a = 0; a < p.attacksPerTurn && monsterHp > 0; a++) {
      const { damage } = computeStrike({
        baseAtk: p.baseAtk,
        weapon,
        strengthActive: p.strengthActive,
        disarmed: false,
        rng,
      });
      monsterHp -= damage;
    }
    if (monsterHp <= 0) return { playerWon: true, turns, playerHpLeft: playerHp };

    // Monster retaliates.
    const swings = swingsThisTurn(m.hitsPerTurn, rng);
    const scaledAtk = Math.max(1, Math.round(m.atk * m.damageMultiplier));
    for (let s = 0; s < swings && playerHp > 0; s++) {
      playerHp -= computeMonsterDamage({ scaledAtk, totalDef: p.def, swipe: false, rng });
    }
    if (playerHp <= 0) return { playerWon: false, turns, playerHpLeft: 0 };
  }
  // Stalemate (shouldn't happen with min-1 damage on both sides).
  return { playerWon: playerHp > 0, turns, playerHpLeft: Math.max(0, playerHp) };
}

export interface WinRateEstimate {
  /** Player win probability with a 95% Wilson interval. */
  winRate: Interval;
  trials: number;
  meanTtk: number;
  medianTtk: number;
  /** 90th-percentile TTK — the "unlucky long fight". */
  p90Ttk: number;
  meanPlayerHpLeft: number;
}

/**
 * Estimate the player win-rate and TTK distribution over `trials` seeded duels.
 * Each duel gets a distinct, deterministic sub-seed derived from `baseSeed`, so
 * the whole estimate is reproducible and varying `baseSeed` gives independent
 * batches for variance analysis.
 */
export function estimateWinRate(
  p: PlayerCombat,
  m: MonsterCombat,
  trials: number,
  baseSeed = 0x9e3779b9,
): WinRateEstimate {
  let wins = 0;
  const ttks: number[] = [];
  let hpLeftSum = 0;
  for (let i = 0; i < trials; i++) {
    // Mix the index into the seed (golden-ratio step) for well-spread sub-seeds.
    const seed = (baseSeed + i * 0x9e3779b9) >>> 0;
    const r = simulateDuel(p, m, makeRng(seed));
    if (r.playerWon) {
      wins++;
      hpLeftSum += r.playerHpLeft;
    }
    ttks.push(r.turns);
  }
  return {
    winRate: wilsonInterval(wins, trials),
    trials,
    meanTtk: mean(ttks),
    medianTtk: median(ttks),
    p90Ttk: quantile(ttks, 0.9),
    meanPlayerHpLeft: wins > 0 ? hpLeftSum / wins : 0,
  };
}
