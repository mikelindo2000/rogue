import { describe, it, expect } from 'vitest';
import { computeStrike, computeMonsterDamage, isHeavyHit, rumbleStrength, HEAVY_HIT } from './combat';
import { makeRng } from './rng';
import { BALANCE } from './config';
import { GearItem } from './types';

const C = BALANCE.combat;

// A representative spread of weapons (no staff magic side effects here).
const fist: GearItem = { name: 'Fist' };
const dagger: GearItem = { name: 'Steel Dagger', dmg: 3 };
const sword: GearItem = { name: 'Rune Blade', dmg: 12 };
const maul: GearItem = { name: 'Titan Maul', dmg: 25 };
const PLAIN_WEAPONS: GearItem[] = [fist, dagger, sword, maul];

describe('computeStrike', () => {
  it('damage is always >= 1 across many seeds and weapons', () => {
    for (const weapon of PLAIN_WEAPONS) {
      for (let seed = 0; seed < 200; seed++) {
        const { damage } = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: false,
          disarmed: false,
          rng: makeRng(seed),
        });
        expect(damage).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(damage)).toBe(true);
      }
    }
    // Even with a zero base the floor still holds.
    const { damage } = computeStrike({
      baseAtk: 0,
      weapon: fist,
      strengthActive: false,
      disarmed: false,
      rng: makeRng(0),
    });
    expect(damage).toBeGreaterThanOrEqual(1);
  });

  it('strengthActive never lowers damage for the same seed/weapon', () => {
    // strengthBonus only grows dmgBase, and the rng stream is consumed
    // identically (one int() draw) for non-magic weapons.
    expect(C.strengthBonus).toBeGreaterThan(0);
    for (const weapon of PLAIN_WEAPONS) {
      for (let seed = 0; seed < 50; seed++) {
        const without = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: false,
          disarmed: false,
          rng: makeRng(seed),
        }).damage;
        const withStr = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: true,
          disarmed: false,
          rng: makeRng(seed),
        }).damage;
        expect(withStr).toBeGreaterThanOrEqual(without);
      }
    }
  });

  it('strength raises the damage ceiling across many seeds', () => {
    const maxOf = (strengthActive: boolean) => {
      let max = 0;
      for (let seed = 0; seed < 300; seed++) {
        const d = computeStrike({
          baseAtk: 2,
          weapon: sword,
          strengthActive,
          disarmed: false,
          rng: makeRng(seed),
        }).damage;
        if (d > max) max = d;
      }
      return max;
    };
    expect(maxOf(true)).toBeGreaterThan(maxOf(false));
  });

  it('disarmed never raises damage for the same seed/weapon', () => {
    // disarm halves the base (floor), so the int() ceiling can only shrink.
    expect(C.disarmDivisor).toBeGreaterThan(1);
    for (const weapon of PLAIN_WEAPONS) {
      for (let seed = 0; seed < 50; seed++) {
        const normal = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: false,
          disarmed: false,
          rng: makeRng(seed),
        }).damage;
        const disarmed = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: false,
          disarmed: true,
          rng: makeRng(seed),
        }).damage;
        expect(disarmed).toBeLessThanOrEqual(normal);
      }
    }
  });

  it('disarm lowers the damage ceiling for a high-base weapon', () => {
    const maxOf = (disarmed: boolean) => {
      let max = 0;
      for (let seed = 0; seed < 300; seed++) {
        const d = computeStrike({
          baseAtk: 2,
          weapon: maul,
          strengthActive: false,
          disarmed,
          rng: makeRng(seed),
        }).damage;
        if (d > max) max = d;
      }
      return max;
    };
    expect(maxOf(true)).toBeLessThan(maxOf(false));
  });

  it('fire staff logs "Flames erupt!" and does not heal or freeze', () => {
    const fireStaff: GearItem = { name: 'Fire Staff', dmg: 4, type: 'staff', magic: 'fire' };
    const out = computeStrike({
      baseAtk: 2,
      weapon: fireStaff,
      strengthActive: false,
      disarmed: false,
      rng: makeRng(1),
    });
    expect(out.messages).toContain('Flames erupt!');
    expect(out.selfHeal).toBe(0);
    expect(out.freezeTurns).toBe(0);
  });

  it('arcane staff heals exactly staffArcaneHeal and logs a message', () => {
    const arcaneStaff: GearItem = { name: 'Arcane Staff', dmg: 4, type: 'staff', magic: 'arcane' };
    const out = computeStrike({
      baseAtk: 2,
      weapon: arcaneStaff,
      strengthActive: false,
      disarmed: false,
      rng: makeRng(1),
    });
    expect(out.selfHeal).toBe(C.staffArcaneHeal);
    expect(out.messages.length).toBeGreaterThan(0);
    expect(out.freezeTurns).toBe(0);
  });

  it('frost staff can freeze for frostFreezeTurns and is otherwise 0', () => {
    const frostStaff: GearItem = { name: 'Frost Staff', dmg: 4, type: 'staff', magic: 'frost' };
    let sawFreeze = false;
    for (let seed = 0; seed <= 200; seed++) {
      const out = computeStrike({
        baseAtk: 2,
        weapon: frostStaff,
        strengthActive: false,
        disarmed: false,
        rng: makeRng(seed),
      });
      // freezeTurns is either 0 or exactly the configured value.
      expect([0, C.frostFreezeTurns]).toContain(out.freezeTurns);
      if (out.freezeTurns === C.frostFreezeTurns) sawFreeze = true;
      expect(out.selfHeal).toBe(0);
    }
    expect(sawFreeze).toBe(true);
  });

  it('non-staff weapons never heal, never freeze, and log nothing', () => {
    for (const weapon of PLAIN_WEAPONS) {
      for (let seed = 0; seed < 50; seed++) {
        const out = computeStrike({
          baseAtk: 2,
          weapon,
          strengthActive: false,
          disarmed: false,
          rng: makeRng(seed),
        });
        expect(out.selfHeal).toBe(0);
        expect(out.freezeTurns).toBe(0);
        expect(out.messages).toEqual([]);
      }
    }
  });
});

