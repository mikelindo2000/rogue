/* Full-run Monte-Carlo — measures the player's ACTUAL power curve and resource
 * pressure across whole 1→N descents.
 *
 * The duel-based harness (sim.ts / balance.ts) answers "is this monster fair
 * against a *reference* player?" — but the reference player (DEFAULT_CURVE) is a
 * hand-authored linear assumption, explicitly flagged as "not measured ground
 * truth". That leaves a blind spot: if the real loot tables hand the player gear
 * far above the assumed curve, every monster reads "fair" while the actual run is
 * a walkover. This module closes that loop.
 *
 * For each seeded run it drives the REAL generators end to end:
 *   - generateLevel() rolls the actual rooms, gear, potions and spawns per floor,
 *   - a greedy equip policy picks up every strict stat upgrade (an *upper bound*
 *     on player power — the "always grab the better sword" player),
 *   - gainXp() advances level/HP off the real XP tables and kill rewards,
 *   - each fight's HP cost comes from the real seeded combat (simulateDuel).
 *
 * Two artifacts fall out, aggregated over many runs:
 *   1. The MEASURED power curve (atk/def/maxHp/level per floor) — overlay it on
 *      DEFAULT_CURVE to see, quantitatively, where the player outgrows the design
 *      assumption (the "level 9 and I'm unkillable" cliff).
 *   2. A RESOURCE-PRESSURE report (HP lost per floor, worst low-HP dip, how often
 *      a heal is actually needed, potions found vs used) — the signal for whether
 *      consumables ever matter.
 *
 * Modeling assumptions are named knobs (RunOptions) so they can be recalibrated
 * against telemetry, not buried as magic numbers.
 */

import { makeRng } from '../rng';
import { generateLevel } from '../map';
import { createPlayer, getTotalDef, gainXp } from '../player';
import {
  BALANCE,
  monsterKillXp,
  CHEST_GOLD_TABLE,
  getScaledMonsterHP,
  getScaledMonsterAtk,
} from '../config';
import { ARMOR_SLOTS, type ArmorSlot, type GearItem, type Monster, type Player, type StatusEffects } from '../types';
import { simulateDuel, type MonsterCombat, type PlayerCombat } from './sim';
import { expectedPlayerAtFloor, DEFAULT_CURVE, type ReferenceCurve } from './balance';
import { mean, median, quantile } from './stats';

// Classic board dimensions (boards.ts CLASSIC). The engine passes these to
// generateLevel in normal play; using them keeps room/loot/spawn counts faithful.
const BOARD_COLS = 46;
const BOARD_ROWS = 29;

const noLog = (_: string): void => {};

/** A zeroed status block — the sim doesn't model buff potions on the player side
 *  (strength/armor), so every effect timer is off. gainXp / getTotalDef read it. */
function zeroStatus(): StatusEffects {
  return {
    vigorTurns: 0,
    midasTurns: 0,
    strengthTurns: 0,
    invisTurns: 0,
    armorTurns: 0,
    monsterDetectionTurns: 0,
  };
}

// ---------------------------------------------------------------------------
// Modeling knobs.
// ---------------------------------------------------------------------------

export interface RunOptions {
  maxFloor?: number;
  /** Reference curve to compare the measured power curve against. */
  curve?: ReferenceCurve;
  /** Fraction of maxHp regained when entering a new floor (a floor takes many
   *  turns to clear, so Rogue's slow regen leaves the player near full by the
   *  stairs). 1 = arrive full. */
  regenBetweenFloors?: number;
  /** Fraction of maxHp regained between two consecutive fights on the same floor
   *  (a few steps of walking). The softest assumption — the resource-pressure
   *  numbers scale with it; the power curve does not. */
  regenBetweenFights?: number;
  /** When true, drink a healing potion after any fight that leaves HP below
   *  `dangerFrac` (and one is held). This is what reveals whether potions are
   *  ever *needed*: if they're never drunk, they're dead weight. */
  usePotions?: boolean;
  /** HP fraction below which the situation counts as a "danger dip" (and triggers
   *  a heal if usePotions). */
  dangerFrac?: number;
}

const DEFAULTS: Required<Omit<RunOptions, 'curve'>> & { curve: ReferenceCurve } = {
  maxFloor: 20,
  curve: DEFAULT_CURVE,
  regenBetweenFloors: 1,
  regenBetweenFights: 0.25,
  usePotions: true,
  dangerFrac: 0.3,
};

// ---------------------------------------------------------------------------
// Greedy equip policy.
// ---------------------------------------------------------------------------

const isArmorSlot = (cat: string): cat is ArmorSlot =>
  (ARMOR_SLOTS as readonly string[]).includes(cat);

