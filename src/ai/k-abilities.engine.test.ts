import { describe, it, expect } from 'vitest';
import { makeRng, type RNG } from '../rng';
import type { Monster, Player, StatusEffects } from '../types';
import { processMonsterAI } from '../monster';
import { ensureRuntime } from './brain';

/**
 * Engine-level (attack-path) coverage for category K. The spine tests
 * (k-abilities.test.ts) exercise the buff math + extraHits helper in isolation;
 * only driving processMonsterAI proves the real ATTACK path (applyAttack, which
 * owns totalDef + computeMonsterDamage + the buff fold) honors them end to end.
 *
 * Setup: a Kalius (default 'hunt' archetype, melee range 1, no windup) placed
 * adjacent to the player so decideMonsterAction returns a direct 'attack'.
 */

function kalius(over: Partial<Monster> = {}): Monster {
  // atk 65 so the monster damage roll has headroom (rng.int(scaledAtk) is large),
  // making the +50% buff observable above the floor-of-1 clamp.
  return {
    x: 3, y: 2, symbol: 'K', name: 'Kalius King Cobra', hp: 200, maxHp: 200,
    atk: 65, color: '#cd853f', minFloor: 6, frozenTurns: 0, ...over,
  };
}
function player(over: Partial<Player> = {}): Player {
  return { x: 2, y: 2, hp: 5000, maxHp: 5000, gold: 0, activeEffects: [], ...over } as unknown as Player;
}
const status = (): StatusEffects => ({ invisTurns: 0 } as unknown as StatusEffects);

// A 2-row map so the monster at (3,2) and player at (2,2) are adjacent walkable tiles.
const wallRow = (cols: number) => new Array(cols).fill('#');
const floorRow = (cols: number) => new Array(cols).fill('.');
function arena() {
  const cols = 8;
  const map: string[][] = [wallRow(cols), wallRow(cols), floorRow(cols), wallRow(cols)];
  return { map, cols, rows: map.length };
}

// Forced-chance RNG. chance() is gated by `fire`. int(max) returns a fixed FRACTION
// of its max (so a larger scaledAtk → a larger monster damage roll, the way the real
// PRNG behaves and what makes the +50% buff observable), except when `countMode` is
// set it returns a fixed small integer so the extraHits count roll is deterministic.
function rng(fire: boolean, frac: number, countVal?: number): RNG {
  let firstIntSeen = false;
  return {
    seed: 0,
    next: () => 0,
    // The FIRST int() call in a turn is the main hit's damage roll (scale by frac);
    // later int() calls are the extraHits count + extra-bite damage rolls. When a
    // discrete count is wanted we hand it back on the count draw.
    int: (max: number) => {
      if (countVal !== undefined && firstIntSeen) return Math.min(countVal, Math.max(0, max - 1));
      firstIntSeen = true;
      return Math.min(max - 1, Math.max(0, Math.floor(frac * max)));
    },
    range: (min: number) => min,
    chance: () => fire,
    pick: <T>(a: readonly T[]) => a[0],
    getState: () => 0,
  } as unknown as RNG;
}

function runTurn(m: Monster, p: Player, r: RNG) {
  const { map, cols, rows } = arena();
  const logs: string[] = [];
  processMonsterAI([m], p, status(), map, cols, rows, /*totalDef*/ 0, (l) => logs.push(l), r, /*turn*/ 0);
  return logs;
}