describe('computeMonsterDamage', () => {
  it('damage is always >= 1 across many seeds and inputs', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const scaledAtk of [1, 5, 12, 27]) {
        for (const totalDef of [0, 4, 20, 100]) {
          const dmg = computeMonsterDamage({
            scaledAtk,
            totalDef,
            swipe: false,
            rng: makeRng(seed),
          });
          expect(dmg).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('swipe yields exactly double the non-swipe value for the same seed/inputs', () => {
    for (let seed = 0; seed < 100; seed++) {
      const base = computeMonsterDamage({
        scaledAtk: 12,
        totalDef: 4,
        swipe: false,
        rng: makeRng(seed),
      });
      const swiped = computeMonsterDamage({
        scaledAtk: 12,
        totalDef: 4,
        swipe: true,
        rng: makeRng(seed),
      });
      expect(swiped).toBe(base * 2);
    }
  });

  it('higher totalDef never increases damage for the same seed', () => {
    for (let seed = 0; seed < 100; seed++) {
      const low = computeMonsterDamage({
        scaledAtk: 20,
        totalDef: 0,
        swipe: false,
        rng: makeRng(seed),
      });
      const high = computeMonsterDamage({
        scaledAtk: 20,
        totalDef: 80,
        swipe: false,
        rng: makeRng(seed),
      });
      expect(high).toBeLessThanOrEqual(low);
    }
  });
});

describe('isHeavyHit', () => {
  it('any blow at/above absDamage is heavy regardless of target size', () => {
    expect(isHeavyHit(HEAVY_HIT.absDamage, 9999)).toBe(true);
    expect(isHeavyHit(HEAVY_HIT.absDamage + 5, 9999)).toBe(true);
  });

  it('a blow under minDamage is never heavy, even on a tiny target', () => {
    expect(isHeavyHit(HEAVY_HIT.minDamage - 1, 1)).toBe(false);
  });

  it('a mid blow is heavy only if it takes a big fraction of the target', () => {
    // 6 dmg vs a 10-HP target = 60% → heavy; vs a 100-HP target → not.
    expect(isHeavyHit(6, 10)).toBe(true);
    expect(isHeavyHit(6, 100)).toBe(false);
  });

  it('exactly hpFraction of max HP (and >= minDamage) qualifies', () => {
    expect(isHeavyHit(8, 16)).toBe(true); // 0.5 exactly
  });
});

describe('rumbleStrength', () => {
  it('is always within [0.45, 1]', () => {
    for (const dmg of [1, 6, 12, 40, 999]) {
      for (const maxHp of [1, 10, 100]) {
        const s = rumbleStrength(dmg, maxHp);
        expect(s).toBeGreaterThanOrEqual(0.45);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('saturates at 1 for blows at/above the absolute threshold', () => {
    expect(rumbleStrength(HEAVY_HIT.absDamage, 9999)).toBe(1);
    expect(rumbleStrength(HEAVY_HIT.absDamage * 3, 9999)).toBe(1);
  });

  it('bigger blows shake at least as hard as smaller ones', () => {
    expect(rumbleStrength(10, 100)).toBeGreaterThanOrEqual(rumbleStrength(6, 100));
  });
});
