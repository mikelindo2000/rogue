import { describe, expect, it } from 'vitest';
import type { GearItem } from '../types';
import { bestIndex, compareGear } from './gearCompare';

/** Build a defensive GearItem. `current`/`max` drive effective defense and
 *  condition (defaults to a pristine piece). */
function armor(name: string, current: number, max = current): GearItem {
  return { name, def: current, maxDef: max, health: { current, max } };
}

const NONE: GearItem = { name: 'None' };

describe('compareGear (defense)', () => {
  it('treats any real item as a strict upgrade over an empty slot', () => {
    const c = compareGear(undefined, armor('Leather Cap', 2), 'defense');
    expect(c.verdict).toBe('upgrade');
    expect(c.strictlyBetter).toBe(true);
    expect(c.statDelta).toBe(2);

    const cNone = compareGear(NONE, armor('Iron Helm', 3), 'defense');
    expect(cNone.strictlyBetter).toBe(true);
  });

  it('flags a higher-defense, equally-pristine piece as strictly better', () => {
    const c = compareGear(armor('Leather Cap', 2), armor('Iron Helm', 4), 'defense');
    expect(c.verdict).toBe('upgrade');
    expect(c.statDelta).toBe(2);
    expect(c.strictlyBetter).toBe(true);
  });

  it('marks a lower-defense piece as a downgrade, never strictly better', () => {
    const c = compareGear(armor('Iron Helm', 4), armor('Leather Cap', 1), 'defense');
    expect(c.verdict).toBe('downgrade');
    expect(c.strictlyBetter).toBe(false);
  });

  it('is NOT strictly better when effective defense ties but the candidate is more worn', () => {
    // Same effective defense (2), but candidate has more headroom yet worse condition.
    const current = armor('Leather Cap', 2, 2); // cond 1.0
    const candidate = armor('Worn Chainmail', 2, 4); // cond 0.5
    const c = compareGear(current, candidate, 'defense');
    expect(c.verdict).toBe('sidegrade'); // statDelta === 0
    expect(c.strictlyBetter).toBe(false); // condition regressed
    expect(c.durabilityDelta).toBe(2); // max went up by 2
  });

  it('is an upgrade but NOT strictly better when defense rises while max headroom falls', () => {
    const current = armor('Plate', 3, 5); // eff 3, max 5
    const candidate = armor('Chain', 4, 4); // eff 4, max 4
    const c = compareGear(current, candidate, 'defense');
    expect(c.verdict).toBe('upgrade');
    expect(c.strictlyBetter).toBe(false); // max defense regressed
  });
});

describe('compareGear (attack)', () => {
  it('compares weapons on damage alone', () => {
    const cur: GearItem = { name: 'Mace', dmg: 5 };
    const better: GearItem = { name: 'Sword', dmg: 8 };
    const worse: GearItem = { name: 'Dagger', dmg: 3 };
    expect(compareGear(cur, better, 'attack')).toMatchObject({ verdict: 'upgrade', strictlyBetter: true });
    expect(compareGear(cur, worse, 'attack')).toMatchObject({ verdict: 'downgrade', strictlyBetter: false });
  });
});

describe('bestIndex', () => {
  it('returns the highest effective defense, skipping the None placeholder', () => {
    const list = [NONE, armor('Leather Cap', 1), armor('Iron Helm', 3), armor('Cloth', 2)];
    expect(bestIndex(list, 'defense')).toBe(2);
  });

  it('breaks ties on max defense, then condition', () => {
    // Both eff 3; second has more max headroom.
    const list = [armor('A', 3, 3), armor('B', 3, 5)];
    expect(bestIndex(list, 'defense')).toBe(1);

    // Both eff 3, both max 5; first is in better condition.
    const tied = [armor('Fresh', 3, 5), armor('Worn', 3, 5)];
    // identical → first wins (no strict improvement)
    expect(bestIndex(tied, 'defense')).toBe(0);
  });

  it('returns -1 when there is no real item', () => {
    expect(bestIndex([NONE, { name: 'None' }], 'defense')).toBe(-1);
  });
});