/** Equip a freshly-found gear item iff it strictly beats what's in its slot.
 *  Models the player who always takes the better piece — deliberately the most
 *  power-positive policy, so the measured curve is an upper bound. Known
 *  simplification: a 2H weapon upgrade does NOT drop the shield here, so 2H
 *  builds' def is mildly overstated relative to the real "2H locks off-hand"
 *  rule. */
function tryEquip(player: Player, gear: GearItem): void {
  const cat = gear.category;
  if (!cat) return;

  if (isArmorSlot(cat)) {
    const cur = player.inventory[cat][player.equipped[cat]];
    if ((gear.def ?? 0) > (cur?.def ?? 0)) {
      player.inventory[cat].push(gear);
      player.equipped[cat] = player.inventory[cat].length - 1;
    }
    return;
  }

  if (cat === 'shield') {
    const eq = player.equipped.offHand;
    const curIdx = eq.startsWith('shield:') ? parseInt(eq.split(':')[1], 10) : -1;
    const curDef = curIdx >= 0 ? player.inventory.shield[curIdx]?.def ?? 0 : 0;
    if ((gear.def ?? 0) > curDef) {
      player.inventory.shield.push(gear);
      player.equipped.offHand = `shield:${player.inventory.shield.length - 1}`;
    }
    return;
  }

  // Any other category is a weapon → main hand, compared by damage.
  const curW = player.inventory.weapons[player.equipped.mainHand];
  if ((gear.dmg ?? 0) > (curW?.dmg ?? 0)) {
    player.inventory.weapons.push(gear);
    player.equipped.mainHand = player.inventory.weapons.length - 1;
  }
}

// ---------------------------------------------------------------------------
// Combat-profile builders.
// ---------------------------------------------------------------------------

function playerCombat(player: Player, status: StatusEffects): PlayerCombat {
  const weapon = player.inventory.weapons[player.equipped.mainHand];
  return {
    maxHp: player.maxHp,
    baseAtk: player.baseAtk,
    weaponDmg: weapon?.dmg ?? 0,
    strengthActive: false,
    def: getTotalDef(player, status),
    attacksPerTurn: 1,
  };
}

/** A placed monster carries the RAW template hp (the engine scales it at load via
 *  getScaledMonsterHP); atk is scaled at swing time via getScaledMonsterAtk. We
 *  apply both here so the duel matches what the player actually fights. All
 *  monsters use plain every-turn melee (archetype telegraph/dodge shapes aren't
 *  modeled — a v1 simplification, consistent with balance.ts for non-archetypes). */
function monsterCombat(m: Monster): MonsterCombat {
  return {
    hp: getScaledMonsterHP(m.hp, m.name),
    atk: getScaledMonsterAtk(m.atk),
    damageMultiplier: 1,
    hitsPerTurn: 1,
    dodgeChance: 0,
  };
}

const clampLvl = (l: number) => Math.max(1, Math.min(20, l));

// ---------------------------------------------------------------------------
// Per-floor snapshot + single run.
// ---------------------------------------------------------------------------

export interface FloorSnapshot {
  floor: number;
  level: number;
  maxHp: number;
  /** baseAtk + equipped weapon damage. */
  atk: number;
  /** Total defense from equipped armor + shield. */
  def: number;
  /** HP lost over all fights on this floor (after regen between fights). */
  damageTaken: number;
  /** Lowest HP fraction (of current maxHp) reached on this floor. */
  lowestHpFrac: number;
  /** Fights that ended below dangerFrac. */
  dangerDips: number;
  /** Healing potions held entering the floor. */
  potionsHeld: number;
  potionsUsed: number;
  /** Monsters fought on this floor. */
  monstersFought: number;
  /** True if the player's HP hit 0 on this floor. */
  died: boolean;
}

export interface RunResult {
  floors: FloorSnapshot[];
  /** Floor the run died on, or null if it cleared maxFloor. */
  diedOnFloor: number | null;
}