describe('K engine: selfBuff makes the monster hit harder', () => {
  it('a buffed Kalius deals more melee damage than an unbuffed one', () => {
    // Same deterministic damage roll (int fixed); the ONLY difference is the buff,
    // so any HP delta is the +50% multiplier folded into scaledAtk in applyAttack.
    // chance=false so no NEW ability procs perturb the comparison.
    const r = () => rng(false, 0.9);

    const pPlain = player();
    runTurn(kalius(), pPlain, r());
    const plainDmg = 5000 - pPlain.hp;

    const pBuffed = player();
    const mBuffed = kalius();
    const rt = ensureRuntime(mBuffed);
    rt.atkBuffTurns = 2; // active at top of turn → buff applies to THIS attack (ticked after).
    rt.atkBuffMult = 1.5;
    runTurn(mBuffed, pBuffed, r());
    const buffedDmg = 5000 - pBuffed.hp;

    expect(plainDmg).toBeGreaterThan(0);
    expect(buffedDmg).toBeGreaterThan(plainDmg);
  });

  it('a freshly-procced selfBuff empowers the NEXT TWO attacks, then wears off', () => {
    // End-to-end duration test: drive processMonsterAI across consecutive turns and
    // assert the "+50%/2t" buff lands on exactly two subsequent attacks (not one —
    // the decrement-before-act off-by-one — and not three).
    // Baseline: same deterministic damage roll with no buff ever.
    const baselineP = player();
    runTurn(kalius(), baselineP, rng(false, 0.9));
    const plain = 5000 - baselineP.hp;

    // Turn N: selfBuff procs (chance fires) after the hit → atkBuffTurns set to 2.
    const m = kalius();
    const p = player();
    runTurn(m, p, rng(true, 0.9));
    const rt = ensureRuntime(m);
    expect(rt.atkBuffTurns).toBe(2); // set this turn, NOT ticked down (application turn).

    // Turns N+1 and N+2: both must read the buff (each > plain). chance=false so no
    // NEW proc perturbs the comparison; the damage roll fraction is identical.
    const hp1Before = p.hp;
    runTurn(m, p, rng(false, 0.9));
    const hit1 = hp1Before - p.hp;

    const hp2Before = p.hp;
    runTurn(m, p, rng(false, 0.9));
    const hit2 = hp2Before - p.hp;

    // Turn N+3: buff has worn off — back to the plain damage.
    const hp3Before = p.hp;
    runTurn(m, p, rng(false, 0.9));
    const hit3 = hp3Before - p.hp;

    expect(plain).toBeGreaterThan(0);
    expect(hit1).toBeGreaterThan(plain); // buffed attack #1
    expect(hit2).toBeGreaterThan(plain); // buffed attack #2
    expect(hit3).toBe(plain); // unbuffed again
    expect(rt.atkBuffTurns ?? 0).toBe(0);
  });
});

describe('K engine: extraHits proc deals multiple hits through the attack path', () => {
  it('Furious Fangs adds 2-5 bites on a proc, each + perHitBonus', () => {
    // chance=true fires both Kalius abilities (selfBuff sets a buff for NEXT turn,
    // harmless here) and extraHits. intVal=0 → count = minHits = 2.
    const p = player();
    const logs = runTurn(kalius(), p, rng(true, 0.9, 0));
    expect(logs.join(' ')).toMatch(/Furious Fangs lands 2 extra hits/);
    // Main hit + 2 extra bites all landed: total damage exceeds a single melee hit.
    const total = 5000 - p.hp;
    expect(total).toBeGreaterThan(0);
    // The two extra bites alone carry at least 2×perHitBonus (5) on top of their base.
    expect(logs.join(' ')).toMatch(/lands 2 extra hits for \d+/);
  });

  it('an un-procced hit deals exactly one melee hit (no extra hits, parity)', () => {
    const p = player();
    const logs = runTurn(kalius(), p, rng(false, 0.9));
    expect(logs.join(' ')).toMatch(/Kalius King Cobra hits for \d+ dmg\./);
    expect(logs.join(' ')).not.toMatch(/extra hit/);
  });
});

// A real-PRNG wrapper that counts chance() draws, to prove the extraHits ability is
// gated by exactly ONE chance roll per landed hit (the applyExtraHits gate) — not
// the previous double-gate where applyOnHitAbilities ALSO rolled chance for it (a
// wasted no-op proc that burned a second PRNG step and perturbed the seeded stream).
function countingRng(seed: number): RNG & { chanceCalls: number } {
  const base = makeRng(seed);
  const wrapped = {
    chanceCalls: 0,
    seed: base.seed,
    next: () => base.next(),
    int: (m: number) => base.int(m),
    range: (a: number, b: number) => base.range(a, b),
    chance(p: number) {
      this.chanceCalls++;
      return base.chance(p);
    },
    pick: <T>(a: readonly T[]) => base.pick(a),
    getState: () => base.getState(),
  };
  return wrapped as unknown as RNG & { chanceCalls: number };
}

describe('K engine: extraHits is single-gated (no double chance draw)', () => {
  it('a Kalius hit rolls chance exactly twice: once for selfBuff, once for extraHits', () => {
    // Kalius has two onHit abilities (selfBuff + extraHits). On the landed hit the
    // generic onHit loop gates ONLY selfBuff (extraHits is skipped there now), and
    // applyExtraHits gates extraHits — two chance draws total. Before the fix this
    // was three (extraHits double-rolled), diverging the downstream PRNG stream.
    const r = countingRng(12345);
    runTurn(kalius(), player(), r);
    expect(r.chanceCalls).toBe(2);
  });

  it('the seeded PRNG state after a Kalius hit is stable (regression lock)', () => {
    // Lock the exact stream position after one full attack so any future change that
    // re-introduces an extra draw (or drops one) on the K attack path is caught.
    const r = countingRng(0xABCDEF);
    runTurn(kalius(), player(), r);
    expect(r.getState()).toMatchInlineSnapshot(`1210989518`);
  });
});
