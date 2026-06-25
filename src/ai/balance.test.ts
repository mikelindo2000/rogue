import { describe, it, expect } from 'vitest';
import {
  expectedPlayerAtFloor,
  monsterCombatFromTemplate,
  classifyThreat,
  analyzeMonster,
  balanceReport,
  curveReport,
  formatBalanceReport,
  autoBalanceAttack,
  DEFAULT_CURVE,
  DEFAULT_BANDS,
} from './balance';
import { analyzeDuel, type MonsterCombat, type PlayerCombat } from './sim';
import { MONSTER_DATABASE } from '../config';

describe('reference player curve', () => {
  it('floor 1 is the starting hero; deeper floors are strictly stronger', () => {
    const f1 = expectedPlayerAtFloor(1);
    expect(f1.maxHp).toBe(30);
    expect(f1.weaponDmg).toBe(DEFAULT_CURVE.startWeaponDmg);
    expect(f1.def).toBe(DEFAULT_CURVE.startDef);

    const f20 = expectedPlayerAtFloor(20);
    expect(f20.maxHp).toBe(Math.round(DEFAULT_CURVE.baseHp * Math.pow(DEFAULT_CURVE.hpGrowth, 19)));
    expect(f20.weaponDmg).toBe(DEFAULT_CURVE.endWeaponDmg);
    expect(f20.def).toBe(DEFAULT_CURVE.endDef);

    // Monotonic non-decreasing in HP/weapon/def across the run.
    for (let f = 2; f <= 20; f++) {
      const prev = expectedPlayerAtFloor(f - 1);
      const cur = expectedPlayerAtFloor(f);
      expect(cur.maxHp).toBeGreaterThanOrEqual(prev.maxHp);
      expect(cur.weaponDmg).toBeGreaterThanOrEqual(prev.weaponDmg);
      expect(cur.def).toBeGreaterThanOrEqual(prev.def);
    }
  });

  it('clamps floors outside [1, maxFloor]', () => {
    expect(expectedPlayerAtFloor(-5)).toEqual(expectedPlayerAtFloor(1));
    expect(expectedPlayerAtFloor(999)).toEqual(expectedPlayerAtFloor(20));
  });
});

describe('monsterCombatFromTemplate', () => {
  it('reflects per-monster HP overrides at default tunables', () => {
    const orc = MONSTER_DATABASE.find((m) => m.name === 'Orc')!;
    const mc = monsterCombatFromTemplate(orc);
    expect(mc.hp).toBe(24); // orcHpOverride
    expect(mc.atk).toBe(orc.atk);
    expect(mc.damageMultiplier).toBe(1);
    expect(mc.hitsPerTurn).toBe(1);
  });
});

describe('classifyThreat', () => {
  it('maps threat into the difficulty bands', () => {
    expect(classifyThreat(0.05)).toBe('trivial');
    expect(classifyThreat(0.2)).toBe('easy');
    expect(classifyThreat(0.5)).toBe('fair');
    expect(classifyThreat(0.85)).toBe('hard');
    expect(classifyThreat(1.5)).toBe('lethal');
  });

  it('band edges are half-open and consistent with DEFAULT_BANDS', () => {
    expect(classifyThreat(DEFAULT_BANDS.easy)).toBe('fair');
    expect(classifyThreat(DEFAULT_BANDS.hardUpper)).toBe('hard');
    expect(classifyThreat(DEFAULT_BANDS.lethal)).toBe('lethal');
  });
});

describe('balanceReport / curveReport', () => {
  it('covers every non-boss monster and excludes bosses by default', () => {
    const report = balanceReport({ trials: 0 });
    const nonBoss = MONSTER_DATABASE.filter((m) => m.special !== 'boss');
    expect(report.length).toBe(nonBoss.length);
    expect(report.some((r) => r.name === 'Dragon King')).toBe(false);
  });

  it('curveReport is sorted by floor and reports an in-band fraction in [0,1]', () => {
    const cr = curveReport({ trials: 0 });
    for (let i = 1; i < cr.byFloor.length; i++) {
      expect(cr.byFloor[i].floor).toBeGreaterThan(cr.byFloor[i - 1].floor);
    }
    expect(cr.inBandFraction).toBeGreaterThanOrEqual(0);
    expect(cr.inBandFraction).toBeLessThanOrEqual(1);
    expect(cr.maxFloorJump).toBeGreaterThanOrEqual(0);
  });

  it('formatBalanceReport renders a table with headers and a known monster row', () => {
    const text = formatBalanceReport({ trials: 0 });
    expect(text).toContain('Per-monster');
    expect(text).toContain('Difficulty curve');
    expect(text).toMatch(/Orc\s+threat=/);
    expect(text).toContain('maxFloorJump=');
  });

  it('analyzeMonster with trials runs a real win-rate estimate', () => {
    const orc = MONSTER_DATABASE.find((m) => m.name === 'Orc')!;
    const r = analyzeMonster(orc, { trials: 200 });
    expect(r.winRate.trials).toBe(200);
    expect(r.winRate.winRate.point).toBeGreaterThanOrEqual(0);
    expect(r.winRate.winRate.point).toBeLessThanOrEqual(1);
    expect(['trivial', 'easy', 'fair', 'hard', 'lethal']).toContain(r.difficulty);
  });
});

describe('autoBalanceAttack (bisection)', () => {
  const player: PlayerCombat = {
    maxHp: 120,
    baseAtk: 2,
    weaponDmg: 10,
    strengthActive: false,
    def: 6,
    attacksPerTurn: 1,
  };
  const monster: MonsterCombat = { hp: 90, atk: 12, damageMultiplier: 1, hitsPerTurn: 1 };

  it('hits a reachable target threat within tolerance', () => {
    const s = autoBalanceAttack(monster, player, { threat: 0.5, tolerance: 0.01 });
    expect(s.converged).toBe(true);
    expect(Math.abs(s.achievedThreat - 0.5)).toBeLessThanOrEqual(0.01);
  });

  it('the suggested multiplier actually produces the reported threat', () => {
    const s = autoBalanceAttack(monster, player, { threat: 0.6 });
    const check = analyzeDuel(player, { ...monster, damageMultiplier: s.damageMultiplier }).threat;
    expect(check).toBeCloseTo(s.achievedThreat, 10);
  });

  it('is monotonic: a higher target threat needs a higher multiplier', () => {
    const lowT = autoBalanceAttack(monster, player, { threat: 0.3 });
    const highT = autoBalanceAttack(monster, player, { threat: 0.8 });
    expect(highT.damageMultiplier).toBeGreaterThan(lowT.damageMultiplier);
  });

  it('clamps and reports non-convergence when the target is below the bracket floor', () => {
    const s = autoBalanceAttack(monster, player, { threat: 0.0001, minMultiplier: 0.5, maxMultiplier: 8 });
    expect(s.damageMultiplier).toBe(0.5);
    expect(s.converged).toBe(false);
  });

  it('clamps to the ceiling when the target is unreachably high', () => {
    const s = autoBalanceAttack(monster, player, { threat: 5, minMultiplier: 0.05, maxMultiplier: 4 });
    expect(s.damageMultiplier).toBe(4);
  });
});