/** Drive one full seeded descent through the real generators. */
export function simulateRun(seed: number, opts: RunOptions = {}): RunResult {
  const o = { ...DEFAULTS, ...opts };
  const rng = makeRng(seed);
  const status = zeroStatus();
  const player = createPlayer();

  const floors: FloorSnapshot[] = [];
  let hpCarry = player.maxHp;
  let healPotions = 0;
  let diedOnFloor: number | null = null;

  for (let floor = 1; floor <= o.maxFloor && diedOnFloor === null; floor++) {
    const level = generateLevel(floor, player.level, BOARD_COLS, BOARD_ROWS, rng, {});

    // --- Loot phase: equip upgrades, bank consumables, open chests. ---
    for (const it of level.items) {
      if (it.type === 'gear') tryEquip(player, it.data);
      else if (it.type === 'potion' && it.data.potionType === 'healing') healPotions++;
      else if (it.type === 'gold' && it.amount === undefined) {
        // A chest (gold pile with no explicit amount) awards XP equal to its gold,
        // mirroring checkItems. Recovered piles (explicit amount) give no XP. The
        // engine rolls ±10% variance (and ×1.2 if Midas is up) on the base before
        // granting XP; we use the base — the variance is symmetric so the measured
        // mean is ~unbiased, and Midas is rarely active at pickup.
        gainXp(player, CHEST_GOLD_TABLE[clampLvl(player.level)] ?? 15, noLog, status);
      }
    }

    // --- Combat phase: fight the floor's spawns in sequence. ---
    const potionsHeld = healPotions;
    let potionsUsed = 0;
    let dangerDips = 0;
    let damageTaken = 0;
    let monstersFought = 0;
    let died = false;

    // Enter the floor having regenerated toward full.
    let hp = Math.min(player.maxHp, hpCarry + o.regenBetweenFloors * player.maxHp);
    let lowest = hp;

    for (const m of level.monsters) {
      if (m.special === 'boss') continue; // bosses are scripted encounters, not random difficulty
      monstersFought++;
      const pc = playerCombat(player, status);
      const mc = monsterCombat(m);
      // Distinct sub-seed per fight; HP cost is start-HP-agnostic (damage taken
      // winning the fight), so we layer it onto the carried HP.
      const fightSeed = (seed ^ Math.imul(floor * 131 + monstersFought, 0x9e3779b9)) >>> 0;
      const res = simulateDuel(pc, mc, makeRng(fightSeed));
      const dmg = res.playerWon ? pc.maxHp - res.playerHpLeft : pc.maxHp;
      hp -= dmg;
      damageTaken += dmg;
      if (hp < lowest) lowest = hp;

      if (hp <= 0) {
        died = true;
        diedOnFloor = floor;
        break;
      }
      if (hp < o.dangerFrac * player.maxHp) {
        dangerDips++;
        if (o.usePotions && healPotions > 0) {
          hp = Math.min(player.maxHp, hp + BALANCE.potions.healAmount);
          healPotions--;
          potionsUsed++;
        }
      }

      // XP can level the player up mid-floor (raising maxHp).
      gainXp(player, monsterKillXp(floor, m.name), noLog, status);

      // A few steps to the next fight.
      hp = Math.min(player.maxHp, hp + o.regenBetweenFights * player.maxHp);
    }

    const weaponDmg = player.inventory.weapons[player.equipped.mainHand]?.dmg ?? 0;
    floors.push({
      floor,
      level: player.level,
      maxHp: player.maxHp,
      atk: player.baseAtk + weaponDmg,
      def: getTotalDef(player, status),
      damageTaken,
      lowestHpFrac: lowest / player.maxHp,
      dangerDips,
      potionsHeld,
      potionsUsed,
      monstersFought,
      died,
    });

    hpCarry = Math.max(0, hp);
  }

  return { floors, diedOnFloor };
}

// ---------------------------------------------------------------------------
// Aggregation across many runs.
// ---------------------------------------------------------------------------

export interface FloorAggregate {
  floor: number;
  runs: number;
  // Measured power curve.
  meanLevel: number;
  meanMaxHp: number;
  meanAtk: number;
  meanDef: number;
  // Assumed (reference) curve, for side-by-side.
  assumedAtk: number;
  assumedDef: number;
  assumedMaxHp: number;
  // Resource pressure.
  meanDamageTaken: number;
  medianLowestHpFrac: number;
  /** 10th-percentile lowest-HP fraction — the unlucky-run worst moment. */
  p10LowestHpFrac: number;
  /** Fraction of runs that dipped into danger at least once on this floor. */
  dangerDipRate: number;
  meanPotionsHeld: number;
  meanPotionsUsed: number;
  /** Fraction of (still-alive) runs that died on this floor. */
  deathRate: number;
}

export interface RunReport {
  trials: number;
  byFloor: FloorAggregate[];
  /** Fraction of runs that reached the last floor alive. */
  clearRate: number;
  /** Mean healing potions drunk per run. */
  meanPotionsUsedPerRun: number;
  /** Mean healing potions found-but-never-used per run (dead weight). */
  meanPotionsWastedPerRun: number;
}

