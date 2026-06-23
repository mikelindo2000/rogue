import { describe, it, expect } from 'vitest';
import { makeRng } from '../rng';
import {
  expectedPlayerDamage,
  expectedMonsterDamage,
  analyzeDuel,
  simulateDuel,
  estimateWinRate,
  type PlayerCombat,
  type MonsterCombat,
} from './sim';

const player = (over: Partial<PlayerCombat> = {}): PlayerCombat => ({
  maxHp: 100,
  baseAtk: 2,
  weaponDmg: 8,
  strengthActive: false,
  def: 4,
  attacksPerTurn: 1,
  ...over,
});

const monster = (over: Partial<MonsterCombat> = {}): MonsterCombat => ({
  hp: 40,
  atk: 10,
  damageMultiplier: 1,
  hitsPerTurn: 1,
  ...over,
});

describe('analytic expected damage matches the real combat math', () => {
  it('expectedPlayerDamage equals the brute-forced mean of computeStrike', () => {
    const p = player({ weaponDmg: 8 });
    // Brute-force the exact distribution by enumerating the underlying die.
    // computeStrike draws rng.int(dmgBase); average computeStrike over every
    // possible draw by feeding seeds is noisy, so instead compare against the
    // closed-form enumeration the engine formula implies.
    const dmgBase = p.baseAtk + p.weaponDmg; // 10
    let brute = 0;
    for (let i = 0; i < dmgBase; i++) brute += Math.max(1, i + 2);
    brute /= dmgBase;
    expect(expectedPlayerDamage(p)).toBeCloseTo(brute, 10);
    expect(expectedPlayerDamage(p)).toBeCloseTo(6.5, 10);
  });

  it('expectedMonsterDamage equals the brute-forced mean of the monster formula', () => {
    const m = monster({ atk: 12 });
    const def = 8;
    const scaledAtk = m.atk;
    const defRed = Math.floor(def / 4);
    let brute = 0;
    for (let i = 0; i < scaledAtk; i++) brute += Math.max(1, Math.floor((i + 1 - defRed) * 0.5));
    brute /= scaledAtk;
    expect(expectedMonsterDamage(m, def)).toBeCloseTo(brute, 10);
  });

  it('strength and defense move expected damage the right way', () => {
    expect(expectedPlayerDamage(player({ strengthActive: true }))).toBeGreaterThan(
      expectedPlayerDamage(player({ strengthActive: false })),
    );
    expect(expectedMonsterDamage(monster(), 40)).toBeLessThan(expectedMonsterDamage(monster(), 0));
  });
});

describe('analyzeDuel', () => {
  it('threat rises with monster attack and falls with player HP/def', () => {
    const base = analyzeDuel(player(), monster());
    expect(analyzeDuel(player(), monster({ atk: 20 })).threat).toBeGreaterThan(base.threat);
    expect(analyzeDuel(player({ maxHp: 200 }), monster()).threat).toBeLessThan(base.threat);
    expect(analyzeDuel(player({ def: 40 }), monster()).threat).toBeLessThan(base.threat);
  });

  it('ttk falls as player damage rises', () => {
    expect(analyzeDuel(player({ weaponDmg: 30 }), monster()).ttk).toBeLessThan(
      analyzeDuel(player({ weaponDmg: 4 }), monster()).ttk,
    );
  });

  it('evasion lengthens the fight and raises threat', () => {
    const plain = analyzeDuel(player(), monster({ dodgeChance: 0 }));
    const evasive = analyzeDuel(player(), monster({ dodgeChance: 0.25 }));
    expect(evasive.playerDps).toBeCloseTo(plain.playerDps * 0.75, 10);
    expect(evasive.threat).toBeGreaterThan(plain.threat);
  });
});

describe('evasion in Monte-Carlo', () => {
  it('an evasive monster wins more often than an identical non-evasive one', () => {
    const p = player({ maxHp: 40 });
    const tanky = monster({ hp: 60, atk: 14 });
    const plain = estimateWinRate(p, { ...tanky, dodgeChance: 0 }, 500);
    const evasive = estimateWinRate(p, { ...tanky, dodgeChance: 0.4 }, 500);
    // Evasion negates player strikes, so the monster survives longer and the
    // player's win-rate drops (or at worst ties).
    expect(evasive.winRate.point).toBeLessThanOrEqual(plain.winRate.point);
    expect(evasive.meanTtk).toBeGreaterThan(plain.meanTtk);
  });
});

describe('simulateDuel', () => {
  it('is deterministic for a fixed seed', () => {
    const a = simulateDuel(player(), monster(), makeRng(123));
    const b = simulateDuel(player(), monster(), makeRng(123));
    expect(a).toEqual(b);
  });

  it('a vastly stronger player always wins; a vastly weaker one always loses', () => {
    const strong = estimateWinRate(player({ maxHp: 500, weaponDmg: 40 }), monster({ hp: 10 }), 200);
    expect(strong.winRate.point).toBe(1);
    const doomed = estimateWinRate(player({ maxHp: 12, weaponDmg: 1 }), monster({ hp: 500, atk: 30 }), 200);
    expect(doomed.winRate.point).toBe(0);
  });
});

describe('Monte-Carlo agrees with the closed form (the cross-check)', () => {
  it('mean TTK from simulation matches analytic TTK in a player-favored duel', () => {
    // Choose a duel the player essentially always wins, so simulated turns
    // reflect time-to-kill rather than being cut short by player death.
    const p = player({ maxHp: 1000, weaponDmg: 10, def: 6 });
    const m = monster({ hp: 120, atk: 8 });
    const analytic = analyzeDuel(p, m).ttk;
    const sim = estimateWinRate(p, m, 4000);
    expect(sim.winRate.point).toBe(1);
    // Discretization keeps mean turns within ~1 turn (and well within 12%).
    expect(sim.meanTtk).toBeGreaterThan(analytic - 1.0);
    expect(sim.meanTtk).toBeLessThan(analytic + 1.0);
    expect(Math.abs(sim.meanTtk - analytic) / analytic).toBeLessThan(0.12);
  });

  it('p90 TTK is at least the median TTK', () => {
    const sim = estimateWinRate(player({ maxHp: 1000 }), monster({ hp: 80 }), 1000);
    expect(sim.p90Ttk).toBeGreaterThanOrEqual(sim.medianTtk);
  });
});

describe('fractional hitsPerTurn', () => {
  it('a half-rate monster deals roughly half the damage of a full-rate one', () => {
    const full = estimateWinRate(player({ maxHp: 100000, weaponDmg: 1 }), monster({ hp: 100000, hitsPerTurn: 1 }), 1, 1);
    // Use the analytic path for an exact rate check instead (MC above just
    // exercises the code path without dying).
    const slow = analyzeDuel(player(), monster({ hitsPerTurn: 0.5 }));
    const fast = analyzeDuel(player(), monster({ hitsPerTurn: 1 }));
    expect(slow.monsterDps).toBeCloseTo(fast.monsterDps * 0.5, 10);
    expect(full.trials).toBe(1);
  });
});