/** Run `trials` seeded descents and aggregate per floor. */
export function simulateRuns(trials: number, opts: RunOptions = {}): RunReport {
  const o = { ...DEFAULTS, ...opts };
  const runs: RunResult[] = [];
  for (let i = 0; i < trials; i++) {
    const seed = (0x1234567 + Math.imul(i, 0x9e3779b9)) >>> 0;
    runs.push(simulateRun(seed, opts));
  }

  const byFloor: FloorAggregate[] = [];
  for (let floor = 1; floor <= o.maxFloor; floor++) {
    const snaps = runs.map((r) => r.floors.find((f) => f.floor === floor)).filter((s): s is FloorSnapshot => !!s);
    if (snaps.length === 0) continue;
    const ref = expectedPlayerAtFloor(floor, o.curve);
    const lowest = snaps.map((s) => s.lowestHpFrac);
    byFloor.push({
      floor,
      runs: snaps.length,
      meanLevel: mean(snaps.map((s) => s.level)),
      meanMaxHp: mean(snaps.map((s) => s.maxHp)),
      meanAtk: mean(snaps.map((s) => s.atk)),
      meanDef: mean(snaps.map((s) => s.def)),
      assumedAtk: ref.baseAtk + ref.weaponDmg,
      assumedDef: ref.def,
      assumedMaxHp: ref.maxHp,
      meanDamageTaken: mean(snaps.map((s) => s.damageTaken)),
      medianLowestHpFrac: median(lowest),
      p10LowestHpFrac: quantile(lowest, 0.1),
      dangerDipRate: snaps.filter((s) => s.dangerDips > 0).length / snaps.length,
      meanPotionsHeld: mean(snaps.map((s) => s.potionsHeld)),
      meanPotionsUsed: mean(snaps.map((s) => s.potionsUsed)),
      deathRate: snaps.filter((s) => s.died).length / snaps.length,
    });
  }

  const clearRate = runs.filter((r) => r.diedOnFloor === null).length / Math.max(1, runs.length);
  const usedPerRun = runs.map((r) => r.floors.reduce((s, f) => s + f.potionsUsed, 0));
  // Wasted = found over the run but still held at the end (last floor's held − used there is a proxy;
  // simplest faithful measure: total found − total used). Found = used + still-held-at-death/clear.
  const wastedPerRun = runs.map((r) => {
    const lastHeld = r.floors.length ? r.floors[r.floors.length - 1].potionsHeld : 0;
    const usedOnLast = r.floors.length ? r.floors[r.floors.length - 1].potionsUsed : 0;
    return Math.max(0, lastHeld - usedOnLast);
  });

  return {
    trials,
    byFloor,
    clearRate,
    meanPotionsUsedPerRun: mean(usedPerRun),
    meanPotionsWastedPerRun: mean(wastedPerRun),
  };
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const delta = (measured: number, assumed: number) => {
  if (assumed <= 0) return measured > 0 ? '+∞' : '0%';
  const d = (measured - assumed) / assumed;
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%`;
};

/** Render the run report as two plain-text tables — power curve and resource
 *  pressure — plus a headline. Pure (returns a string). */
export function formatRunReport(trials = 500, opts: RunOptions = {}): string {
  const rep = simulateRuns(trials, opts);

  const power = rep.byFloor.map((f) => {
    return (
      `F${String(f.floor).padStart(2)}  ` +
      `lvl ${f.meanLevel.toFixed(1).padStart(4)}  ` +
      `atk ${f.meanAtk.toFixed(0).padStart(3)} (vs ${f.assumedAtk.toFixed(0).padStart(3)} ${delta(f.meanAtk, f.assumedAtk).padStart(5)})  ` +
      `def ${f.meanDef.toFixed(0).padStart(3)} (vs ${f.assumedDef.toFixed(0).padStart(3)} ${delta(f.meanDef, f.assumedDef).padStart(5)})  ` +
      `hp ${f.meanMaxHp.toFixed(0).padStart(4)} (vs ${f.assumedMaxHp.toFixed(0).padStart(4)})`
    );
  });

  const pressure = rep.byFloor.map((f) => {
    return (
      `F${String(f.floor).padStart(2)}  ` +
      `dmg/floor ${f.meanDamageTaken.toFixed(1).padStart(6)}  ` +
      `lowHP med ${pct(f.medianLowestHpFrac).padStart(4)} / p10 ${pct(f.p10LowestHpFrac).padStart(4)}  ` +
      `dangerDip ${pct(f.dangerDipRate).padStart(4)}  ` +
      `pots held ${f.meanPotionsHeld.toFixed(1).padStart(4)} used ${f.meanPotionsUsed.toFixed(2).padStart(4)}  ` +
      `death ${pct(f.deathRate).padStart(4)}`
    );
  });

  return [
    `=== Full-run Monte-Carlo (${rep.trials} runs) ===`,
    '',
    '--- Measured power curve vs reference (DEFAULT_CURVE) ---',
    ...power,
    '',
    '--- Resource pressure ---',
    ...pressure,
    '',
    `clearRate=${pct(rep.clearRate)}  ` +
      `potionsUsed/run=${rep.meanPotionsUsedPerRun.toFixed(2)}  ` +
      `potionsWasted/run=${rep.meanPotionsWastedPerRun.toFixed(2)}`,
  ].join('\n');
}
